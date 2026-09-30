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

## The README is not documentation

**Only `<mod>/docs/**` reaches this site. The README never does, and that is deliberate.**

They are different documents for different readers and they overlap only a little:

| | README | docs/ |
|---|---|---|
| Reader | somebody who has just landed in the repository | somebody who has already installed the mod |
| Wants | what is this, how do I build it, which jar | how does it work, how do I configure it, what is the file format |
| Lives | the repository front page, on GitHub | this site |
| Format | plain markdown, must render on GitHub | MDX, may use any element below |

A site that mirrors the README shows a build guide to a player. That is what this site did before the
docs refactor — Armature's own README was telling people to edit
`testModsDirFabric=…/profiles/Tasked Fabric/mods`, which is not just the wrong document, it is the
wrong mod. Docs are now written once, for the reader who has the mod installed.

**The consequence, and the reason it is worth the trouble:** because nothing in `docs/` is rendered by
GitHub, there is no compatibility to preserve. Those files may use any element below, with no import
and no fallback.

---

## What is generated, and what is committed

| Path | Status | Why |
|---|---|---|
| `manifest.json` | **committed** | The one place a mod is named, described and ordered. The catalog, the sidebar and the sync all read it. |
| `scripts/sync.mjs` | **committed** | The only thing that writes into `content/`. |
| `scripts/stats.mjs` | **committed** | Fetches both platforms' download counts and the avatar. |
| `scripts/check.mjs` | **committed** | Asserts the built site contains what it should. Run by `bun run build`. |
| `apps/docs/**` | **committed** | The site itself. |
| `apps/docs/content/docs/**` | gitignored | The docs, copied from each mod's repository. Never authored here. |
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

1. Add an entry to `manifest.json` with `status: "active"`, plus `repo` and `issues` if you want the
   footer row on its pages.
2. Give it a `docs/` folder in its repository, beside its README. Subfolders are welcome — the folder
   structure becomes the URL structure.
3. Run `bun run build`. The sidebar section, the catalog cell and the contents list on `/docs/` all
   follow from what was actually synced.

There is no step three where you write a page here. That is the point.

A mod with `status: "active"` but **no `docs/` folder** is listed in the catalog and gets no docs
section — and its catalog cell stops being a link, because `app/page.tsx` derives which mods have
docs from the built pages rather than from the status. A cell that looks like a destination and
404s is worse than a cell that plainly says there is nothing there yet.

If `docs/` exists but has no `index.md`, the sync writes one from the manifest summary. An authored
`index` always wins.

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

---

## The one piece of motion on the site

`components/shuffled-number.tsx` scrambles a figure's digits and settles them left to right, about
300ms, staggered across the three released cells so they read as one gesture. It is used by the hero
total and by each released cell's download count.

It is the only animation in the design, and it is allowed to be the only one. A site whose premise is
that every edge is visible and every line is a hairline does not want things that move; one flourish
on the largest number on the page is a gesture, four would be decoration.

**Three properties make it safe, and all three are asserted by `check.mjs` rather than trusted:**

1. **The real value is in the static HTML.** `useState(value)` means the first render — the one Next
   writes into `out/` — is the true number, and the effect only animates *towards* it on the client.
   JavaScript off, a hydration failure, a crawler reading the file: all of them get a correct number
   that simply does not move. This is the property that must never break, and
   `the hero total is in the static HTML` is the assertion that guards it.
2. **The animated copy is hidden from assistive tech, and a second copy is exposed.** A screen reader
   arriving mid-animation would otherwise announce four digits of noise. The two copies are counted in
   pairs by `check.mjs` — by class, not by `aria-hidden`, because the `Arrow` component is also
   `aria-hidden` and counting that attribute gave 15 against 4 the first time.
3. **`prefers-reduced-motion: reduce` skips it entirely**, and there is nothing to undo because the
   server already rendered the right value.

**The one failure mode it genuinely has, and how it is closed:** a scrambling number must not change
width, or the layout shifts on every frame. The digits are monospace and `.shuffle` sets
`tabular-nums`, so the advance width is constant while the characters change. Without that, a "1"
replacing an "8" drags everything to its right.

Punctuation never scrambles and never locks — a comma flickering into a digit reads as a glitch rather
than as an effect.

---

## Linking and terms, two ways to say something once

Two syntaxes, both resolved at **sync** time rather than at render time. The distinction matters: a
cross-mod link is exactly the kind that rots, because the person writing it cannot see the target, so
an unresolvable one has to be a build failure rather than a broken link somebody notices later.

### Cross-mod links

```markdown
[[armature:index]]              -> [Armature documentation](/docs/armature/)
[[armature:index|the seam]]     -> [the seam](/docs/armature/)
[[tasked:index#where-to-start]] -> the same page, at an anchor
```

Three properties, and each is the reason to use it over a URL:

- **The text is taken from the target's own title**, read at build time. Rename Armature's page and
  every link to it updates itself. Typed text goes stale; a lookup cannot.
- **A link to a page that does not exist fails the build**, naming the file it was found in. The error
  distinguishes "no such mod" from "that mod has no such page", because those are different mistakes.
- **`index` is how you reach a section's front page.** `[[armature:index]]`, or `[[armature:]]`, which
  reads more naturally when the link *is* the section.

A colon means a cross-mod link. No colon means a glossary term — the two can never be confused.

### Glossary terms

```markdown
[[canvas]]              -> the term, with its definition on hover
[[task|Tasks]]          -> the term with your own text
```

Terms are defined once, in `glossary.json` at the site root, and referenced from any mod's docs. **That
file is the one place on this site where content is authored here rather than in a mod's repository**,
and it has to be: a glossary spans mods, so it cannot live in any one of them.

Two things about the implementation that are not obvious:

- **The definition is always in the DOM**, clipped rather than `display: none`. `aria-describedby` can
  only point at something that is in the accessibility tree, so a tooltip injected on hover would be
  announced as nothing at all. Clipping keeps it readable by a screen reader and invisible to the eye.
- **Each term is focusable**, so the definition is reachable by keyboard. A tooltip only a mouse can
  open is the usual reason tooltips are useless.

Every use is collected onto `/docs/glossary/`, and that page is generated by the sync because it needs
a route — but it renders from the same JSON the hover cards read, so the page and the tooltips cannot
disagree.

**The sync reports terms defined but never referenced**, and does not fail on them. The glossary is
partly a reference in its own right, and a term is often added before the page that needs it.

### `[[...]]` is never transformed inside a code fence

Worth knowing because a page documenting the link syntax would otherwise have its own examples
rewritten into links. The transform walks lines and tracks fence state, and both the alerts pass and
the link pass share that state — which is also why they are one pass and not two.

---

## Page furniture

Four small things, each from one place so none can drift.

| Element | Written as | Comes from |
|---|---|---|
| Prerequisites strip | automatic | `manifest.json` — `minecraft`, `loaders`, `version` |
| Maturity marker | `maturity: draft` in frontmatter | the document itself |
| `@since` chip | `<Since v="0.2.0" />` | typed, because there is nothing to look up |
| Repo and issues row | automatic | `manifest.json` — `repo`, `issues` |

**The prerequisites strip** is the one-line `Minecraft 1.21.1 · Fabric + Neoforge · Tasked 0.1.0` under
the title. Nobody should read a page for a version they are not running, and a hand-written "requires
1.21.1" in prose is a fact that goes stale the moment the manifest changes. It disappears entirely for a
mod that has none of those fields.

**The maturity marker** is the only frontmatter a document may set for itself — `draft`, `stable` or
`unreleased`. Everything else is generated, because the catalog, the sidebar and the page have to agree
on a mod's name and the manifest is the one place that is written down. `unreleased` carries the
caution colour, because that is the state a reader most needs to know about before trusting the page.

**It is read from the generated file rather than from `page.data`, and that is not preference.**
Fumadocs applies `pageSchema` to every page and that schema is built with `z.core.$strip`, so an
unknown frontmatter key is silently discarded before anything can read it — `page.data.maturity` is
always `undefined`. Extending the schema would mean importing Zod and pinning a library export its own
docs call version-sensitive, which is a lot of coupling for one string. `tocOf` had already established
reading the generated file for the same reason.

**The `@since` chip** goes inline, in a sentence or a table cell, without disturbing the line height.
Deliberately not a link: there is no changelog page yet, and a chip that looks clickable and is not is
worse than one that states a fact.

---

## Writing documentation

Every element below is available in any `docs/**` file. **Nothing needs an import** — the components
are mapped in `apps/docs/components/mdx/index.ts`, and the two that are written as markdown rather
than JSX (`Callout` and the code block) are rewritten into components by `sync.mjs`.

The rule for all of them: **an element beats plain prose when it says something prose cannot.** A
callout for a fact worth noticing, a table for a set of fields, a step list for a sequence. If a page
is mostly boxes, the boxes have stopped meaning anything.

### Callouts

```markdown
> [!NOTE]
> Something worth knowing that does not change what you should do.
```

Four kinds, and they are not interchangeable — each has a different weight of left edge, and one of
them is the only red on the site.

| Kind | Use it for | Looks like |
|---|---|---|
| `[!NOTE]` | A fact worth noticing. Context, a caveat, a "by the way". | Ink edge, sunken ground |
| `[!TIP]` | A better way to do what the reader was already going to do. | Faint edge — the quietest |
| `[!WARNING]` | Something that will **cost time** if missed. | Heavier ink edge |
| `[!CAUTION]` | Something that **loses data or breaks a world**. | <span class="accent">Red</span> — the only red here |

The syntax is GFM, so a callout still reads correctly in an editor and on GitHub. It is rewritten at
copy time, which means the source needs no import and no JSX.

**Do not** use a callout for a quotation. An ordinary `>` blockquote is a quotation and renders as
one; a callout is a statement by the docs, not by somebody else.

### Code blocks

Ordinary fenced blocks. Every one gets a copy button automatically, because the button is attached to
the `pre` element rather than written per block.

````markdown
```cmd
gradlew deployAll
```
````

The language is only a label — there is no syntax highlighting, deliberately, and the design does not
need it. `cmd`, `properties`, `json` and `java` are the useful ones.

Prefer a code block over inline `code` for anything longer than an identifier. A four-word command
inline is harder to read and harder to copy.

### Loader tabs

For the same command on two loaders. The first tab shows by default, and arrow keys move between them.

```jsx
<Tabs items={['Fabric', 'NeoForge']}>
  <Tab value="Fabric">
    Drop the jar in `mods/` alongside Fabric API.
  </Tab>
  <Tab value="NeoForge">
    Drop the jar in `mods/`. NeoForge needs no companion API mod.
  </Tab>
</Tabs>
```

**Use it only for a genuine either/or.** Two tabs that both have to be read are a list, not tabs, and
the reader loses whichever one they do not click.

### Steps

For a sequence where the order matters and each step needs more than one line — a command, or a
sentence and a command.

```jsx
<Steps>
  <Step title="Build the jar">
    ```cmd
    gradlew build
    ```
  </Step>
  <Step title="Copy it into the profile">
    ```cmd
    gradlew deployFabric
    ```
  </Step>
</Steps>
```

The numbers are generated by CSS, so inserting a step does not mean renumbering the ones after it.

A plain `1. 2. 3.` list is the right shape for anything shorter than this. Do not reach for `<Steps>`
to get numbering — reach for it when a step needs a block inside it.

### Tables

GFM tables. Two forms are common here:

- **Key/value**, for a set of facts about one thing — requirements, a version, a default. Write it as
  two columns and let the header row collapse. `| | |` renders no header at all, which is intended:
  an empty header row would otherwise be two sunken cells with nothing in them.
- **Field reference**, for many things with the same shape — a column per property.

Wide tables scroll sideways inside their own box rather than pushing the page wider.

### Linked headings

Automatic. Every `##` and `###` gets a `#` anchor that appears on hover and is reachable by keyboard,
so a section can be linked from Discord or a pull request. Nothing to write.

### The contents rail

Automatic, from the page's own headings. It appears when a page has **two or more** `##` sections —
a contents list for a three-line page is furniture — and disappears below 1100px, where the left
nav matters more than the right.

Nothing to write, and nothing to keep in step: it is derived from the headings at build time.

### Collapsed detail

For the aside that most readers do not need. Native `<details>`, so it needs no JavaScript and works
with a keyboard.

```html
<details>
<summary>If your profiles are named something else</summary>

Edit these two lines in `gradle.properties`:

</details>
```

**A blank line after the `</summary>`** and a blank line before `</details>`, or the contents are
parsed as raw HTML rather than as markdown.

This is the right place for a "if you are in this unusual situation" caveat that would otherwise
interrupt the main flow.

### Previous and next

Automatic, from the sidebar order, and scoped to the mod — so the last Tasked page does not lead into
Armature's docs. Nothing to write.

### The footer row

Automatic. Every docs page ends with a link to the repository and to its issues, taken from `repo`
and `issues` in the manifest. Add those fields to a mod and its pages get the row.

### Tables of contents and anchors: how they agree

The rail's links and the heading ids are produced by **two different code paths** — the rail from
`getTableOfContents` over the markdown source, the ids from Fumadocs' own remark plugin during the
build. They implement the same slug rule and are expected to agree, but they are not the same
implementation, so `check.mjs` asserts that every link in the rail resolves to a heading that exists.
If a heading ever gets a surprising id, that check is what will say so.

*Gaps 1 and 2 are closed. They are kept here, struck through rather than deleted, because the reasoning
is what stops them coming back.*

**1. ~~`sync.mjs` reads sibling folders only.~~ Closed — the pinned checkout exists.**
This was never a refinement, it was a **deploy blocker**, and it took a clone to see it. A checkout of
this repository on a build server contains `.gitignore`, `AGENT.md`, `apps`, `bun.lock`, `manifest.json`,
`package.json`, `README.md` and `scripts` — and no siblings. So `../tasked` did not resolve, every mod
was skipped, and the sync exited non-zero: **the site could not be deployed at all.**

`materialise()` now checks out `.cache/<mod>` at the SHA in `manifest.json`, fetching that one commit
with `git fetch --depth 1 origin <sha>`. (`git clone --depth 1` cannot check out an arbitrary commit —
depth limits you to a branch tip — but fetching one commit by SHA pulls exactly that snapshot.)

**The sibling folder wins by default, which reverses what this note used to say.** Preferring the pin
when one is set would make a local build hide the edit you are in the middle of, and `bun run dev` would
lie about what you are working on. `ELLIPOG_USE_PINS=1` forces the pin, which is how the CI path is
tested on a machine that *has* the repositories.

**2. ~~Nothing shows which revision a page came from.~~ Closed — the sync names its source.**
Every run prints it: `+ tasked 2 page(s) from f770a37`. That is the mitigation the note asked for and it
cost nothing, because the information was already in hand. A stale pin is now legible rather than
silent — and because a pin is a *decision* rather than a mirror, `bun run pins` moves them and the
weekly workflow opens a pull request rather than committing.

**3. The field-reference page from the JSON Schema is not built.**
Deferred with the schema work. `tasked/docs/tasked-quests.schema.json` exists and has real
descriptions in it, and a generated field table would be the only page with substantial content today
— but the format refactor is replacing that schema and adding three per-kind files in a `_schema/`
folder the walker skips, so generating against it now would target a document that is being rewritten.

**8. `design-preview` is a fixture and should be deleted.**
`tasked/docs/design-preview.mdx` exercises every element above. It exists because the design could not
be judged against two short documents with five code blocks and no lists between them, and it is
**disposable** — the authoring guide (Tasked stage 10) will cover the same ground with real content.
`check.mjs` asserts against it while it is there and skips those assertions politely when it is not,
so deleting it does not break the build.

**9. There is no syntax highlighting, and no search.**
Both were considered and left out. Highlighting is a second renderer, a theme pair and a large
dependency for something the design does not depend on; the language label on a code block is a label,
not a promise. Search is worth having once there is enough to search — at three pages it would be a
box nobody uses, and it costs an index file and a chunk of JS on every load.

**10. The shuffle effect is unverified by eye.**
`ShuffledNumber` is asserted structurally — the static HTML has the true value, the two copies come in
pairs, the figures are fixed-width — but **nobody has watched it run.** The browser tools in this
session have no click or evaluate step, so the animation could only be reasoned about and screenshotted
at rest. It is a forty-line effect with the failure modes above already closed, so the risk is low;
the way to settle it is to load the catalog page and look at it.

---

## The sponsor band

One affiliate arrangement, at the foot of every page: BisectHosting, with the code `mcstellar` for 25%
off. It lives in `manifest.json` like every other fact about the site, and `components/sponsor.tsx`
renders it.

**It says "Sponsored", and that is the only thing here that is not negotiable.** The label sits in the
band's own head, in the same place a section's label goes, and the link carries
`rel="sponsored noreferrer noopener"` — the value search engines expect for a paid link. An affiliate
link that does not declare itself is a link pretending to be a recommendation, and a reader who finds out
later is right to be annoyed. The discount code makes the arrangement obvious anyway, so saying it up
front costs nothing.

**Why its own band rather than a line in the footer.** The footer is the site's colophon: the domain, the
licence, where else the work lives. A paid arrangement inside that list would be posing as one of those,
which is exactly what the label exists to prevent. As a band it inherits the grid the whole page is made
of — a label strip, then content — and reads as one more hairline-separated row.

**Two logos, and CSS picks one.** The site's theme is a `data-theme` attribute rather than
`prefers-color-scheme`, so a `<picture media="...">` cannot switch on it, and one keyed on the system
preference would show the wrong logo to anybody who had overridden the theme. There are two grounds
(paper and ink) and each can be inverted by hover, which is four states, written out longhand in
`global.css`. Less clever than the alternatives and considerably easier to check.

**`width` and `height` are set from the manifest, and they matter more than they look.** Both SVGs declare
a `viewBox` of `243.7 × 81.21` and no dimensions of their own, so without the attributes the box is
nothing until the image loads — and the band, the footer and everything below it shifts down the moment
it arrives. The numbers live in the manifest rather than the component because they come from the files.

**`alt=""` on both.** The link's own text names the host, so an alt describing the image would make a
screen reader say the name twice. It is a decoration beside the word, which is what an empty alt means.

**It is a `<section aria-label="Sponsored">`**, not a `<div>`, so it appears in a screen reader's landmark
list and can be skipped deliberately — which a plain div would not allow.

**Which files are the brand's:** `apps/docs/public/brand/bisecthosting-{light,dark}.svg`, copied in from
`~/Pictures`. They are committed rather than generated, because a logo is not a fact about the mods.

---

## Where the docs come from: a pin, not a folder

Every active mod in `manifest.json` carries a `pin` — one commit SHA. `sync.mjs` reads the mod's docs
from a `.cache/<mod>` checkout of that exact commit when the repository is not present beside this one,
which is every build on a server.

**Two sources, and the local one wins.** A folder beside this one is used if it exists, so `bun run dev`
shows your working copy including uncommitted edits. `ELLIPOG_USE_PINS=1` forces the pin, which is the
only way to test the CI path on a machine that has the repositories.

**Why a pin rather than the default branch.** A deploy should describe a known state of the code. Reading
`main` at build time means two deploys of the same commit of *this* repository can produce different
sites, and a page can change because somebody else pushed — which makes a documentation bug impossible to
bisect. The pin is also what makes the whole thing reproducible: `.cache/` can be deleted at any time and
is rebuilt from the manifest.

**The cost, stated plainly: a pin is reproducible and not automatically fresh.** The site describes the
pin, not the branch, so it updates when the pin moves. That is why `bun run pins` exists, why the sync
prints which SHA it used on every run, and why a scheduled workflow opens a pull request to move them.
A pin nobody bumps is a site that quietly freezes — the failure this arrangement trades against.

```cmd
bun run pins             :: what would move, and nothing else
bun run pins --write     :: bump the pins in manifest.json
```

**Dry by default, deliberately.** It edits a committed file, and a command that rewrites your manifest as
a side effect of being curious about it is a command you learn not to run.

---

## Freshness of the numbers, and why not in the browser

The catalog's download counts are fetched at **build** time by `scripts/stats.mjs` and baked into the
HTML. A scheduled rebuild is what keeps them current.

**Fetching in the visitor's browser was measured and rejected.** Both APIs are CORS-open
(`Access-Control-Allow-Origin: *`), so it would work — but Modrinth answers a whole author in one call
where **cfwidget's author listing returns ids and names with no download counts at all**, so every
project needs its own lookup. That is about **nineteen requests per cold visitor** to move a number that
changes by tens per day, and it would make the numbers change after paint.

**Vercel's own Cron Jobs cannot do this**, and the reason is worth knowing before somebody tries: cron
invokes a route on the deployment, and this site is a static export, so every path is a file and there is
no route that can run code. A **Deploy Hook** is the supported mechanism — it triggers a *build* rather
than a request, which is exactly what a static site needs.

| Workflow | Cadence | What it does |
|---|---|---|
| `refresh-stats.yml` | 06:00 and 18:00 UTC | Calls the Deploy Hook; Vercel rebuilds and re-fetches the numbers |
| `update-pins.yml` | Mondays 03:00 UTC | `bun run pins --write`, then opens a pull request |

**One setup step, once:** create a Deploy Hook in Vercel (Project → Settings → Git → Deploy Hooks, branch
`main`) and add its URL as the repository secret `VERCEL_DEPLOY_HOOK`. `refresh-stats.yml` fails loudly
when it is missing, on purpose — a schedule that stopped working silently is the failure this whole
arrangement exists to prevent.

**Why the pin bump is a pull request and the stats refresh is not.** Moving a pin changes *which
documentation a visitor reads* — a page can gain a section, lose one, or change what it says — and that
deserves a look. Refreshing a download count does not. The two workflows are split along exactly that
line.

---

## Known gaps — true as of the last build, and deliberately not papered over

**4. The alert transform in `sync.mjs` is a text rewrite, and its limits are real.**
`convertAlerts` turns `> [!NOTE]` into a `<Callout>` by walking lines. It handles contiguous `>`
lines, which is how a callout is always written. Two things it does not do:

- **No lazy continuation.** A blockquote paragraph line with no leading `>` ends the callout early,
  and the rest renders as ordinary prose. Cosmetic, not broken.
- **No indented callouts.** The opening line must start at column 0, so a callout inside a list item
  will not transform. It renders as a plain blockquote instead.

Neither is worth a remark plugin. If a second block-level transform is ever needed, that is the point
to reconsider — two text rewrites in a row is a parser being written badly.

**Do not** pass MDX through this as though it were markdown. A `docs/**` file using `<Tabs>` goes
through the same code, and the transform is line-based so it will not touch it — but a `<Callout>`
written by hand in a docs file would be emitted as JSX *and* be rewritten if it happened to look like
an alert. Write callouts as alerts; do not write them as JSX.
**5. The CurseForge listing is not everything CurseForge hosts.**
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
