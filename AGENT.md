# Working on ellipog.dev

Conventions for this repository. Read this before changing anything.

---

## The one rule: nothing here is authored here

Every documentation page on this site is written in the repository that owns the mod, and copied in
at build time by `scripts/sync.mjs`. **Do not edit anything under `apps/docs/content/`.** It is
deleted and rebuilt on every build, so an edit there is not lost so much as never applied — and worse,
it is a document that exists in two places, which is the exact failure this site was built to avoid.

If a page on the site says something wrong, the fix is in the mod's repository. The site is a mirror.

The same applies to `apps/docs/manifest.json`: it is a copy of the root `manifest.json`, made because
Next cannot import a module outside its own project directory. Edit the root one.

---

## What is generated, and what is committed

| Path | Status | Why |
|---|---|---|
| `manifest.json` | **committed** | The one place a mod is named, described and ordered. The catalog, the sidebar and the sync all read it. |
| `scripts/sync.mjs` | **committed** | The only thing that writes into `content/`. |
| `scripts/stats.mjs` | **committed** | Fetches both platforms' download counts and the avatar. |
| `scripts/check.mjs` | **committed** | Asserts the built site contains what it should. Run by `bun run build`. |
| `apps/docs/**` | **committed** | The site itself. |
| `apps/docs/content/` | gitignored | Generated. Wiped and rebuilt every build. |
| `apps/docs/manifest.json` | gitignored | Copied from the root by `sync.mjs`. |
| `apps/docs/stats.json` | gitignored | Download counts from both platform APIs, by `stats.mjs`. |
| `apps/docs/public/avatar.*` | gitignored | The profile picture, downloaded by the same script. |
| `apps/docs/.source/`, `.next/`, `out/` | gitignored | Build output. |
| `.cache/` | gitignored | Reserved for git checkouts of mod repositories. See the gap below. |

**A generated tree must be wiped, never merged into.** `sync.mjs` calls `rmSync` on `content/` before
it writes anything. If that ever becomes a merge, a document deleted from a mod's repository will
survive on the site forever — and a stale page is worse than a missing one, because nothing about it
looks wrong.

---

## Adding a mod

1. Add an entry to `manifest.json`. `status: "active"` gets a page; anything else is listed in the
   catalog and gets no link.
2. Make sure its folder exists beside this one, named by `localPath`, with a `README.md`. A mod with
   no README is skipped with a line saying so.
3. Run `bun run build`. The page, the sidebar entry and the catalog cell all follow from the manifest.

There is no step three where you write a page. That is the point.

---

## Where the numbers come from

`scripts/stats.mjs` runs before every build and writes `apps/docs/stats.json`. Nothing on the site is
a number typed into a file.

**Modrinth** needs nothing: `/search?facets=[["author:Ellipog"]]` returns downloads, followers and the
URL for every project in one request.

**CurseForge** is the awkward one — its own API (`api.curseforge.com`) requires a key and there is no
key in this project. So the numbers come from **cfwidget**, a keyless read-only mirror. That is also
where `../beacon` gets them. Three things about it are not obvious and each cost real debugging:

1. **`curl "https://api.cfwidget.com/minecraft/mc-mods/<slug>"` fails with exit 3 on Windows.** The
   shell mangles the URL. Node's `fetch` reaches it fine. Do not conclude the service is down from a
   curl failure — or from the agent's fetch tool returning a 422.
2. **Resolve a project by numeric id, not by slug path.** The two return different payloads. Not
   relevant to a total, but it is why every lookup here goes through `/author/{id}` first.
3. **The author id is needed and cannot be looked up by name.** It is `30254096`, recovered from the
   `members` array cfwidget returns for any of the creator's projects. Beacon's `lib/config.ts` records
   the same number.

**`BP: Origins Edition` is listed by hand.** It is real and public, but cfwidget's author listing does
not return it, so discovery has no route to it and the total is quietly short without it. Its page
prints the exact integer `821` — below 1,000 CurseForge does not round — so that is the number.

Cross-checked against `../beacon/data/snapshots.json`, which records **2,337,541** for CurseForge
against this script's **2,336,720** before the extras line was added, and the 821 difference is exactly
that entry. Two independent implementations agreeing to within one declared gap is the reason to trust
either. If those two numbers ever diverge by anything other than a known gap, one of them is wrong.

---

## Known gaps — true as of the last build, and deliberately not papered over

**1. `sync.mjs` reads sibling folders only. The pinned-commit checkout is not implemented.**
The `.cache/` entry above is reserved for it and the manifest carries a `repo` URL per mod, but the
script does nothing with either: it resolves `localPath` and skips the mod if the folder is absent.
So this site currently builds from whatever is on this machine, not from a pinned commit. That means
it is reproducible *only in the sense that it re-reads* — it is not pinned, and a build here picks up
uncommitted work in a sibling repository. That is convenient locally and wrong for a deployed site.
Forcing it: implement the checkout into `.cache/<mod>/` at `manifest.repo` + a pinned SHA, and prefer
it over `localPath` when a pin is set.

**2. Nothing shows which revision a page came from.**
The mitigation for a stale pin was supposed to be rendering the pinned SHA and its date on each
section page, so staleness is visible rather than silent. That is not implemented, and until gap 1 is
closed there is no pin to show.

**3. The field-reference page from the JSON Schema is not built.**
Deferred with the schema work. `tasked/docs/tasked-quests.schema.json` exists and has real
descriptions in it, and a generated field table would be the only page with substantial content today
— but the format refactor is replacing that schema and adding three per-kind files in a `_schema/`
folder the walker skips, so generating against it now would target a document that is being rewritten.

**4. The regex-free assumptions in `sync.mjs`'s frontmatter handling.**
READMEs are passed through as MDX with no escaping. A bare `<tag>` or `{brace}` in prose would be a
JSX parse error. None of the current READMEs has one; if a build ever fails that way, escape it in
the source README rather than adding a transform to `sync.mjs`, which would then be lying about what
it copies.

**5. The CurseForge listing is not everything CurseForge hosts.**
cfwidget's author listing returns 18 projects; CurseForge's own profile page prints 22. The difference
is recorded in `stats.json` as a `note` on every build rather than silently swallowed, and one of the
four is known and handled by hand — see "Where the numbers come from". The other three are unaccounted
for. If the site's CurseForge total looks low, this is the first place to look.

**6. The Modrinth figure is ~0.16% below the canonical sum.**
`/search` returns an *indexed* `downloads` that lags the per-project endpoint — 296,496 here against
Beacon's 296,975, which sums eleven individual `/project/{id}` calls. One request instead of eleven is
the trade; per-project fetches would close it if exact parity ever matters.

**7. `bun run build` and `bun run dev` must not run at the same time.**
`sync.mjs` calls `rmSync` on `apps/docs/content/` and then rebuilds it. `bun run dev` is watching that
same directory, and deleting a watched folder breaks the watcher's registration on Windows — so the
dev server keeps serving the compile it made *before* the wipe, and the page you are looking at is
older than the files on disk. The symptom is a fix that appears to have had no effect.

This cost real time and is worth recognising: a title dedupe was written into `sync.mjs`, `bun run
build` regenerated `content/`, and the running dev server went on rendering the duplicate while `out/`
was already correct. Two attempts to fix "the bug" were spent on a document that no longer existed.

`out/` is the artifact and has no such history, so it is the way to tell which one you are looking at.
The fix is to restart the dev server after any build.

Making it not happen would mean `sync.mjs` writing somewhere the dev server is not watching, or an
atomic swap of the directory, which Windows does not offer for a non-empty target. Not worth either
for a local annoyance, but worth knowing before it costs an hour.

---

## Running it

```cmd
bun install
bun run build      :: sync, fetch stats, next build, then check
bun run check      :: assert the built site in apps/docs/out is correct
bun run dev        :: sync, then fetch stats, then next dev
bun run sync       :: just the sync, with a log of what it copied
bun run stats      :: just the platform fetch, printing both totals and the avatar path
```

`bun run build` always syncs first and checks last, so there is no way to build a site from stale
content by forgetting a step, and no way to ship one that is structurally wrong without being told.

**What `check.mjs` asserts**, each of these having gone wrong at least once:

- every expected page exists in `out/`
- each docs page renders **exactly one** `h1`, and not the same words twice in a row
- the sidebar carries no home link and no "Docs" heading, while the masthead keeps its own
- the scrollbar rules are in the built CSS, with the standard properties still inside the Gecko guard
- no probe or scratch file has leaked into the repository
- every `selected` project in the manifest resolves to a real platform entry, and the totals add up

It reads `out/`, which is the artifact. It deliberately does not read the dev server — see gap 7 for
why a running dev server is not a witness to anything.

**Use `bun`, not `npm`, and `--filter` rather than `--workspace`.** This is not a preference, it is
the one thing that has actually broken this setup. Bun does not implement npm's `--workspace=<path>`
flag; its equivalent is `--filter <package-name>`. Passing `--workspace` to `bun run` does not fail —
bun forwards the unrecognised flag to the script as an **argument**, so a script that invokes itself
re-invokes itself with the flag appended again, forever, running the sync on every pass. The symptom
is a terminal scrolling with `$ bun run sync … "--workspace=apps/docs" "--workspace=apps/docs" …`
repeatedly, and it looks like a file-watcher loop rather than the script flag it is.

So the root `package.json` uses `bun run --filter @ellipog/docs dev`, and the sync script is run with
`bun scripts/sync.mjs`. `sync.mjs` is plain Node — nothing in it needs bun's runtime — so `node
scripts/sync.mjs` works identically if you prefer.
