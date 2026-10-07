# Working on ellipog.dev

Conventions for this repository. Read this before changing anything.

---

## The one rule: nothing here is authored here

Every documentation page on this site is written in the repository that owns the mod, and copied in
at build time by `scripts/sync.mjs`. **Do not edit anything under `apps/docs/content/`.** It is
deleted and rebuilt on every build, so an edit there is not lost so much as never applied — and the
copy is committed (see the table below), so the next build puts the repository's version straight
back.

If a page on the site says something wrong, the fix is in the mod's repository. The site is a mirror.

The same applies to `apps/docs/manifest.json`: it is a copy of the root `manifest.json`, made because
Next cannot import a module outside its own project directory. Edit the root one.

**One file here is authored here on purpose:** the *shared* vocabulary in `glossary.json`. A term more
than one mod needs cannot live in any one of them, so the shared terms stay at the root and each mod
adds only its own — see the glossary section below for the merge and the collision rule.

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
| `scripts/stats.mjs` | **committed** | Fetches both platforms' download counts. |
| `scripts/check.mjs` | **committed** | Asserts the built site contains what it should. Run by `bun run build`. |
| `apps/docs/**` | **committed** | The site itself. |
| `apps/docs/content/` | **committed** | The docs, copied from each mod's repository. Generated — never authored here — and committed so the documentation is readable in the repository as well as on the site. |
| `apps/docs/manifest.json` | gitignored | Copied from the root by `sync.mjs`. |
| `apps/docs/stats.json` | gitignored | Download counts from both platform APIs, by `stats.mjs`. |
| `apps/docs/public/site/*.png` | **committed** | The site's two marks, one per theme — **the tab icon and the OG card draw this pair** — plus `portrait.png`, the masthead's image. The marks are copied by hand from the studio repository; the portrait is exported by `bun run portrait`. See below. |
| `apps/docs/.source/`, `.next/`, `out/` | gitignored | Build output. |
| `.cache/` | gitignored | Reserved for git checkouts of mod repositories. See the gap below. |
| `design/planned/` | gitignored | Mods that are not certain to exist: their deferred `suite` entries, the plan for them, and their icon sources. Nothing here is named on the site or in this repository — see *Planned mods are not published*. |

**A generated tree must be wiped, never merged into.** `sync.mjs` calls `rmSync` on `content/` before
it writes anything. If that ever becomes a merge, a document deleted from a mod's repository will
survive on the site forever — and a stale page is worse than a missing one, because nothing about it
looks wrong.

**`content/` is committed, and that is the one place the repository and the site can disagree.** The
mods are still the only place a page is *written* — an edit under `content/` is wiped by the next
build — but a committed copy can be read on GitHub, and a copy that is out of step is exactly the
stale manual this site exists to prevent, one level down. So the sync rebuilds it on every build and
`check.mjs` refuses to pass when the rebuilt tree differs from what is committed: a pin bump and the
regenerated pages are one commit, not two. Nothing else generated is committed — `manifest.json`,
`stats.json` and `out/` are the same copies nobody would read and everybody would have to keep in
step.

---

## Adding a mod

**The first question is not how to add it but whether it exists yet.** Nothing is listed, summarised or
named on this site until it is certain to ship, and the entries for everything else live in
`design/planned/` — gitignored, and out of the repository for the same reason. Read *Planned mods are not
published* below before adding an entry: an idea that gets named in a public repository is one that has
been published, whatever the page does.

1. Add an entry to `manifest.json` with `status: "active"`, plus `repo` and `issues` if you want the
   source row at the foot of its docs pages.
2. Give it a `docs/` folder in its repository, beside its README. **One level of subfolders is the
   shape**: the folder structure becomes the URL structure, and the rail renders each folder as a
   collapsible group — open when it holds the page being read, closed otherwise. A folder with its own
   `index.md` is called whatever that page calls itself (`api/index.md` titled "The API" is the group
   "The API"); a folder without one takes its humanised name.
3. Define any terms the mod coined in `docs/glossary.json` — optional, and the shared vocabulary in the
   site's root `glossary.json` is read first. `bun run glossary` prints the union.
4. Run `bun run build`. The sidebar section, the catalog cell and the contents list on `/docs/` all
   follow from what was actually synced.

There is no step four where you write a page here. That is the point.

A mod with `status: "active"` but **no `docs/` folder** is listed in the catalog and gets no docs
section — and its catalog cell does not become a destination, because `app/page.tsx` derives which mods
have docs from the built pages rather than from the status. A cell that looks like a destination and 404s
is worse than a cell that plainly says there is nothing there yet. It renders only the links it actually
has: its repository, if the manifest gives it one, and never a `docs` link.

If `docs/` exists but has no `index.md`, the sync writes one from the manifest summary. An authored
`index` always wins.

---

## Planned mods are not published

**A mod is named here on the day it is certain to exist, and not before.** `manifest.json` holds only
`status: "active"` entries, `app/page.tsx` renders an entry only when it is active, and `check.mjs`
asserts both halves — that no entry is anything but active, and that the word `planned` appears nowhere on
the built page. Two assertions rather than one because they are two different mistakes: a page that shows
something it should not, and the idea sitting in a public repository waiting for the next edit to render
it.

**The reason is that a name is already the idea.** "A scale and hitbox API" is a plan whether it is on a
card or in a JSON file, and this repository is public and has been indexed — so a `summary`, a `name`, a
`brand` and a `minecraft` target for something that may never ship is the idea published, not a
placeholder for it. The same goes for the served side: `apps/docs/public/icons/<mod>.svg` is deployed, so
a mark for a mod nobody has announced is a filename anybody can fetch. `design/planned/` is where all of
it lives instead:

| File | What it is |
|---|---|
| `design/planned/suite.json` | The entries deferred out of `manifest.json`'s `suite`, in the manifest's own shape so promoting one is a paste. |
| `design/planned/stack-plan.md` | The design plan for the stack section, which names the same mods. |
| `design/planned/icons/` | The icon sources for the mods that have a mark but are not listed. |

**It is one ignored folder rather than three scattered rules, and nothing in it is read by the build.**
`design/planned/` is in `.gitignore`, which makes the whole arrangement one line to understand and one
line to reverse: promoting a mod means pasting its entry into `manifest.json`, moving its icon from
`design/planned/icons/` to `design/icons-source/`, and running `bun run icons`. `scripts/icons.mjs` reads
`design/icons-source/` non-recursively, so a source left in the subfolder is skipped rather than
regenerated — which is what stops an unlisted mod's mark from quietly reappearing in `public/` and being
deployed.

**This is the arrangement the mod repositories already use for their own plans.** Every one of them keeps
a `plan.md` beside a `.gitignore`, so the working document is on disk and out of git. The site's half of
that is this folder; the difference is only that the site had been publishing its half in the manifest.

**What it costs, stated rather than discovered:** the site's own list of what is coming is now invisible
to anybody who is not on this machine, including a future contributor, and `git log` still carries the
entries that were removed. Removing them from the history is a rewrite of a public repository — a
different operation, and not one to start from here.

---

## Where the numbers come from

`scripts/stats.mjs` runs before every build and writes `apps/docs/stats.json`. Nothing on the site is
a number typed into a file.

**And the build runs on a schedule, not when somebody remembers.** A GitHub workflow triggers a Vercel
rebuild, which re-runs the fetch — *Freshness of the numbers, and why not in the browser* below has the
cadence, the Deploy Hook, and the measured reason the fetch is not in the visitor's browser.

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
300ms, staggered across the three earlier-work cells so they read as one gesture. It is used by the hero
total and by each earlier-work cell's download count.

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
  reads more naturally when the link *is* the section. A subfolder's own `index.md` is reached by its
  folder name — `[[armature:toolkit]]` — and the root's `index` stays the root: every index used to
  claim `mod:index`, so a nested index silently replaced the mod's front page rather than being
  addressable at all.

A colon means a cross-mod link. No colon means a glossary term — the two can never be confused.

### Glossary terms

```markdown
[[canvas]]              -> the term, with its definition on hover
[[task|Tasks]]          -> the term with your own text
```

Terms are defined once, in a glossary file, and referenced from any mod's docs. The **shared** vocabulary
lives in `glossary.json` at the site root — it is read first, and a term more than one mod needs belongs
there, because a glossary spans mods and cannot live in any one of them. A mod may also add
**`docs/glossary.json`** for the terms it coined; the sync merges the shared file first, then each mod's
in manifest order, and `[[term]]` resolves against the union, so a mod *uses* a shared term without
redefining it.

Defining a term two places is a **build failure**, not a silent winner: the same id, or the same visible
word, from two sources stops the sync and names both files. The author cannot see the other file while
writing, and a term that quietly points at somebody else's definition is invisible in the rendered page.
A `see` that names nothing is a failure for the same reason — it is a link between terms.

`bun run glossary` prints the merged list with the file each term came from, for the moment before a
term is written: the union spans repositories, so this is how an author sees all of it without anything
being copied into a mod — a copy would be a second home, stale the moment a term is added.

Two things about the implementation that are not obvious:

- **The definition is always in the DOM**, clipped rather than `display: none`. `aria-describedby` can
  only point at something that is in the accessibility tree, so a tooltip injected on hover would be
  announced as nothing at all. Clipping keeps it readable by a screen reader and invisible to the eye.
- **Each term is focusable**, so the definition is reachable by keyboard. A tooltip only a mouse can
  open is the usual reason tooltips are useless.

Every use is collected onto `/docs/glossary/`, and that page is generated by the sync because it needs
a route — but it renders from the same JSON the hover cards read, so the page and the tooltips cannot
disagree.

**The sync reports terms defined but never referenced**, and does not fail on them — naming the file
each one came from. The glossary is partly a reference in its own right, and a term is often added
before the page that needs it.

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

**The prerequisites strip** is three chips under the title — `Minecraft 1.21.1`, `Fabric + NeoForge`,
`Tasked 0.1.3` — one per fact, from `minecraft`, `loaders` and `version` in the manifest. Nobody should
read a page for a version they are not running, and a hand-written "requires 1.21.1" in prose is a fact
that goes stale the moment the manifest changes. It disappears entirely for a mod that has none of those
fields. The loader names are looked up rather than derived, because capitalising the id gives
`Neoforge` — which is why `check.mjs` asserts the correct spelling.

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
and `issues` in the manifest — its **own** footer, `DocsFooter`, which is not the site's: that one was
removed. Add those fields to a mod and its pages get the row.

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

**8. ~~`design-preview` is a fixture and should be deleted.~~ Closed — it is gone.**
`tasked/docs/design-preview.mdx` exercised every element above, because the design could not be judged
against two short documents with five code blocks and no lists between them, and it was **disposable** by
design — the authoring guide now covers the same ground with real content. `check.mjs` asserted against it
while it was there and skips those assertions politely when it is not, so deleting it did not break the
build. That is what happened, and the reasoning is kept rather than the entry.

**9. There is no syntax highlighting.**
Considered and left out: highlighting is a second renderer, a theme pair and a large dependency for
something the design does not depend on. The language label on a code block is a label, not a promise.
**Search is no longer part of this gap.** It is a Pagefind index — `bun run search`, built into
`out/_pagefind/` — with the palette in `components/search.tsx` and its data layer in `lib/search.ts`. The
index is not fetched on page load: `loadSearch` is warmed on the trigger's first hover, and
`data-pagefind-ignore` keeps the page furniture out of the results.

**10. The shuffle effect is unverified by eye.**
`ShuffledNumber` is asserted structurally — the static HTML has the true value, the two copies come in
pairs, the figures are fixed-width — but **nobody has watched it run.** The browser tools in this
session have no click or evaluate step, so the animation could only be reasoned about and screenshotted
at rest. It is a forty-line effect with the failure modes above already closed, so the risk is low;
the way to settle it is to load the catalog page and look at it.

---

## The catalog's bands, and what they group by

The home page's catalog is grouped by **brand first, and status inside the cell**. Two brand bands —
`Stellar`, the developer suite, and `ellipog`, the gameplay portfolio — plus `Earlier work`, which is the
released addons and packs.

**Brand first, because that is what the architecture says the site is.** Aaen Studios is the parent
engineering mark, Stellar is the developer suite, ellipog is the creator identity the gameplay content
ships under. A reader who arrives for Tasked should see that it belongs to a suite, and the two families
should not be filed together. The bands were status-first before this ("In development" / "Planned"), and
**status did not disappear**: every cell states `in development` in its own footer, which is where a
reader looks after the name. What changed is which question the band answers — *whose is this* before *how
far along is it*.

**`planned` is no longer one of the words a cell can say, because there is no longer a cell that could say
it.** Every listed mod is active — see *Planned mods are not published* — so `in development` is the only
status the catalog renders, and the footer states it rather than deriving it from a field that now has one
value. The status is still what the page filters on, which is the part worth keeping.

**Every suite mod declares its `brand` in the manifest, and `check.mjs` asserts it.** A mod without one
renders in neither band and vanishes from the page without an error — the same class of silent failure as
the `a.grid-cell` selector below, and the reason the assertion exists rather than a convention. The two
band heads are asserted too, so the page cannot quietly stop naming the suite it groups by.

**The two Stellar cells sit three-up**, one row, closed with a filler; the gameplay band renders nothing
at all, because it has no cells — a label, a rule and nothing under them reads as a section that failed
to load, which is the one thing an unbuilt section must not look like. So the page draws a band only when
the manifest gives it an active mod, and the band comes back the day it does. That is the same rule the
stack plan states for empty tiers: **no "coming soon" slots.**

The 2-up band the in-development mods used to get existed for the wide summary, and losing it is this
arrangement's one cost — at three-up those two summaries wrap a line or two further. The trade was taken
because the suite is the thing being shown, and the cells in rows say that better than two bands of two
and four ever did.

---

## The catalog cell, and why it is not one link any more

A cell in the catalog's first band used to be a single `<a>` wrapping everything in it — the cleanest
possible version of "the whole card is a link". **It is a `<div>` now**, because the cell holds two
destinations: the mod's own documentation, and its repository.

**An anchor cannot contain an anchor.** That is not a rule a browser enforces with an error — it closes the
outer one at the inner one, and everything after the nested link silently stops being part of the card. So
the choice is between two links and one target, and the arrangement taken keeps both:

- **`github ↗ · docs ↗`** in the cell's footer row, beside the status — the row that used to carry `docs ↗`
  alone;
- **the docs link stretched over the whole cell** by `.cell-link::after`, an absolutely positioned box
  covering the cell's padding box, so every pixel that went to the docs page before still does.

Where the two would overlap the repository wins one small area, because it is raised above the overlay by a
single `z-index`. Everywhere else in the cell belongs to the docs.

**Three things have to hold for that, and each fails silently on its own:**

| What | If it is wrong |
|---|---|
| `.grid-cell` is `position: relative` | The overlay resolves against the nearest positioned ancestor instead — the page — so every cell becomes a link to its docs from anywhere in the document |
| No hover rule is qualified by the element | They were all `a.grid-cell`, back when every cell that inverted was an anchor. Two of them are `<div>`s now, so `a.grid-cell` matches nothing on that band: no ink ground, and no ink knockouts for the marks. CSS does not report a selector that matches nothing |
| `.pub-cell:not(a)` becomes `:not(.grid-cell)` | `:not(a)` meant "a cell with no destination". It is now *also* true of the two cells that do lead somewhere, so their names go grey while every other rule keeps working — the opposite of the intent |

None of the three produces an error, a warning, or a page that looks obviously broken, which is the whole
argument for asserting them rather than looking at one. `check.mjs` asserts all three, and the two links.

**What it costs, stated rather than discovered:** text inside the cell can no longer be dragged to select
it, because a transparent box is over it. Inside an `<a>` it could. That is the trade the stretched-link
pattern always makes; the alternative is a 40px target for the commonest action on the page, and the cost
is invisible unless somebody tries to copy a summary.

**Both links are derived rather than written.** The repository comes from the manifest's `repo` and the docs
link from what actually synced. A mod with neither is a plain `.pub-cell` that does not invert — the same
rule as before, now applied to a different element.

The two links are also **named per mod**, not left as bare `github` and `docs`. They were `<span>`s inside
one anchor, where the cell's own text was the accessible name and these words were only a signpost for the
eye. As links of their own they need subjects: one identical `github` link per cell down a page is the same
defect as a bare "read more". Each accessible name contains its visible text, which is what label-in-name
asks for.

---

## The sponsor band

One affiliate arrangement, at the foot of every page: BisectHosting, with the code `mcstellar` for 25%
off. It lives in `manifest.json` like every other fact about the site, and `components/sponsor.tsx`
renders it.

**It says it is a paid link, and that is the only thing here that is not negotiable — but *where* it says
so turned out to matter, and that is worth recording.** There used to be an uppercase `SPONSORED` label in
the band's own head, in the same place a section's label conventionally goes. The placement was still
wrong: the band head sits directly above the colophon's `ENGINEERED & MAINTAINED BY` strip, and two small
uppercase labels stacked at the foot of a page read as **one heading over both rows**. The studio's name
ended up looking like part of the sponsorship. A disclosure that misattributes itself is not much of a
disclosure.

So it moved into the row it describes — `Affiliate link`, beside the offer and the code, at the same size
and in the same faint mono as the band's other small print. It reads as a footnote to *this offer* rather
than as a heading, and the claim sits one glance from the thing it is about instead of two.

**Nothing about the declaration was dropped to achieve that**, which is the part to check if this is ever
revisited: the link still carries `rel="sponsored noreferrer noopener"`, the value search engines expect
for a paid link, and the section still carries `aria-label="Sponsored: <host>"` — so a screen reader gets
a name for the region and a crawler gets the relationship, neither of which depends on the layout that
caused the misreading. `check.mjs` asserts all three: the note is in the row, no `>Sponsored<` element
text is left above it, and the landmark still names itself.

**Why its own band rather than a line in the footer — and it is no longer the last row on every page.** It
was given its own band because the footer was the site's colophon: the domain, the licence, where else the
work lives. A paid arrangement inside that list would be posing as one of those, which is exactly what the
disclosure exists to prevent. As a band it reads as one more hairline-separated row, and the colophon
follows it — so the site's last word is its own voice rather than a paid one.

**The band is one row now, and it used to be two.** A head strip carried the host's name and its
`Hosting partner` chip above the link. It went for two reasons: it cost a full band of height to write the host's name a
second time, when the mark's own wordmark at the left of the row already says it; and the chip belongs
beside the thing it qualifies rather than above it. The chip is now in the row, next to the tagline, and
the band is about half its former height.

`check.mjs` asserts the head strip is **absent** — the one assertion here that exists to stop something
coming back rather than to prove something works. Reinstating a second bar is precisely the change a later
edit would make without noticing that a head strip above the colophon was what caused the disclosure
misreading in the first place.

**The footer is gone, and the band stayed a band anyway.** It read `ellipog.dev` (with a green liveness
dot) in one cell and then the two platform links and `Docs` in another — and every one of those was
already somewhere better: the masthead's own nav carries the same links on every page, the catalog's
"Elsewhere" band carries the two platforms with a handle each, and the domain is the address the reader is
already at. A row that repeats a row is furniture. The band is unchanged by that, and the arrangement it
was built for is now stronger rather than weaker: the thing it must not do is sit in a list of the site's
own facts, and there is no longer a list for it to sit in.

**One consequence, stated rather than discovered later:** below 700px the masthead hides `.nav-secondary`,
so the two platform links lived in that footer on a phone. They are now in the catalog's "Elsewhere" band,
which is on the home page and not on a docs page — a docs page at that width carries its own per-mod
`Source` and `Issues` row instead, which is the more relevant pair.

**The band used to be the last thing on the page, and it no longer is.** The colophon below it — who
engineers and maintains the site — was added afterwards, and that is an improvement rather than a complication: the page
now ends in the site's own voice instead of on a paid row, and the band is no more part of that signature
than it was part of the footer. `check.mjs` asserts the band sits *above* the colophon, which is the
relationship that matters, rather than that it is last — so adding a row below the colophon later does not
fail the build.

**The mark is inlined, and monochrome, and it used to be neither.**

`BrandMark` renders it inline rather than as an `<img>`, for the same reason the mod icons are: the glyph
takes its ink from `currentColor` and its knockouts from `var(--icon-ground)`, and an SVG in an `<img>` is
a separate document that **cannot see the page's CSS**. The ink would fall back to black and the hexagon's
interior would fill in solid — and it would look correct in light mode, which is exactly why it is not
something to judge by eye.

**That replaced two files and four rules.** There was a `-light.svg` and a `-dark.svg` — the same artwork
recoloured — plus `[data-theme='dark']` and `:hover` selectors switching between two `<img>` elements.
Four states, written longhand, because the theme is a `data-theme` attribute rather than
`prefers-color-scheme` and a `<picture media="...">` cannot see it. Once the mark takes its colour from the
page there is one file and nothing to switch.

**Three things in the source needed handling that the mod icons did not:**

| In the source | Why it matters |
|---|---|
| A `<style>` block with `.cls-1` / `.cls-3` | An inline SVG's styles are **document-scoped**. Inlining it with the block intact leaks `.cls-1 { fill: #000 }` into the whole page |
| `#000` **and** `#0d1129` | Luminance 0.000 and 0.006 — two blacks the artwork means as *one* value. Per-colour ranking splits them into a black wordmark and a grey hexagon |
| `#03ddff` | Not a tone: it fills the hexagon's **interior**, with the ink brackets drawn on top. As a grey it gives a muddy middle; as the ground it gives ink mark, paper interior, ink detail |

The shared transform (`scripts/lib/monochrome.mjs`) clusters colours within a luminance distance before
ranking, so the two blacks share the darkest rank. The threshold is **0.02** — small enough that Armature's
genuine facet tones (`#0f172a` and `#334155`, 0.043 apart) stay distinguishable, large enough that the
brand's blacks merge. Both callers state it; neither relies on the default.

**`width` and `height` come from the manifest**, and they matter more than they look: the SVG declares a
`viewBox` of `243.7 × 81.21` and no dimensions of its own, so without the attributes the box is nothing
until it parses and the band and everything below it shifts. The numbers live in the manifest
because they come from the file rather than from a design decision, and `BrandMark` derives the width from
them rather than from its own `height` prop.

**No `alt` is needed** — the `<svg>` is `aria-hidden`, and the host is named in text twice over regardless:
the CTA carries its domain, and the section's own `aria-label` names it. It used to be `alt=""` on two
`<img>`s for the same reason.

### The trust mark, and why it does not say "verified"

A small chip sits beside the host's tagline: a tick and one word, hairline-bordered, 9px — smaller than
anything else on the page, and deliberately the quietest thing in the band. The same construction as
`.maturity` and `.since`, so it reads as one of the site's own chips rather than a badge imported from
elsewhere.

**The wording is `Hosting partner`, and it was `Partner` alone until it was read beside the tagline it
qualifies.** `Minecraft server hosting` next to `PARTNER` says what the host does and that there is some
arrangement — but not what the arrangement is *about*. Partner of what? The chip's job is to name the
relationship, and one word could not: the tagline names the host's business, so the chip has to name the
other half. `Hosting partner` carries both.

**Two alternatives were rejected, and both are worth keeping on the record.**

`Infrastructure` names a category this arrangement is not. BisectHosting is somewhere a server can be run,
which is neither what the chip is doing in that row nor a claim the arrangement supports — and a label
that makes the arrangement sound *larger* than it is is the same fault as one that makes it sound better
than it is.

`Verified` / `Verified partner` is the one to keep out entirely. BisectHosting run a
[Partner Program](https://www.bisecthosting.com/partnerships) and, separately, an **Affiliate Program** —
the self-serve one that issues a unique link and a discount code, which is what `mcstellar` is. Those are
not the same thing, and **neither of their pages uses the word _verified_**. Putting it on the site would
assert a status the host does not confer, and a trust mark that overstates is worse than no mark at all:
it is the one kind of claim a reader is entitled to take literally.

This is the same instinct as `rel="sponsored"` and the "Affiliate link" note. The arrangement is real, so
saying so costs nothing and inventing more than the arrangement supports is the thing to avoid.

**The label lives in `manifest.json`** under `sponsor.badge`, so the wording is one edit and the page
cannot drift from the data. `check.mjs` asserts five things about it: that it renders, that what renders
matches the manifest, that it contains no "verified" — so the choice is recorded rather than merely made
once — that the head strip it used to sit in is gone, and that it follows the row into the hover inversion.

**It sits inside the link now, and it used to be asserted out of it.** The old rule was that a badge inside
an `<a>` is one the reader can click, which would make a decoration behave like a destination. That was
true of a *head strip* — a place the reader was not already clicking. With the strip gone, the chip is part
of the row that is itself one link to the host, so it adds no click target and no second destination: every
pixel of that row already navigates there. The assertion was replaced rather than deleted, and by the one
that makes the placement deliberate — that the head strip is absent — because what changed is the old
rule's premise, not its spirit.

**It needs a hover state now, and that is not decoration.** The row inverts beneath it, so a colour that
stayed put would be faint-on-ink on a near-black ground: invisible rather than merely wrong, and easy to
miss because the resting state is correct. `check.mjs` asserts that override separately from asserting the
chip renders, because the two failures look nothing alike.

**It is a `<section aria-label="Sponsored: <host>">`**, not a `<div>`, so it appears in a screen reader's landmark
list and can be skipped deliberately — which a plain div would not allow.

**Which files are the brand's:** the source is `design/brand-source/bisecthosting.svg` (the light variant,
committed — the dark one was the same artwork recoloured and is gone), and the generated glyph is
`apps/docs/public/brand/bisecthosting.svg`. Regenerate with `bun run brand`.

---

## The mod marks

Every listed mod has an icon, and **a mod with none renders a dashed placeholder** rather than nothing.
That is handled rather than hidden, and it is the one path left over from when an unlisted mod was drawn
here: the sources for marks belonging to mods that are not certain to exist live in `design/planned/icons/`
and are never generated or deployed — see *Planned mods are not published*.

**Where they come from.** The design sources are committed at `design/icons-source/<mod>.svg` — brand
assets, clearly not build output and clearly the input to something. Committing them matters: a
transform whose input lives in somebody's pictures folder is not a transform, it is a one-way door, and
the day an icon needs changing there would be nothing to change it from.

**The transform is `bun run icons`**, and it does three things, each of which was a decision:

| Decision | Why |
|---|---|
| **The background plate is removed**, not recoloured | A full-bleed rect in a glyph is the plate the mark sat on. Recolouring leaves an invisible element behind, and on a design whose premise is that every edge is visible, shipping an element that does nothing is the wrong instinct. Identified by *size*, so a white rect that is part of the mark survives |
| **Tones become `currentColor` at ranked opacity** | "Black and white" could mean two values, and that would lose the second tone giving each mark its depth. A grey is black at 45%, so opacity keeps the glyph strictly monochrome while preserving structure — and it inherits: ink at 45% on paper, paper at 45% on ink. Opacity comes from **rank**, not a luminance formula, because rank is predictable across files |
| **White becomes `var(--icon-ground)`** | Remaining white is a knockout or a highlight across a solid shape — in both cases it means "whatever is behind me shows through". `transparent` would be wrong the moment a white shape overlaps a coloured one, which several do |

Plus two cleanups: **vestigial glows deleted** (every source carries one shape at `opacity 0.04–0.08`, a
flat-design shadow that contributes nothing at any size) and **accents floored at 0.45**, because the
contact sheet showed the original `0.3` accents vanishing as the glyph shrank.

**`--icon-ground`, not `--bg`, and that is not pedantry.** The catalog's cells invert on hover: their
ground becomes `--inv-bg` while `--bg` carries on meaning the page behind everything. A glyph in a
hovered cell would knock its holes out in paper on an ink ground — a colour that is not behind it. The
token is set by `.mod-icon` and overridden where the ground inverts.

**Inlined, not an `<img>`, and this is the load-bearing part.** An SVG in an `<img>` is a separate
document with **no access to the page's CSS**, so neither `currentColor` nor `var(--icon-ground)` would
resolve — the icons would be black on a dark page and their knockout detail would vanish. It would look
perfectly fine in light mode, which is exactly why it needs an assertion rather than an eye.

**The placeholder is a slot**, the same size as the real marks, and it stays in `ModIcon` for the mod that
is listed before its mark exists. A row with nothing shifts left and reads as a mod that is somehow
different from its neighbours; a slot reads as one waiting to be filled. The same instinct as a Modrinth
link that is typed but not yet live: show the gap, do not hide it. `check.mjs` counts the placeholders
against the manifest, so it reads 0 today and stops being silent the day it is not.

**Two files that must not drift:** `design/icons-source/` and `apps/docs/public/icons/`.
`check.mjs` asserts every generated glyph has a committed source, that none contains a hex colour, and
that no icon reached the page as an `<img>`.

---

## The site's own mark, and the jobs it still does

The pair in `apps/docs/public/site/` — `mark-on-light.png` and `mark-on-dark.png` — is the studio's mark:
two PNGs, one per ground, hand-supplied and copied here from the studio's own repository, which this build
has no route into. **Two callers on the site draw it**: the tab icon, which names both files with a `media`
query each, and the OG card, which is always drawn on a light ground and so reads the light one. The
masthead used to draw the pair beside the wordmark; that slot carries the author's portrait now, and the
colophon signs the studio with the studio's other pair. Both have their own sections below.

| File here | Ink | Luminance | Is the mark for |
|---|---|---|---|
| `apps/docs/public/site/mark-on-light.png` | `#000000` | 0.0000 | a **light** ground |
| `apps/docs/public/site/mark-on-dark.png` | `#ffffff` | 1.0000 | a **dark** ground |

**The names describe the ground, and a swap is invisible.** Dark ink on the dark ground is a mark the same
colour as the page behind it, so it reads as *absent* rather than as wrong, and the natural response is to
add a fallback for a mark that is already there. That is why `check.mjs` decodes both files and asserts
which ink each one is drawn in.

### Why two files, when every other mark is one

**A raster cannot take `currentColor`, so the arrangement the other marks use is not available.** Every
other mark on this site is a vector mapped to `currentColor` at build time and inlined, which is exactly
what lets *one* file work on either ground — and inlining is also the only way a glyph can read
`var(--icon-ground)` for its knockouts, since an SVG in an `<img>` cannot see the page's CSS. A PNG has its
colour in its pixels and no CSS reaches into them. Two files is the honest consequence, and inlining a
base64 PNG would gain nothing while costing a third more bytes again.

**A favicon cannot read `[data-theme]`, so the pair is also the tab's only possible switch.** `layout.tsx`
names both files under `icons.icon`, each with a `media` query, resolved before first paint from the same
OS preference the theme toggle falls back to — a `<link>` has no styles and cannot be told which file to
fetch. That it does not follow the toggle is a small permanent inconsistency, stated in the tab section
below rather than left to be found as a bug.

**Neither file has a plate, and neither was given one by a transform.** They are exported on a transparent
ground — all four corners fully transparent, which `check.mjs` asserts rather than assumes. That is worth
noting because it is the one thing the *other* SVGs here need handling for: the host's logo and every one of
the mod marks are drawn on a full-bleed tile, and there is a transform whose job is to strip exactly that. A
file re-exported with its background baked in puts a rectangle of a second paper colour behind the glyph,
which reads as the page behind being slightly the wrong colour rather than as a mistake.

### The masthead slot: what it has carried, and what it carries now

Its first occupant was a build-time download of the account's profile picture — the Modrinth avatar — and a
mark pair took the slot after that. The three things wrong with the download are worth keeping, because
each was a real defect and each shaped what replaced it:

| What was wrong | Why it mattered |
|---|---|
| A photograph of a person, standing in for a site | It is not the site's identity. The studio's marks are. |
| No dark variant | It was the only mark on the page that did not adapt, because a photograph cannot. |
| It could *go missing* | A failed fetch produced a **different masthead**, silently, on that build only. Every other mark here is a committed file that cannot fail to download. |

The slot carries the author's portrait now — the drawing that is the profile picture on every platform, on
the argument that it is what the name looks like. On each of the three counts above it is a different
arrangement rather than the old one, and that is the point:

- **It stands beside the name, not in for the site.** The marks still do the site's jobs — the tab, the
  link card, the studio's signature in the colophon — and the portrait appears nowhere else.
- **It needs no dark variant, because its variant is transparency.** The colours are the drawing, so no
  file swap can help it on the other ground; the background was cut away instead, and the one file reads on
  either paper. Both halves of that are asserted: the export's four corners are transparent, and no
  `[data-theme]` rule reaches for it.
- **It is committed under `public/site/`**, exported by `bun run portrait`, so it cannot fail to download.

**One property of the artwork, stated rather than discovered:** the drawing is pale — a white plugsuit on
the white it was supplied on — so the lower half of the figure sits soft on the light ground. It is legible,
and it is the drawing the author chose; the alternative was a plate, and no mark on this site has one.

### The portrait's chain: the matte, the export, the guards

`apps/docs/public/site/portrait.png` is exported by `scripts/portrait.mjs` (`bun run portrait`) from
`design/portrait-source/rei-ayanami-cutout.png` — the artwork with its background removed, committed as the
source. The matte was made once, by hand, with `rembg`'s `isnet-anime` model; the command is recorded in the
script's header, and the supplied JPEG stays wherever it came from. That is the same shape as every source
chain here: one hand-supplied step at the top, everything below it reproducible.

The export is a 168px square — six times the 28px box — with the drawing trimmed to its ink, fitted to
**95% of the canvas** and centred. The mark's 78% was cut to the weight of the wordmark; an avatar fills its
slot, and this is one. `check.mjs` asserts the squareness, the transparent corners, the footprint, that the
source is committed, and that the build copied the export through unchanged.

### The tab icon is the same pair, and it got lighter

`layout.tsx` names both files under `icons.icon`, each with a `media` query — `(prefers-color-scheme: light)`
for the dark-ink file, `(prefers-color-scheme: dark)` for the light-ink one. **A favicon cannot read the
`data-theme` attribute the page paints with**, so a media query is the only lever a `<link>` has. It is
resolved before first paint, from the same OS preference the theme toggle falls back to.

**It does not follow the toggle.** A reader who has overridden their OS preference gets a tab matching their
OS and a page matching the toggle, and the two disagree. There is no fix — a `<link>` cannot be styled — so
it is a small permanent inconsistency, stated here rather than left to be found as a bug.

**The light-ground file is listed last, deliberately.** A consumer that ignores `media` — anything before
Safari 15, and some crawlers — takes the last icon it can use, so the dark-ink file becomes the accidental
default. The failure mode is a mark on the wrong ground rather than no mark at all, which is the one to
prefer.

**What that replaced, measured.** The file it replaced was `public/favicon.svg`: the *same drawing* — an eye
over an A-frame — hand-built as an ellipse and two legs, with 2.4px strokes on a 64px viewBox and a
`#f3f1ec` plate behind them. The mark it was replaced *with* carried a median stroke of 21px on 879px —
**3.75% against 2.39%**, so at a 16px tab the line went from 0.6px to 0.38px — **about 1.6× finer, and
sub-pixel** — with mean ink coverage of 6.7% either way. Since 2026-10-01 the drawing itself is the
stellar mark (mean ink coverage 9.0% of the box), and the trade is the same one, made again on purpose.

So on a 1x display the tab reads as a light grey glyph rather than a solid tile. At 32px — a 2x display,
which is most of them — the drawing resolves cleanly. The shape was checked by rendering the alpha channel
to ASCII at both sizes rather than by eye, because no screenshot in this session can produce a 16px favicon
to look at. **The trade was one drawing for the tab and the masthead instead of two, at the cost of a
thinner line in the tab** — the masthead has since moved to the portrait, and the tab keeps the drawing.
The plate is no loss: every other mark on this site is drawn on whatever it stands on, so a plated favicon
was the one that did not match.

### What is guarded, and what is not

**The copies' source is the one thing without an assertion.** The pair is copied by hand from the studio's
repository — a checkout this build has no route into — so there is nothing to regenerate them from and
nothing to diff them against. (The stellar sources in `design/brand-source/` belong to a *different* mark,
the Stellar modpack's, exported by `scripts/mark.mjs` to `public/brand/` and not drawn on the site yet, so
they are not this pair's guard.)

What `check.mjs` proves is everything short of that:

- both files are committed, and the build copied each through **unchanged** — the only thing standing
  between "the two repositories agree" and "they agreed the day this was written"
- the tab names both files with a `media` query each, in the order that leaves the visible one as the
  fallback for a consumer that ignores `media` — and no CSS rule fetches the pair any more, which is the
  assertion that keeps the masthead from drifting back into a rule for it
- nothing is left at `/favicon.svg`, which a browser asks for by itself — a leftover there would win the
  tab in some browsers and lose it in others, depending on the reader
- the geometry: both marks are one size, draw the same shape in the same place, and neither carries a plate
- **which ink each mark is drawn in**, which is the swap described above

**`scripts/lib/png-ink.mjs` is what makes the last two possible** — ~170 lines that decode a PNG's header
and scanlines to report its size, its ink colour and its corners. It is the only thing in this repository
that parses an image rather than an SVG, and for this pair it is a **reader, not a transform**: nothing here
rewrites the art, because the files are used exactly as the studio exports them. That is deliberate — it is
what keeps the copies diffable against that repository by eye, and it is why the 90px inset is *not* cropped
away despite making the box sizing arithmetic unavoidable. A crop would buy a tidier number at the price of
a file that is no longer the studio's. (The portrait is read by the same reader for the same class of
invisible properties — its corners and its footprint — but it *is* a derived export; `scripts/portrait.mjs`
is its transform, and the source it reads is committed.)

It is also why no hash of the files is recorded. A SHA would catch the swap in two lines, but it would
fail on a harmless re-encode and would say *changed* rather than *what* changed. The assertions are about
the drawing, which is the same choice the rest of `check.mjs` makes: it asserts "the glyph is monochrome",
never "the glyph is these bytes".

---

## The tab title

`ellipog.dev` on the home page, and `ellipog.dev | <page>` everywhere else — the site first, because a
reader with a dozen tabs open is looking for the *site* before the page, and a tab truncated at twenty
characters still says which site it is.

**The template was dead code until this was wired up, and that is the part worth remembering.** The root
layout has carried a `title.template` from the start — `ellipog.dev | %s`, built from `SITE.title` since
the metadata work below — and **no page ever set a title** —
no `metadata.title` export and no `generateMetadata` anywhere in the app. So `%s` was never substituted and
every page rendered the bare default: the home page, the docs index, both mods' pages, the glossary, and the
404.

**A dead template is invisible from the built HTML**, because the default it falls back to is a plausible
title for every page at once. Nothing about `out/index.html` or `out/docs/tasked/index.html` looked wrong.
So `check.mjs` asserts the thing that was actually false — **that a docs page's title differs from the home
page's** — rather than only that the home page says `ellipog.dev`, which was true before and after.

`app/docs/[[...slug]]/page.tsx` is now the one place that supplies the `%s` the layout wraps.

**A sub-page is qualified with its mod; a section front page is not.** `Design preview` on its own is a tab
that could belong to any site, so it becomes `Tasked — Design preview`. `Tasked documentation` already
names Tasked, so prefixing it would give `Tasked — Tasked documentation`.

The test is whether the title **already contains** the mod's name, rather than whether the page is a
section index. So a section front page retitled `Overview` picks up its mod automatically instead of
quietly losing it — the same trap `sectionOf` and `tocOf` each document once already in this app, where a
rule that holds for today's five files stops holding the first time one is renamed.

`—` rather than a second `|`, because the pipe already marks the boundary between the site and the page, so
a repeat would read as another peer of the site's name rather than as a qualifier of the page's.

**The masthead wordmark is still `ellipog`, and that is deliberate** — it sits directly above the page's
own subject matter in a space where the `.dev` is redundant, and the title is the one place the domain
needs to be spelled out. Change one and think about the other.

**One consequence of the 404, noted rather than fixed:** Next's own not-found injects a `<title>` of its own
alongside the metadata outlet's, so `out/404.html` ships **two** `<title>` elements. Browsers use the first,
which is the site's, so the tab reads correctly. Fixing it means replacing the not-found page, which is a
bigger change than a title is worth.

---

## The head beyond the title

Four things share one job — telling a machine what this site is — and all of them read their facts from
`apps/docs/lib/metadata.ts`, which reads the domain from `manifest.json`. That is the point rather than
a detail: the canonical links, `robots.txt`, `sitemap.xml` and the share card each need the answer to
"where does this site live", and four independently typed answers is four chances to be the one that
did not move.

### Canonical, and the trailing slash

Every page emits `<link rel="canonical">` for its own URL, built by `absoluteUrl()` — which appends the
trailing slash that `trailingSlash: true` gives the export. `/docs/tasked` and `/docs/tasked/` are two
URLs to a static host, and the canonical is what says which one is the page.

### `robots.txt` and `sitemap.xml`

Both are generated at build time, both carry `dynamic = 'force-static'` because the export has no server
to run them. `robots.txt` allows everything and names the sitemap: there is nothing here that is not
meant to be found, and the one page a crawler should skip — the 404 — already says `noindex` of its own.

The sitemap is derived from `source.getPages()`, the same loader the docs route builds from, so it
cannot list a page that was not built or miss one that was. `check.mjs` walks `out/` and asserts the two
sets are equal, which is what makes that a property rather than an intention.

**No `lastModified`, no `priority`, no `changeFrequency`.** The build knows the day it ran and nothing
finer, and stamping every page with it would tell a crawler that all six pages changed this morning,
every morning. The other two fields are ignored by the engines that read the file.

### The share card

`/og.png` is a route (`app/og.png/route.tsx`) that renders a 1200×630 PNG with `next/og` at build time:
the site's own mark, the wordmark, `SITE.description`. It appears in link previews and nowhere on the
site — nothing about it changes how a page looks.

**Three things about it were learned the hard way, and all three are the same lesson.**

1. **A file convention was tried first and failed quietly.** `app/opengraph-image.tsx` attached the
   image to the home page only. Every page under `/docs` sets its own `openGraph` (title, url), and
   Next **replaces** `openGraph` rather than merging it — so the injected image was dropped on five of
   the six pages, every one of which still looked correct. The card is named in `social()` now, the one
   helper every page asks, and `check.mjs` asserts `og:image` on every emitted page rather than on the
   home page alone.
2. **The convention's output had no file extension** (`out/opengraph-image`), which leaves its content
   type to the host's guess. `/og.png` is served as an image because of its name.
3. **The colours are read out of `global.css` at build time**, not typed into the route — a hex here
   would be a second place a colour lives, and this site's colours live in the stylesheet's tokens. A
   missing token **throws**, because a card quietly painted `undefined` is a failure that ships.

**Its fonts are `next/og`'s own, and that is a knowing compromise.** The site uses system font stacks
deliberately — no build-time font fetch, so the build works offline — and there is no font file in the
repository to hand Satori. Committing one for the card alone would be a dependency the site's own
typography does not have.

### What the home page says it is

One `application/ld+json` block, two nodes: `WebSite`, and `Person` whose `sameAs` is the manifest's own
author links plus the GitHub profile the page already shows. Deliberately **not** a `SoftwareApplication`
per mod — a rich result for software is built from ratings or an offer, and inventing either would be
marking up claims nobody made, the same judgement the sponsor's badge makes about not saying "verified".

### Accessibility, the invisible half

`<main class="docs-body">`, an `aria-label` on each of the two navigation regions, an `aria-label` that
names the new tab on the masthead's two external links (the only external links with no `↗` to say so),
and a `prefers-reduced-motion` rule that neutralises the CSS transitions. **None of it changes a pixel
for a reader who has not asked for anything** — the last one only affects a reader who has set the
preference, which is what it is for.

**A skip-to-content link is deliberately absent.** It is the one accessibility feature that has to draw
itself, which puts it outside the "nothing may change how the site looks" rule this set was chosen
under. It is three lines the day that rule changes.

**`www.ellipog.dev` does not resolve, and is not supposed to.** No DNS record and no redirect should be
added: one address, one canonical. Recorded here so it is not "fixed" later.

---

## The colophon, and why it is not the footer coming back

The last row on every page: the site's mark, `ENGINEERED & MAINTAINED BY Aaen Studios`, and the domain at
the far end, all one link to `aaenz.no`. It lives in `manifest.json` under `studio` — `label`, `name` and
`url`, with the domain shown on the page **derived from the URL** so the two cannot disagree — and
`components/colophon.tsx` renders it.

**It is below the sponsor band, which is a change in the band's role rather than in the colophon's.** The
band was placed so it would not read as part of the site's own colophon, and it used to be the last thing
on the page because nothing followed it. Now the site signs off in its own voice and the band is second
from the bottom. Neither fact is weakened: the band is still its own band, and a paid row is no longer the
last word on any page. `check.mjs` asserts the band sits *above* the colophon.

**THE TEST FOR A ROW LIKE THIS IS ONE SENTENCE: does it say anything the page does not already say
somewhere else?** The footer removed from this site failed that — it repeated the masthead's own links,
which is why it read as furniture. This row passes it, and the assertion enforces the test directly rather
than by inspecting shape: **the platform domains must appear nowhere inside it.** That is the specific
thing that was wrong with the footer, and the specific thing a future edit would put back if it treated
this as a footer to fill up. The class is `.colophon` and never `.footer`, so the old name cannot quietly
return either.

**A `<footer>` element, while `.footer` stays retired.** The element is the right one — it is the page's
footer and it forms the `contentinfo` landmark, so a screen reader can jump to it — and an `aria-label`
names that landmark. What was wrong with the old row was its contents, not its semantics.

### The mark in it follows the ground, and that needs two rules

It renders `<span class="colophon-mark">` from the studio's `aaen` pair rather than the pair the tab names,
and its theme comes from the `[data-theme='dark']` rule beside its own base rule. (The masthead's portrait
sidesteps all of this: one transparent file covers both grounds, and the masthead does not hover.) **The
hover is where it gets interesting.** The row is a link, and a link inverts here rather than tinting — so
the ground beneath the mark flips for the duration, and a raster cannot follow that on its own because its
ink is in the pixels.

That is the same problem `--icon-ground` solves for the vector marks, which have knockouts the page has to
know the colour of. This is the same move by a different mechanism: the *file* changes.

**Two rules rather than one, because the inversion goes in opposite directions in each theme.** On a light
page the hovered ground is near-black, so the mark goes light; on a dark page it is near-white, so the mark
goes dark. A single rule would be correct in one theme and wrong in the other — and wrong here means
*invisible*, because the ink and the ground would be the same colour. Both halves are asserted, and the
second selector is deliberately more specific than `[data-theme='dark'] .colophon-mark` so it wins where it
should.

**A 28px box, and the number still comes from the artwork.** `aaen-mark-*.png` are 879×879 with the mark
fitted to 698×688 — 79% of the box — so the box draws the mark itself at about 22.2px: the weight the row's
14px label is cut against, and the footprint the masthead's mark had before the portrait arrived. A
`contain` fit cannot distort it, since the file is square.

**One thing this is not:** the mark in the masthead does not have this problem, because the masthead does
not hover. If the brand link ever gains a hover inversion, it needs the same pair.



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

**Both workflow files were unparseable for a day, and nothing said so.** Their headers were written as
`/** ... */` blocks — natural in this repository, and **not a comment in YAML**. GitHub rejects a file it
cannot parse, so neither workflow ever registered: the crons never fired, and every push produced two
instant failed runs with no jobs in them. The tell is in the API — a workflow whose `name` comes back as
its own file path is a file whose `name:` key never parsed — and the run pages say `Invalid workflow
file`. The headers are `#` comments now, and each file carries a note saying why.

**GitHub disables a scheduled workflow after 60 days of repository inactivity**, and this repository is
worked in bursts. After a long quiet period, open the Actions tab and dispatch `Refresh stats` once by
hand: a disabled schedule produces no failing run, so nothing else will tell you.

**Why the pin bump is a pull request and the stats refresh is not.** Moving a pin changes *which
documentation a visitor reads* — a page can gain a section, lose one, or change what it says — and that
deserves a look. Refreshing a download count does not. The two workflows are split along exactly that
line.

---

## Known gaps — true as of the last build, and deliberately not papered over

**4. The alert transform in `sync.mjs` is a text rewrite, and its limits are real.**
`transformBody` turns `> [!NOTE]` into a `<Callout>` by walking lines, and the link pass shares that
walk — which is why they are one pass and not two. It handles contiguous `>`
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
The author listing returns fewer projects than CurseForge's own profile page prints, and the shortfall is
recorded in `stats.json` as a `note` on every build rather than silently swallowed — the note prints both
numbers, which is where to read today's. One of the missing projects is known and handled by hand — see
"Where the numbers come from". The rest are unaccounted for. If the site's CurseForge total looks low,
this is the first place to look.

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

## Deploying to Vercel

`vercel.json` carries six keys and nothing else:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": null,
  "installCommand": "bun install --frozen-lockfile",
  "buildCommand": "bun run build",
  "outputDirectory": "apps/docs/out",
  "redirects": [
    { "source": "/docs/tasked/quests", "destination": "/docs/tasked/authoring/quests/", "permanent": true }
  ]
}
```

Each of the three settings is doing real work, and none of them is what you would guess:

**`buildCommand`.** `bun run build` — the same command used locally and in CI. It syncs from the
pinned commits, fetches the platform numbers, builds the static site, and then asserts the result. A
deploy that ran a different sequence from a local build is a deploy nobody has tested.

**`outputDirectory`.** `apps/docs/out`, because this is a static export (`output: 'export'` in
`next.config.mjs`). Vercel's Next.js preset looks in `.next`, which is the intermediate build
directory, not the exported site — so without this the deploy would have nothing to serve.

**`framework: null`** stops Vercel applying that preset at all. There is no server, no serverless
function and no ISR here, just files.

**`installCommand`.** `bun install --frozen-lockfile`, so the deploy uses the committed `bun.lock` and
fails loudly if it has drifted from `package.json`. An install that silently resolves different
versions is a build that cannot be reproduced.

**`redirects`.** Every page that has ever moved, kept alive at its old address — with **both slash
forms**, because Vercel matches the path as written and `/docs/tasked/quests` and
`/docs/tasked/quests/` are two different requests. The list is short and written by hand; the moment
it stops being short, it belongs in a generated file instead. A redirect is a promise that an old
address still means something, so `check.mjs` asserts every destination is a page that exists: a 301
to a 404 is worse than the 404 was, because a crawler follows it and a reader is told the page moved
to nowhere.

**Moving a page is therefore two edits, not one**: the page itself, and a redirect from where it was.
The URL is the one thing about a page that a reader can hold on to — a bookmark, a Discord link, a
search result — and a folder reorganisation that breaks all of them is a reorganisation that cost
more than it bought.

### Node is pinned, and deliberately not to a range

`package.json` declares `"engines": { "node": "24.x" }`. **Not `>=22`.** An open range would move the
build to a new Node major the day one is released, which is a build that changes without a commit and
without anyone having tested it — the exact failure the lockfile exists to prevent. `.nvmrc` pins the
same major for local use. Bun is the package manager and is pinned separately, via `packageManager`.

### `vercel.json` cannot hold comments

This is worth knowing before it costs you a deploy. `vercel.json` is validated against a published
JSON Schema, and that schema sets `additionalProperties: false`. **An unknown top-level key is a
rejected deploy, not a warning** — which is exactly what happened to a `"/*"` comment key that read
perfectly well and had been sitting in the file unnoticed.

The `"/*"` trick is a fine habit in `manifest.json` and `glossary.json`, where nothing validates the
file against a schema and the notes are worth having where the data is. It is never fine here. Notes
about the deploy belong in this section, where prose is allowed and nobody's build depends on the
parser tolerating them.

`check.mjs` asserts both halves of this — that `vercel.json` carries no comment key, and that the
six keys above are the whole file — so the mistake fails locally rather than in Washington.

---

## Running it

```cmd
bun install
bun run build      :: sync, fetch stats, next build, then check
bun run check      :: assert the built site in apps/docs/out is correct
bun run dev        :: sync, then fetch stats, then next dev
bun run sync       :: just the sync, with a log of what it copied
bun run stats      :: just the platform fetch, printing both totals
bun run icons      :: regenerate the mod marks from design/icons-source/
bun run brand      :: regenerate the host's logo from design/brand-source/
bun run portrait   :: export the masthead portrait from design/portrait-source/
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
- **nothing that is not certain to exist is published**: no manifest entry is anything but `active`, the
  catalog says `planned` nowhere, and a brand band is drawn exactly when it has an active mod
- the crawler files ship, the sitemap is **exactly** the pages the build emitted, and every page names
  its own canonical
- every page carries a card — `og:image` on every emitted page, not only on the home page
- the home page's structured data parses, and declares `WebSite` and `Person`
- the landmark and the accessible labels are in the markup, and `prefers-reduced-motion` is in the CSS

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
