/**
 * Seven typeface directions for ellipog.dev.
 *
 * Every direction is a *system* -- prose face, identifier/code face, and (where the direction has
 * one) a display face scoped to a handful of selectors. Each one is applied to the real built site by
 * swapping the two font tokens in `global.css` plus a short list of scoped overrides. Nothing else
 * about the page moves.
 *
 * `css` is exactly what a real implementation would add to the tokens block.
 */

/** Every face any direction uses, with its file. Injected on every sheet; browsers fetch lazily. */
export const faces = [
  { family: 'PlexSans', file: 'ibmplexsans-var.woff2', weight: '100 700' },
  { family: 'PlexMono', file: 'ibmplexmono-400.woff2', weight: '400' },
  { family: 'PlexMono', file: 'ibmplexmono-500.woff2', weight: '500' },
  { family: 'PlexMono', file: 'ibmplexmono-600.woff2', weight: '600' },
  { family: 'Schibsted', file: 'schibstedgrotesk-var.woff2', weight: '400 900' },
  { family: 'Commit', file: 'commitmono-400.woff2', weight: '400' },
  { family: 'Commit', file: 'commitmono-500.woff2', weight: '500' },
  { family: 'Commit', file: 'commitmono-700.woff2', weight: '700' },
  { family: 'Geist', file: 'geist-var.woff2', weight: '100 900' },
  { family: 'Departure', file: 'departuremono-400.woff2', weight: '400' },
  { family: 'Doto', file: 'doto-var.woff2', weight: '100 900' },
  { family: 'Handjet', file: 'handjet-var.woff2', weight: '100 900' },
  { family: 'Sono', file: 'sono-var.woff2', weight: '200 800' },
  { family: 'Krypton', file: 'monaspace-krypton-var.woff2', weight: '200 800' },
  { family: 'Argon', file: 'monaspace-argon-var.woff2', weight: '200 800' },
];

export const facesCss = faces
  .map(
    (f) => `@font-face{font-family:'${f.family}';src:url('/fonts/${f.file}') format('woff2');
  font-weight:${f.weight};font-style:normal;font-display:block}`,
  )
  .join('\n');

export const directions = [
  {
    id: 'plex',
    n: '01',
    name: 'The documentation instrument',
    temp: 'sober',
    faces: 'IBM Plex Sans + IBM Plex Mono',
    css: `--font-sans: 'PlexSans', system-ui, sans-serif;
--font-mono: 'PlexMono', ui-monospace, monospace;`,
    why: `Plex was drawn for IBM's own technical documentation, which is this site's exact register: dense prose, identifiers in mono, no marketing voice. The sans and the mono share a skeleton, so the "prose is sans, identifiers are mono" rule reads as one typeface in two modes rather than two families that happen to sit together. Unfashionable on purpose -- nobody picks it to look current, and it will still look correct in five years.`,
    watch: `It can read "enterprise" to some eyes, and the wordmark gains nothing it did not already have. The mono is friendly rather than severe, which softens the site's harder edges.`,
    licence: 'OFL 1.1',
    source: 'Google Fonts / @fontsource',
  },
  {
    id: 'quiet',
    n: '02',
    name: 'The neutral instrument',
    temp: 'sober',
    faces: 'Schibsted Grotesk + Commit Mono',
    css: `--font-sans: 'Schibsted', system-ui, sans-serif;
--font-mono: 'Commit', ui-monospace, monospace;`,
    why: `Commit Mono is designed to disappear -- it is the one mono here whose whole ambition is to not have a personality in code, which is what most mono text on this site actually is: ids, versions, paths, signposts rather than decoration. Schibsted Grotesk is a Norwegian newspaper grotesque (Schibsted is a Norwegian media house; the studio signing the colophon is aaenz.no) -- it gives the headline an edge in the cuts that a system stack cannot, without cosplaying as a display face.`,
    watch: `Commit Mono is very neutral, and the tracked uppercase label is the most repeated element on the site -- this direction makes it quieter, which may be too quiet. The arrow glyph needs the SVG swap (see the arrow note).`,
    licence: 'OFL 1.1 (both)',
    source: 'Google Fonts / @fontsource',
  },
  {
    id: 'terminal',
    n: '03',
    name: 'The machine-readable artifact',
    temp: 'bold',
    faces: 'Departure Mono + Commit Mono (code) + Geist Sans (prose)',
    css: `--font-sans: 'Geist', system-ui, sans-serif;
--font-mono: 'Departure', ui-monospace, monospace;

/* Departure is a label face, not a text face: long identifiers and code keep a workhorse. */
pre, .code, code, kbd { --font-mono: 'Commit', ui-monospace, monospace; }

/* The wordmark is one word -- let it be the one piece of chrome that shows the pixel grid. */
.brand { font-family: 'Departure', monospace; font-weight: 400; font-size: 16px; letter-spacing: 0; }`,
    why: `Departure Mono is drawn on a pixel grid -- the same grid the hero paints behind the headline and the same grid the hairlines imply. It is optimised for the 10.5-11.5px sizes this site uses for labels, versions and figures, so the most repeated element on every page gets sharper rather than smaller: a bitmap face at 11px is doing what it was drawn to do. It reads as terminal output, which is what a mod's identifier column is. It is also one of only two faces here that ship the arrow glyph.`,
    watch: `One weight, a small charset, no italics -- it must stay scoped to labels, figures and chrome; prose and code keep a real text face. This is the direction most likely to be "a look"; the specimen is where that gets judged.`,
    licence: 'OFL 1.1 (both)',
    source: 'departure-mono (GitHub) / @fontsource',
  },
  {
    id: 'blueprint',
    n: '04',
    name: 'The technical drawing',
    temp: 'bold',
    faces: 'Doto (display) + IBM Plex Mono + IBM Plex Sans',
    css: `--font-sans: 'PlexSans', system-ui, sans-serif;
--font-mono: 'PlexMono', ui-monospace, monospace;

/* Display only. The hero already draws a blueprint grid; this is the machine that drafts it. */
.hero h1, .hero-total b {
  font-family: 'Doto', monospace;
  font-variation-settings: 'ROND' 0;   /* 0 square dots, 100 round */
  font-weight: 900;
  letter-spacing: 0;
}`,
    why: `Doto is a variable dot-matrix face, and the hero already draws a blueprint grid behind its own headline -- a plotted drawing is the one form this site's backdrop is literally imitating. The ROND axis goes from round dots to square ones, so the dot can either echo the hairline (square, 0) or soften it (round, 100) -- an axis that is worth having because it is the difference between "plotter" and "ledger". Set at the download figure, which is already the largest thing on the page, dots at 88px read as a chart rather than as text.`,
    watch: `Dot matrix at the 52px h1 is legible but demands the right size; below ~24px it stops working, so it never touches the body. Needs the SVG arrow.`,
    licence: 'OFL 1.1',
    source: 'Google Fonts / @fontsource',
  },
  {
    id: 'element',
    n: '05',
    name: 'The grid made literal',
    temp: 'exotic',
    faces: 'Handjet (display) + IBM Plex Mono + IBM Plex Sans',
    css: `--font-sans: 'PlexSans', system-ui, sans-serif;
--font-mono: 'PlexMono', ui-monospace, monospace;

/* Display only: glyphs built from elements on a grid you control. */
.hero h1, .hero-total b, .label, .eyebrow, .brand, .band-head {
  font-family: 'Handjet', monospace;
  font-variation-settings: 'ELSH' 2, 'ELGR' 1;  /* element shape, element grid */
  font-weight: 600;
  letter-spacing: 0.02em;
}`,
    why: `The design language opens with a sentence -- "the structure of the page IS the decoration" -- and Handjet is the only face here that takes that sentence literally: every glyph is assembled from elements on a grid, and both the density (ELGR) and the shape of the element (ELSH: square, round, hexagon, triangle...) are axes you dial. Set the labels and the giant figure in it and the site's structural argument stops being a claim about layout and starts being visible in the letters. This is the one that is a statement, and the axis study shows the dial so the choice is real rather than a stunt.`,
    watch: `The most exotic option, and the easiest to overdo: display-only, never below ~24px, and the element shape has to be chosen rather than defaulted. If the site is a tool first and a manifesto second, this is the wrong pick -- that is exactly what the sheet is for.`,
    licence: 'OFL 1.1',
    source: 'Google Fonts / @fontsource',
  },
  {
    id: 'morph',
    n: '06',
    name: 'One skeleton, two modes',
    temp: 'exotic',
    faces: 'Sono (MONO axis) + JetBrains Mono (optional, code)',
    css: `--font-sans: 'Sono', system-ui, sans-serif;
--font-mono: 'Sono', ui-monospace, monospace;

/* The site's rule -- prose is sans, identifiers are mono -- as one continuous axis. */
body { font-variation-settings: 'MONO' 0; }
.mono, .label, .eyebrow, .cell-top, .meta, .hero-total,
.masthead nav a, .masthead nav button, pre, .code, .brand {
  font-variation-settings: 'MONO' 1;
}`,
    why: `This site has exactly one typographic rule, and it is a binary: prose is sans, anything that is an identifier is monospace. Sono has that rule as a continuous axis -- MONO 0 is a proportional sans, MONO 1 is a monospaced cut of the same drawing, and the boundary between the two voices becomes a number you can move. One family, one file (38KB), two modes, no pairing to defend. It is the most quietly engineered answer to this particular brief, and the axis study lets you put the boundary anywhere and see it.`,
    watch: `Sono is new and soft-geometric -- friendlier than the site's current voice, and at MONO 1 it is a working mono but not a code mono (no ligatures, modest punctuation). It also needs the SVG arrow.`,
    licence: 'OFL 1.1',
    source: 'Google Fonts / @fontsource',
  },
  {
    id: 'krypton',
    n: '07',
    name: 'Rectangles all the way down',
    temp: 'bold',
    faces: 'Monaspace Krypton (labels/display) + Monaspace Argon (code) + Geist Sans (prose)',
    css: `--font-sans: 'Geist', system-ui, sans-serif;
--font-mono: 'Argon', ui-monospace, monospace;

/* Krypton's glyphs are built from rectangles -- the page is too. */
.brand, .hero h1, .hero-total b, .label, .eyebrow {
  font-family: 'Krypton', monospace;
  font-variation-settings: 'wdth' 100;
}

/* Monaspace's own trick, and it only shows on a docs page: neighbouring glyphs borrow space. */
pre, .code, .mono { font-feature-settings: 'calt' 1; }`,
    why: `The site is built out of rectangles meeting at 1px lines, and Krypton is the Monaspace variant whose glyphs are *constructed* from rectangles -- labels, wordmark and the giant figure would share the page's construction method rather than merely sit on it. The second half of the argument is texture healing: in code blocks Monaspace lets neighbouring glyphs borrow space, which on a documentation site is a real legibility gain, not a garnish. It is also the only family here that ships the arrow glyph in its full build.`,
    watch: `Krypton is unsubtle at large sizes, and the family is heavy -- the full variable files are 435KB and 528KB, so latin subsetting is mandatory (roughly 35-45KB each after). Its identity is "GitHub's mono", which is a thing some readers will recognise.`,
    licence: 'OFL 1.1',
    source: 'githubnext/monaspace release (v1.400)',
  },
  {
    id: 'doto-tight',
    n: '04a',
    name: 'The technical drawing, tight',
    temp: 'bold',
    variant: true,
    faces: 'Doto + IBM Plex Mono + IBM Plex Sans',
    css: `--font-sans: 'PlexSans', system-ui, sans-serif;
--font-mono: 'PlexMono', ui-monospace, monospace;

/* Display roles, plus the wordmark, the figure's label and the colophon. */
.hero h1, .hero-total b,
.brand, .hero-total > span, .colophon, .colophon-link {
  font-family: 'Doto', monospace;
  font-variation-settings: 'ROND' 0;
  font-weight: 900;
  letter-spacing: 0.02em;
}
.hero h1, .hero-total b { letter-spacing: 0; }`,
    why: `The display voice extended to the two rows that are already ink-only and uppercase: the figure's label and the colophon. Nothing drops below 11px, and no identifier moves.`,
    watch: `The wordmark at 15px is the weak point -- it reads, but it is texture rather than type; 18px would be honest.`,
    licence: 'OFL 1.1',
    source: 'Google Fonts / @fontsource',
  },
  {
    id: 'doto-broad',
    n: '04b',
    name: 'The technical drawing, broad',
    temp: 'bold',
    variant: true,
    faces: 'Doto + IBM Plex Mono + IBM Plex Sans',
    css: `--font-sans: 'PlexSans', system-ui, sans-serif;
--font-mono: 'PlexMono', ui-monospace, monospace;

/* Everything that is uppercase, tracked, or a display: the site's whole label chrome. */
.hero h1, .hero-total b,
.brand, .hero-total > span, .colophon, .colophon-link,
.eyebrow, .label, .band-head, .cell-top, .cell-index, .kind, .meta, .nums,
.masthead nav a, .masthead nav button {
  font-family: 'Doto', monospace;
  font-variation-settings: 'ROND' 0;
  font-weight: 900;
  letter-spacing: 0.04em;
}
.hero h1, .hero-total b { letter-spacing: 0; }

/* Prose, summaries and code keep the text faces -- this is the line that must not move. */
.summary, .prose, .docs-body p, pre, code, .code { font-family: inherit; }
pre, code, .code { --font-mono: 'PlexMono', ui-monospace, monospace; font-family: var(--font-mono); }`,
    why: `Case is the rule, not size: uppercase with tracking survives at 10.5-11.5px as a crisp bitmap label face, and that is most of this site's small type -- eyebrows, band labels, versions, loader names, meta links, the masthead nav, the colophon. Doto becomes the site's voice; Plex Mono shrinks to code and identifiers; Plex Sans keeps the prose.`,
    watch: `The mod names in the cells are 16px mixed case -- they read, but as texture. If that is too far, drop .name (it is not in this patch); if it is not far enough, the docs chrome (Since, Maturity, callout labels, TOC heads) can take the same treatment.`,
    licence: 'OFL 1.1',
    source: 'Google Fonts / @fontsource',
  },
];

/** What the label / version / cell / code chrome looks like in each direction -- for the notes. */
export const arrowNote = `The arrow is a text glyph (U+2197) in components/arrow.tsx. Every latin subset of every
candidate -- including the Google-hosted ones -- is missing it, so it silently falls back to a system face. Only
Departure Mono (03) and Monaspace's full build (07) contain it. In any other direction, swap the glyph for an
inline SVG: three lines, inherits currentColor, and the arrow stops depending on charset luck.`;
