# The stack section — plan (not built)

**Status: planned, deliberately not started.** Most of the nodes below have no repository yet, so a
diagram built today would be mostly dashed boxes. This file exists so that when they do, the section
is a data change rather than a redesign. Nothing in the site reads this file.

---

## The goal

Show that the mods are one architecture rather than a list: a platform layer, engines on it, and a
presentation layer on top. That is the pivot the home page does not currently say. The section has to
survive **more mods, and mods added in between**, without the layout being touched.

## The facts, read from each mod's own plan

Taken from the `plan.md` / `AGENT.md` in each repository, not invented. Re-read them before building;
they are working documents and move.

| Mod | Role | Needs | Minecraft | Site status today |
|---|---|---|---|---|
| **Armature** | Platform layer, UI toolkit, data, teams. A library | — | 1.21.1 now, 26.x port pending | active, has docs |
| **Tasked** | Questing engine | Armature | 1.21.1, port after Armature's | active, has docs |
| **Stature** | Scale and hitbox API. The stack's dependency root | nothing | 26.3 | planned |
| **Kith** | Trait and ability engine | Stature (and Armature's registry SPI) | 26.3 | planned |
| **Kindred** | Presentation and kin layer. Nothing depends on it | Kith, so Stature (and Armature's UI) | 26.3 | planned |
| **Folio** | In-game documentation engine | Armature | 26.3 only | planned |
| **Writ** | TypeScript scripting engine | Armature (26.x), at runtime, and nothing else | 26.3+ | **not on the site at all** |
| **Gantry** | Local build, verify and release cockpit. A desktop tool, not a mod | — | n/a | **not on the site at all** |
| *Addons* | Built on the above | the mod they extend | — | **do not exist yet** |

```
                      Kindred            (presentation; nothing depends on it)
                         |
                       Kith              (engine)
                         |
   Tasked   Folio   Writ |
      \       |      |   |
       +------+------+---+---- Armature   (platform: SPI, UI toolkit, teams)
                             Stature       (dependency root; depends on nothing)
```

Two things the picture hides, and both matter for the design:

1. **Two Minecraft worlds.** Armature and Tasked are 1.21.1; everything else waits for 26.3. Armature
   exists in both, and the 26.x port is the thing the rest is queued behind.
2. **Armature is not under everything.** Stature depends on nothing. The graph is a DAG with two
   roots, not a single tower, so the layout must be derived from the edges, not hand-placed.

## Design

### 1. Data, not layout

`manifest.json` already is "the one place a mod is named, described and ordered". It gains two fields
per `suite` entry:

- **`needs: [ids]`** — what the mod depends on. The only thing authored.
- **`role`** — `library` | `engine` | `layer` | `tool` | `addon`. A label, not a position.

**The tier is derived**: the longest path from a root. Nobody types a tier number, so inserting a mod
between two others shifts everything above it by itself. That is the whole answer to "it might expand
later, with more mods and in-betweens".

### 2. One band, not two

Replace **In development** and **Planned** with a single **Stack** band. Status is already a property
of each cell (`in development` / `planned`), so it never needed to be a band, and a band per status is
exactly what multiplies as mods are added. Rows are tiers; each row carries a quiet caption such as
`built on Armature`. Cells stay `SuiteCell`, unchanged.

- **Empty tiers do not render.** No "coming soon" slots. An addons tier appears the day the first
  `role: "addon"` entry exists, and not before.
- **No drawn edges at first.** A cell's meta line says `on Armature · Stature`. Hairline connectors
  are a second system to keep correct as the graph grows, and the row captions already say it. Revisit
  only if the graph stops being layered.

### 3. Versions are states, not nodes

A port is not another mod. Give a node `targets: [{ minecraft, status }]` (Tasked: `1.21.1 active`,
`26.x planned`) and show them as chips, rather than listing Tasked twice. This replaces today's single
`minecraft` string and is the one schema change that is awkward to make late.

### 4. The word "Addons" is reserved

The home page's **Earlier work · addons & packs** band is the Origins addons and Create Stellar. The
future addons are built *on the stack*. They are different things, which is why the earlier band is now
named by what it holds rather than by being "released". Never call both "addons" on the same page.

## Checks (`scripts/check.mjs`)

Same philosophy as `.utils/check_layering.py` in the mod repos: a rule that matters is a build failure,
not a comment.

- Every `needs` id resolves to a mod in the manifest.
- **The graph is acyclic**, and a `library` never needs a consumer — the "arrow points one way" rule.
- **For active mods, declared `needs` equals the real dependency** in the pinned checkout's
  `fabric.mod.json` / `neoforge.mods.toml`. Otherwise the diagram is a hand-typed number, which is the
  thing this site refuses to have.
- Every node renders exactly once; an empty tier renders nothing.

## Where the edges should live

Rule of this site: **nothing is authored here.** A mod's dependencies belong in the mod's repository
(like `docs/glossary.json`), and the sync would read them. That cannot work yet — the planned mods have
no public repo and no `docs/`. So: **manifest now, repository later**, and migrate each mod's `needs`
to its own repo the moment it gets one. The metadata cross-check above is what keeps the interim copy
honest.

## When to build it

When the **26.x port begins** or **two or more** of Stature, Kith, Kindred, Folio and Writ have a
repository — whichever is first. Before that the section would be mostly planned boxes, which is the
weakness the current Planned row already has. Until then, the home page needs no work for this.

## Open decisions (yours)

1. **Foundation at the bottom or the top?** A stack reads bottom-up; a page reads top-down.
2. **Are Writ and Gantry public?** Neither is on the site. Writ is a stack member; Gantry is
   tooling and might belong under "Elsewhere" instead, or nowhere.
3. **Ports as states of one node** (recommended) or as separate nodes?
4. **Draw edges, or captions only?** Captions are recommended to start.
5. **Edges in the manifest now** (recommended, with the metadata cross-check) or wait for repos?
6. **How much of a planned mod to show.** Today only a one-line summary. The plans are local and
   gitignored; the site should keep showing summaries, never plan content.
