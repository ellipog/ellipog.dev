#!/usr/bin/env node
/**
 * mark.mjs -- export the Stellar mark pair from the sources in `design/brand-source/`.
 *
 * Run: bun scripts/mark.mjs
 *
 * WHAT THIS IS, AND WHAT IT IS NOT
 *
 * This is **the Stellar mark** -- the Create Stellar modpack's own logo, exported as a theme pair for
 * the surface that will show it. It is **not the site's mark and must never be exported over one**:
 * the masthead, the colophon and the tab all draw the studio's mark, the pair in
 * `apps/docs/public/site/` copied from `aaenz/public/assets/`. A previous revision of this script
 * wrote straight over that pair, which put the modpack's logo beside the studio's name at the foot of
 * every page. The output directory below (`public/brand/`, the folder that holds `bisecthosting.svg`)
 * is what keeps that from being a one-word mistake.
 *
 * THE SOURCES
 *
 * `design/brand-source/stellar-logo-on-light.png` and `stellar-logo-on-dark.png` -- the stellar mark,
 * hand-supplied at 2048x2048: one drawing exported twice, once in black ink for a light ground and once
 * in white ink for a dark one. The two files share one alpha channel byte for byte, which is what makes
 * them one artwork with two colourings rather than two drawings to keep in step -- asserted below, not
 * assumed, because the whole point of a pair is that half of it cannot drift.
 *
 * WHY AN EXPORT EXISTS AT ALL
 *
 * The stellar sources are near full-bleed -- the ink reaches 96% of the canvas -- and carry three
 * specks of scan dust parked far outside the drawing. Dropped into a `contain` fit as they stand, the
 * specks widen the fitted box and shrink the mark itself to make room for empty space; at a 16px tab
 * they are sub-pixel noise rather than stars. So the committed sources are cropped to the drawing,
 * fitted into a square footprint, and centred on an 879x879 transparent canvas. Nothing else about the
 * art is touched: the ink is used exactly as supplied.
 *
 * The sources live in this repository, so the derivation is reproducible and the only thing left
 * without a guard is the byte-equality between the sources here and wherever they were supplied from,
 * which is a git diff away.
 *
 * THE GEOMETRY, AND WHY EACH NUMBER IS WHAT IT IS
 *
 * - **879x879 canvas, 698x688 fit box.** Inherited from the derivation this was first written as, when
 *   it exported the site's pair: the old canvas size, and the mark's footprint in that pair, which is
 *   the weight the wordmark beside it is cut to. Nothing downstream cares -- a `contain` fit squares
 *   it -- and keeping them means the Stellar mark can stand wherever the studio's mark stands. They
 *   can be revisited when Stellar has a surface of its own; until then they cost nothing.
 * - **The stellar drawing is 1416x1424 inside its crop**, so `inside` fits it to 684x688.
 * - **MARK_BOX (316, 308, 1416x1424).** The drawing's bounding box in the 2048px sources, measured
 *   from the alpha channel. The dust sits at (40..2008, 221..1932) -- the specks stick out well past
 *   this box -- and the dust guard refuses to export if more than a whisker of ink ever falls outside
 *   it, so a re-supplied source with real content out there fails loudly instead of being cropped away
 *   in silence.
 *
 * THE GUARDS
 *
 * No `check.mjs` assertion covers this pair -- nothing on the site draws it yet -- so every guard lives
 * here, where a failure names the file that caused it. When Stellar gets its surface, the pair it
 * draws should get the same checks the site's own pair has:
 *
 *   - the two sources share one alpha channel -- one drawing, two inks, not two drawings;
 *   - the ink outside MARK_BOX is under 0.5% of the total -- the dust is dust, not design;
 *   - the two exports carry identical alpha (same crop, same fit, same canvas);
 *   - all four corners of both exports are fully transparent -- no plate;
 *   - the dark-ink file is dark and the light-ink file is light, by the same luminance the checks use.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

// The repo's own relative luminance, not a second copy of the gamma expansion -- `monochrome.mjs`
// carries the reasoning, and `png-ink.mjs` imports it for the same pair of assertions.
import { luminance } from './lib/monochrome.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, '..');

const SOURCE_DIR = join(SITE, 'design', 'brand-source');

/**
 * `public/brand/`, where the third-party product marks live -- `bisecthosting.svg` is here. Deliberately
 * NOT `public/site/`: that pair is the studio's mark, it is not produced by any script, and writing the
 * modpack's logo there is the mistake this path exists to prevent. See the header.
 */
const OUT_DIR = join(SITE, 'apps', 'docs', 'public', 'brand');

/** The canvas the derivation was written on; kept so the Stellar mark stands where the studio's does. */
const CANVAS = 879;
/** The studio mark's footprint -- the weight the wordmark beside it is cut to; see the header. */
const FIT_BOX = { width: 698, height: 688 };
/** The drawing inside the 2048px sources, measured from the alpha channel; the dust sits outside it. */
const MARK_BOX = { left: 316, top: 308, width: 1416, height: 1424 };
/** Ink outside MARK_BOX beyond this fraction of the total refuses the export. See the dust guard. */
const DUST_FRACTION = 0.005;

/** The same luminance bounds `check.mjs` asserts, so the script cannot pass what the check would fail. */
const DARK_INK_ABOVE = 0.2;
const LIGHT_INK_BELOW = 0.8;

const PAIR = [
  { ground: 'light', source: 'stellar-logo-on-light.png', out: 'stellar-on-light.png' },
  { ground: 'dark', source: 'stellar-logo-on-dark.png', out: 'stellar-on-dark.png' },
];

const fail = (message) => {
  console.error(`mark: ${message}`);
  process.exit(1);
};

const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

/** The alpha channel as a raw byte buffer, for the equality, dust and corner guards. */
const alphaOf = async (input) => sharp(input).ensureAlpha().extractChannel(3).raw().toBuffer();

const inkPixels = (alpha) => {
  let total = 0;
  for (const a of alpha) if (a > 0) total++;
  return total;
};

/** Count ink outside MARK_BOX, row by row over the raw alpha -- the guard against cropping content. */
const inkOutsideBox = (alpha, width) => {
  const height = alpha.length / width;
  let dust = 0;
  for (let y = 0; y < height; y++) {
    const inRows = y >= MARK_BOX.top && y < MARK_BOX.top + MARK_BOX.height;
    for (let x = 0; x < width; x++) {
      if (inRows && x >= MARK_BOX.left && x < MARK_BOX.left + MARK_BOX.width) continue;
      if (alpha[y * width + x] > 0) dust++;
    }
  }
  return dust;
};

/** The colour of the first fully solid pixel -- how `png-ink.mjs` reads the ink, for the same reason. */
const firstInk = async (png) => {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] >= 250) return hex(data[i], data[i + 1], data[i + 2]);
  }
  return null;
};

mkdirSync(OUT_DIR, { recursive: true });

for (const { source } of PAIR) {
  if (!existsSync(join(SOURCE_DIR, source))) {
    fail(`${source} is missing from design/brand-source -- the committed sources are the only input`);
  }
}

/* One drawing, two inks. If the alpha channels ever disagree, the pair is two drawings and everything
   below would fit two different boxes onto one canvas without noticing. */
const alphas = new Map();
for (const { ground, source } of PAIR) {
  alphas.set(ground, await alphaOf(join(SOURCE_DIR, source)));
}
const [firstAlpha, secondAlpha] = [...alphas.values()];
if (!firstAlpha.equals(secondAlpha)) {
  fail('the two sources disagree on alpha -- one drawing exported twice was the premise, and it is false');
}

/* The dust guard: the crop must be dropping specks, never content. Both sources share one alpha, so
   one measurement covers the pair. */
const sourceWidth = (await sharp(join(SOURCE_DIR, PAIR[0].source)).metadata()).width;
const dust = inkOutsideBox(firstAlpha, sourceWidth);
const total = inkPixels(firstAlpha);
if (dust / total > DUST_FRACTION) {
  fail(
    `${((dust / total) * 100).toFixed(2)}% of the ink falls outside MARK_BOX -- that is content, not dust. ` +
      'Measure the drawing again before exporting.',
  );
}

const outputs = [];
for (const { source, out } of PAIR) {
  /* Two sharp instances rather than one pipeline: sharp applies a pre-resize `extract` in a fixed order
     that is easy to get silently wrong, and one buffer each makes the order explicit. */
  const cropped = await sharp(join(SOURCE_DIR, source)).extract(MARK_BOX).png().toBuffer();
  const fitted = await sharp(cropped)
    .resize({ width: FIT_BOX.width, height: FIT_BOX.height, fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();

  const { width, height } = await sharp(fitted).metadata();
  const canvas = sharp({
    create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{ input: fitted, left: Math.floor((CANVAS - width) / 2), top: Math.floor((CANVAS - height) / 2) }]);

  const png = await canvas.png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(join(OUT_DIR, out), png);
  outputs.push({ out, png });

  console.log(`mark: ${out}  ${width}x${height} mark centred on ${CANVAS}x${CANVAS}`);
}

/* The exports must still be one drawing on one canvas, in the same place, with no plate. */
const [lightPng, darkPng] = outputs.map((o) => o.png);
const [lightAlpha, darkAlpha] = [await alphaOf(lightPng), await alphaOf(darkPng)];
if (!lightAlpha.equals(darkAlpha)) {
  fail('the two exports disagree on alpha -- same crop and fit was the premise, and it is false');
}

const corners = [0, CANVAS - 1, (CANVAS - 1) * CANVAS, CANVAS * CANVAS - 1];
if (!corners.every((i) => lightAlpha[i] === 0)) {
  fail('a corner of the export is not transparent -- the export grew a plate');
}

for (const { out, png, ground } of outputs.map((o, i) => ({ ...o, ground: PAIR[i].ground }))) {
  const ink = await firstInk(png);
  const value = ink ? luminance(ink) : null;
  const dark = ground === 'light';
  const ok = value !== null && (dark ? value < DARK_INK_ABOVE : value > LIGHT_INK_BELOW);
  if (!ok) fail(`${out}: ink ${ink} at luminance ${value} -- the ${ground}-ground file is the wrong ink`);
  console.log(`mark: ${out}  ink ${ink} · luminance ${value.toFixed(4)}`);
}

console.log(`mark: ${dust} dust px outside the crop (${((dust / total) * 100).toFixed(3)}% of ink)`);
