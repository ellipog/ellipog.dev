# ellipog.dev

Documentation and project catalog for the ellipog Minecraft mods.

The site is static: a directory of HTML files with no server, no runtime and no database. Every
documentation page is copied from the `docs/` folder of the repository that owns the mod, so nothing
on the site can fall behind the code it describes. **Nothing is written here.**

A mod's `README.md` is deliberately *not* documentation and never reaches this site — it is a front
door for somebody browsing the repository, while these pages are a manual for somebody who has already
installed the mod. Both exist, and they are not the same document.

---

## Running it

```cmd
bun install
bun run build      :: sync, fetch stats, build, then check — into apps/docs/out
bun run dev        :: sync, then a dev server
bun run pins       :: show which pinned commits have moved, and change nothing
```

`bun run build` runs the sync first and the check last, so the two steps cannot come out of order and
a structurally wrong site cannot ship silently.

**Docs come from a pinned commit, not from a branch.** Each mod in `manifest.json` carries a `pin`, and a
build reads the mod's docs from a `.cache/<mod>` checkout of that exact SHA — because on a build server
there are no sibling folders to read. A folder beside this one is preferred when it exists, so a local
server shows your own edits; `ELLIPOG_USE_PINS=1` forces the pin. `bun run pins --write` moves them.

Uses **Bun** 1.3+. Node 22+ also works — Fumadocs needs it, and `.nvmrc` pins 24 — but note that the
scripts use bun's `--filter` rather than npm's `--workspace`, because bun does not implement the
latter and silently forwards it to the script as an argument instead. Running these with `npm run`
will not work as written; see `AGENT.md`.

---

## Layout

    ellipog.dev/
    ├── manifest.json          the author, the studio, the sponsor, the suite (with a pin each), releases
    ├── glossary.json          terms defined once, referenced from any mod's docs
    ├── .github/workflows/     refresh-stats.yml, update-pins.yml
    ├── design/
    │   ├── icons-source/      the five brand SVGs the mod marks are generated from
    │   └── brand-source/      the host's logo, same idea
    ├── scripts/
    │   ├── sync.mjs           checks out each pin, copies docs/ in, wipes the target first
    │   ├── stats.mjs          fetches both platforms' download counts
    │   ├── pins.mjs           moves the pins; dry unless --write
    │   ├── icons.mjs          turns the mod icon sources into monochrome glyphs
    │   ├── brand.mjs          the same for the host's logo
    │   ├── lib/monochrome.mjs the transform both of those share
    │   ├── lib/png-ink.mjs    reads a PNG's size, ink and corners — used by check.mjs
    │   └── check.mjs          asserts the built site is what it should be
    ├── AGENT.md               conventions, the element set, and the known gaps
    └── apps/
        └── docs/              the Next.js + Fumadocs site
            ├── app/
            │   ├── global.css the design language
            │   ├── docs.css   the docs layer: rails, callouts, tabs, steps
            │   └── docs/      the docs routes
            ├── components/
            │   ├── mdx/       the elements a docs page can use
            │   ├── toc.tsx    the contents rail
            │   ├── colophon.tsx  who presents the site, at the foot of every page
            │   ├── shuffled-number.tsx  the one animation on the site
            │   └── …
            ├── lib/           the Fumadocs source, and the docs helpers
            ├── content/       GENERATED — gitignored
            ├── public/        the site mark (tab + masthead), the mod marks, the host's logo
            └── out/           the static build

---

## The design language

White ground, near-black text, and the structure carried entirely by 1px hairlines rather than
containers: no shadows, no gradients, no rounded corners, and dividers that run edge to edge. Prose is
sans, and anything that is an identifier — a mod id, a path, a version — is monospace. Light is the
default; dark is one attribute away on `<html>`.

The rules live in `apps/docs/app/global.css`, and the docs layer adds to them in
`apps/docs/app/docs.css` without breaking any. All of them are commented where they live:

1. **The hairline has a contrast floor.** `#E4E4E7`, not the near-invisible grey the style invites,
   which disappears on a 1080p panel at 100% zoom.
2. **Lines are drawn once, by the element that owns the edge.** A grid of cells each drawing all four
   borders produces 2px seams where two meet.
3. **Colour is earned.** Paper, ink, one green that means "this is where the code is", and one red
   reserved for "this loses data". Hover inverts rather than tints, because an inversion is structure
   and a tint is decoration.
4. **The scrollbar is drawn, not inherited.** A hairline track with an ink fill — a progress
   indicator. The standard scrollbar properties are scoped to Gecko with `@supports`, because setting
   them in Chromium makes it discard every `::-webkit-scrollbar` rule and draw its own bar instead.

**There is exactly one animation**, and it is deliberately the only one: the download figures on the
catalog page shuffle into place on load. The real value is in the static HTML, so it is correct before
JavaScript runs and unchanged when JavaScript is off — see `AGENT.md` → *The one piece of motion*.

---

## How a page gets here

1. `sync.mjs` reads `manifest.json` and wipes `apps/docs/content/docs/`.
2. For each mod with `status: "active"` and a `docs/` folder, it copies **every markdown file under
   `docs/`, at any depth**. The folder structure becomes the URL structure: `docs/guides/tasks.md`
   becomes `/docs/tasked/guides/tasks/`. Frontmatter is prepended and GFM alerts become callouts, so
   the source stays plain markdown. **The README is not copied** — it is a front door for the
   repository, and its reader is not this site's reader.
3. `stats.mjs` fetches download counts from Modrinth and CurseForge and downloads the profile picture
   into `apps/docs/public/`. Both are best-effort: a build with no network still produces a site, and
   a page with no numbers is better than a page with stale ones.
4. Fumadocs compiles the MDX, the sidebar and contents list read what was actually synced, and Next
   exports the lot to `apps/docs/out/` as static HTML.
5. `check.mjs` asserts the result: one title per page, the rails present, the elements rendering, and
   every link in a contents rail pointing at a heading that exists.

A mod with no `docs/` folder is listed in the catalog and gets no docs section, and its catalog cell
stops being a link — so nothing points at a page that does not exist.

---

## Writing documentation

`docs/` files may use callouts, loader tabs, step lists, collapsed detail, linked headings, a contents
rail and copy buttons on code blocks. The full set, with a note on when each one beats plain prose, is
in **`AGENT.md` → Writing documentation**.

---

## Deploying

`apps/docs/out/` is the whole site. Upload it to any static host; there is nothing to configure and
no rewrite rules are needed, because `trailingSlash` makes Next emit `docs/tasked/index.html` rather
than `docs/tasked.html`.

`apps/docs/out/` is what gets uploaded. Nothing in it calls an API at runtime: every download count is
already in the HTML, which is why a visitor costs zero requests.

**Freshness comes from a scheduled rebuild.** Add a Deploy Hook URL as the repository secret
`VERCEL_DEPLOY_HOOK` and `.github/workflows/refresh-stats.yml` calls it twice a day, so Vercel rebuilds
and `stats.mjs` re-fetches. A fetch in the visitor's browser was measured and rejected: cfwidget's author
listing carries no download counts, so it would cost about nineteen requests per visitor. See
`AGENT.md` → *Freshness of the numbers*.

The one thing to know when deploying: **the docs come from the pinned commits in `manifest.json`**, not
from the branches. If a page looks out of date, the pin needs moving — `bun run pins` says which.

---

## The mod marks, and the host's

Each mod has an icon beside its name on the catalog and on its docs section in the sidebar. Five do;
Kindred renders a dashed placeholder, which is the honest treatment for a slot waiting to be filled.

They are **monochrome and inherit the text colour** — ink on paper, paper on ink — so one file works in
both themes. The sources live in `design/icons-source/` and the generated glyphs in
`apps/docs/public/icons/`; both are committed.

The host's logo gets the same treatment, from `design/brand-source/`. Both go through
`scripts/lib/monochrome.mjs`, which strips the background plate, maps the palette to `currentColor` at
ranked opacity, and points the knockouts at a ground token.

**All of them are inlined into the page rather than loaded as images**, and that is required rather than
preferred: an SVG in an `<img>` cannot see the page's CSS, so `currentColor` and the knockouts' ground
variable would both fail to resolve. See `AGENT.md` → *The mod marks*.

```cmd
bun run icons     :: regenerate the mod glyphs from design/icons-source/
bun run brand     :: regenerate the host's mark from design/brand-source/
```

---

## The sponsor band

Every page carries one affiliate arrangement at its foot — BisectHosting, with the code `mcstellar` for
25% off. It is **disclosed as an affiliate link in the row itself**, beside the offer, and its link carries
`rel="sponsored"`, because a paid link that does not declare itself is a link pretending to be a
recommendation. The section also carries `aria-label="Sponsored: BisectHosting"`.

The note used to be an uppercase `SPONSORED` label in the band head. That head sits directly above the
colophon's own `ENGINEERED & MAINTAINED BY` strip, so the two stacked labels read as one heading over both
rows and made the studio look like part of the sponsorship — which is why it moved down into the row it
describes.

The details live in `manifest.json` under `sponsor`; removing that object removes the band, and
`check.mjs` skips its assertions. The generated mark is in `apps/docs/public/brand/`, committed, from
`design/brand-source/`.

The small `Partner` chip beside the host's name is a deliberate wording choice, not a default — it does
**not** say "Verified", because BisectHosting do not confer that status and their own terms are `Partner
Program` and `affiliate`. Change the label in `manifest.json`; `check.mjs` will hold you to whatever is
written there.

---

## Licence

MIT.
