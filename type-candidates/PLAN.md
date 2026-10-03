# Typeface candidates for ellipog.dev

Seven directions, planned and shown — **nothing is wired into the site.** Everything here lives in
`type-candidates/` and is either a scratch build product or a proposal to be implemented later.

## How to look at it

| | |
|---|---|
| `shots/compare.png` | all seven, same hero, same copy, same tokens — start here |
| `shots/axes.png` | the three variable-axis studies (Doto ROND, Handjet ELSH, Sono MONO) |
| `shots/<id>.png` | one sheet per direction: light page + the same tokens inverted |
| live gallery | `bun serve.mjs` in this folder, then open `http://127.0.0.1:8791/spec/` — the real built site with a direction switcher and a theme toggle |

The gallery and the per-direction pages are the **real built site** (`apps/docs/out`) with only the two
font tokens (plus a short list of scoped overrides) injected, so what you see is what a token swap
would produce. `preview.html?d=<id>&t=light|dark&p=<path>` renders any page of the site in any direction.

## Why this is worth doing at all

The site uses system stacks on purpose — no build-time fetch, builds work offline, and `global.css`
says so in a comment. That decision has a cost that has never been measured: **the design is different
on every OS.** Windows gets Segoe UI, macOS gets SF, Android gets Roboto — so the `-0.04em` headline
tracking, the `0.14em` eyebrow tracking and the 10.5px label sizes all land differently per platform,
and the OG card (AGENT.md → *the share card*) can only use Satori's built-in face because there is no
font file in the repo to hand it. Committing font files fixes both, and `next/font/local` fetches
nothing at build time, so the offline-build rule survives intact. That is the argument for doing this;
the direction is a separate question, and that is what the seven sheets are for.

## The seven

Every direction is a system, not a single face: prose face, identifier/code face, and — where the
direction has one — a display face scoped to the hero headline and the download figure.

| # | direction | faces | register | licence | latin payload |
|---|---|---|---|---|---|
| 01 | the documentation instrument | IBM Plex Sans + IBM Plex Mono | sober | OFL 1.1 | 44.6 + 14.4/14.5/15.3 KB |
| 02 | the neutral instrument | Schibsted Grotesk + Commit Mono | sober | OFL 1.1 | 45.7 + 47/47/46 KB |
| 03 | the machine-readable artifact | Departure Mono + Commit Mono + Geist Sans | bold | OFL 1.1 | 22 + 47 + 28.7 KB |
| 04 | the technical drawing | Doto + IBM Plex Mono + IBM Plex Sans | bold | OFL 1.1 | 5.9 + 44.3 + 44.6 KB |
| 05 | the grid made literal | Handjet + IBM Plex Mono + IBM Plex Sans | exotic | OFL 1.1 | 18.1 + 44.3 + 44.6 KB |
| 06 | one skeleton, two modes | Sono (MONO axis) + JetBrains Mono (code) | exotic | OFL 1.1 | 38.2 (+39.5) KB |
| 07 | rectangles all the way down | Monaspace Krypton + Argon + Geist Sans | bold | OFL 1.1 | ~80 KB after subsetting (435/528 KB unsubset) |

Sizes are the files in `fonts/`, measured. They are latin subsets with the axes intact — one file per
family, all weights. **Whole-system payload is 35–95 KB** for every direction except 07, which needs
`pyftsubset` before it is shippable.

Sources: the Google-hosted faces and Commit Mono come from the `@fontsource` packages in
`fonts-src/` (the same files `bun add @fontsource-variable/<face>` would give the repo); Departure Mono
from `rektdeckard/departure-mono`; Monaspace from `githubnext/monaspace` v1.400. All OFL 1.1, all
self-hostable, no CDN.

### 01 · IBM Plex — the documentation instrument
Drawn for IBM's own technical documentation, which is this site's register exactly: dense prose,
identifiers in mono, no marketing voice. The sans and the mono share a skeleton, so "prose is sans,
identifiers are mono" reads as one voice in two modes. Unfashionable on purpose. *Watch:* it can read
"enterprise", and it gives the wordmark nothing new.

### 02 · Schibsted Grotesk + Commit Mono — the neutral instrument
Commit Mono's whole ambition is to disappear; that is what most mono text here actually is — ids,
versions, paths, signposts. Schibsted Grotesk is a Norwegian newspaper grotesque (Schibsted is a
Norwegian media house; the colophon is aaenz.no) with an edge in the cuts a system stack cannot offer.
*Watch:* it makes the site's most repeated element (the tracked uppercase label) quieter, and that may
be too quiet.

### 03 · Departure Mono — the machine-readable artifact
A pixel-grid mono, drawn for exactly the 10.5–11.5px sizes the label chrome uses, so the most repeated
element on every page gets *sharper* rather than smaller. It is also the same grid the hero paints
behind the headline and the hairlines imply. One of only two faces here that ship the arrow glyph.
*Watch:* one weight, small charset, no italics — labels, figures and chrome only; code keeps a text mono.

### 04 · Doto — the technical drawing
The hero already draws a blueprint grid; Doto is the plotter that drafts it. Its `ROND` axis goes from
square dots (which echo the hairline) to round ones (a pen), and it only becomes itself above ~40px —
which is where the site puts its biggest element, the download figure. *Watch:* display only; the axis
is invisible at small sizes.

### 05 · Handjet — the grid made literal
The design language opens with "the structure of the page IS the decoration"; Handjet is the only face
here that takes that literally. `ELSH` picks the element every glyph is built from (0 draws nothing,
2 and 8 are solid, **4 is hollow** — the hairline aesthetic applied to letters), `ELGR` sets the element
grid. *Watch:* display only, never below ~24px; it is a statement, and if the site is a tool first and a
manifesto second, this is the wrong pick.

### 06 · Sono — one skeleton, two modes
The site's single typographic rule is a binary: prose is sans, identifiers are mono. Sono has that rule
as a continuous axis — `MONO 0` proportional, `MONO 1` monospaced, one file — so the boundary between
the two voices becomes a number. The most quietly engineered answer to this brief, and the cheapest.
*Watch:* soft-geometric and friendlier than the site's current voice; at `MONO 1` it is a working mono
but not a code mono.

### 07 · Monaspace Krypton — rectangles all the way down
Krypton's glyphs are *constructed* from rectangles, which is how every surface on this page is built;
used for labels, wordmark and figure, the type shares the page's construction method. Argon carries
code, where Monaspace's texture healing is a real legibility gain on a docs site. The only family here
that ships the arrow glyph in its full build. *Watch:* unsubtle at large sizes, heavy files, and its
identity is "GitHub's mono".

## What implementing one actually changes

One token block per direction, plus (for 03–05, 07) a short scoped list. This is the whole diff shape:

```css
/* in global.css, replacing the two system stacks */
:root {
  --font-sans: 'PlexSans', system-ui, sans-serif;
  --font-mono: 'PlexMono', ui-monospace, monospace;
}
```

```css
/* 04 · blueprint — the only kind of addition any direction needs */
.hero h1, .hero-total b {
  font-family: 'Doto', monospace;
  font-variation-settings: 'ROND' 0;
  font-weight: 900;
  letter-spacing: 0;
}
```

Then: `@font-face` blocks (or `next/font/local`) pointing at `apps/docs/public/fonts/`, `font-display:
swap` for the text faces and `block` only for the display face, and the OG route finally gets a real
font file to hand Satori — which is the compromise AGENT.md currently records.

## Findings that change the plan

1. **The arrow is a text glyph and no latin subset has it.** `components/arrow.tsx` renders `↗`
   (U+2197) and every candidate's latin subset is missing it — checked across all 20 files. Only
   Departure Mono and Monaspace's full build contain it. In every other direction it silently falls
   back to a system face, which on a hairline design is a visible weight/size jump. **Fix: make `Arrow`
   an inline SVG** — three lines, inherits `currentColor`, and the arrow stops depending on charset luck
   forever. Do this regardless of which direction wins.
2. **Variable axes are worth using, not just weight.** Doto `ROND`, Handjet `ELSH`/`ELGR`, Sono `MONO`
   are the difference between "a font that fits" and "a font that says something about this site"; the
   axis sheet exists so the values can be chosen rather than defaulted.
3. **Axis order in filenames lies.** Handjet's file is `Handjet[ELGR,ELSH,wght].ttf` but its `fvar`
   order is `wght, ELGR, ELSH`; anything that sets axes positionally will silently set the wrong ones.
   Read `fvar` (`fontTools`), never the filename.
4. **Subsetting is not optional for Monaspace.** 435/528 KB unsubset vs ~35–45 KB latin-subset.
   `pyftsubset --unicodes=U+0020-007E,U+00A0-00FF,U+2018-201D,U+2026,U+2197 --layout-features='*'`
   keeps the arrows and the `calt` that texture healing needs.
5. **`--font-mono` is used for the brand, nav, labels, figures, meta and code** — 6 roles with different
   needs. Directions 03 and 07 split that token in two (`pre, .code { --font-mono: … }`), which is the
   one structural change any direction asks of the stylesheet.

## Recommendation

- **If the site should stay a manual:** 01 (Plex). It is the only direction with nothing to defend, and
  it fixes the cross-platform and OG-card problems in one move.
- **If the site should have a voice:** 03 (Departure Mono). It makes the most repeated element — the
  tracked uppercase label — the best-looking part of the page, it is cheap (22 KB), and it is the
  closest thing to a Minecraft wink the design language would tolerate: a grid, not a costume.
- **If the site should make an argument:** 04 (Doto) at the figure, 05 (Handjet, `ELSH 4`) if you want
  the argument to be visible in the letters. Both are display-only and both are one scoped rule.

Do not ship two of 03/04/05 — they are three answers to the same question ("the machine drew this"),
and one of them, used with restraint, is a signature; two is a theme.

## Folder contents

    type-candidates/
    ├── directions.mjs   the seven, with the exact token patch each one needs
    ├── render.py        typesets the specimen sheets from the font files (Pillow + FreeType)
    ├── serve.mjs        serves the built site + fonts + this folder  (bun serve.mjs)
    ├── index.html       live gallery: the real site in any direction, no reload
    ├── preview.html     the real site in one direction (?d=&t=&p=)
    ├── compare.html     a reconstruction of the hero, seven times, for side-by-side
    ├── axes.html        the variable-axis studies page
    ├── fonts/           latin-subset woff2 (what ships) and ttf/otf sources (what renders)
    ├── ttf/             TTF/OTF sources for FreeType
    └── shots/           the PNGs

Scratch, not part of the repo's build. Delete it, or keep `directions.mjs` + `fonts/` as the seed of
the real change.

---

## Addendum · 04a and 04b, Doto used in more places

The question "can Doto go further than the headline and the figure?" has a clean answer, and it is
**case, not size**: at `wght 900` the dots merge into a crisp bitmap at small sizes, so *uppercase with
tracking survives down to 10.5px* — which is most of this site's small type. Mixed case falls apart
below ~28px, and prose and code never take it.

`shots/doto-placement.png` is the per-role evidence, at each role's real size, ROND 0 against ROND 100.
`shots/doto-tight.png` and `shots/doto-broad.png` are the two extended variants (also live in the
gallery as 04a / 04b).

| added role | size | verdict |
|---|---|---|
| wordmark `.brand` | 15px mixed | works, but 18px would be honest |
| figure's label `.hero-total > span` | 11px caps | works — bitmap label |
| colophon row | 11px caps | works — the signature row, and the best of the small ones |
| eyebrow `.eyebrow` | 11.5px caps | works — bitmap label |
| band labels `.label` | 11px caps | works — bitmap label |
| version / loaders `.cell-top`, `.cell-index`, `.kind` | 10.5px caps | works — bitmap label |
| meta links `.meta` (incl. `↗`) | 10.5px caps | works as texture; the arrow still needs the SVG fix |
| masthead nav | 11.5px caps | works |
| mod name `.name` | 16px mixed | marginal — reads, but it is texture; not in the broad patch |
| docs chrome (`Since`, `Maturity`, callout labels, TOC heads) | 10–11px caps | works, same rule |
| summaries, prose, step titles, tabs | 13–14px mixed | no — Plex Sans |
| code, identifiers | any | no — Plex Mono |

**Do not take `.summary`, `.prose` or `pre`.** In the broad patch they are explicitly re-declared back
to the text faces, which is the line that must not move: Doto becomes the site's voice, Plex Mono
shrinks to code and identifiers, Plex Sans keeps the reading.

ROND: keep **0** (square) for the chrome — it is the dot the hairline grid would use. 100 (round) is
worth considering only for the 88px figure, where it reads as a plotted curve rather than a grid.

The 15px wordmark is the one place worth changing something else rather than the face: at 18px, Doto's
wordmark stops being texture and starts being a drawing.
