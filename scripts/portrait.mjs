#!/usr/bin/env node
/**
 * portrait.mjs -- export the masthead portrait from the matte committed in `design/portrait-source/`.
 *
 * Run: bun scripts/portrait.mjs
 *
 * WHAT THIS IS
 *
 * The drawing beside the wordmark in the masthead: Rei Ayanami, drawn by dino_dinoartforame, with her
 * white ground cut away. It is the author's profile picture on every platform, carried here for the same
 * reason it is carried there — it is what the name looks like. It is **not the site's mark**: the mark
 * still does the site's jobs (the tab, and the card a link to this site shows), and this file only ever
 * appears in one place, in front of the name it belongs to.
 *
 * THE SOURCE, AND THE ONE HAND-SUPPLIED STEP
 *
 * `design/portrait-source/rei-ayanami-cutout.png` is the artwork with its background removed: a full
 * RGBA matte, committed. The matte was produced once, by hand, with `rembg`'s `isnet-anime` model —
 *
 *     python -c "from rembg import remove; remove('rei-ayanami.jpg', 'rei-ayanami-cutout.png')"
 *
 * — and that step lives outside this repository the same way the stellar marks' sources do: it is the
 * top of the chain, and it is recorded rather than reproduced. A colour key is not an option here and
 * that is the whole point of using a matte: the plugsuit is white on a white ground, so keying on colour
 * punches holes in the figure. `.gitignore`-style reproducibility stops at this file; everything below it
 * is this script.
 *
 * WHY ONE FILE AND NO THEME PAIR
 *
 * Every other raster here is a two-file switch, because a mark's ink has to flip with the ground. A
 * portrait cannot flip — the colours are the drawing — so the transparency does the work instead: one
 * file, drawn on whatever ground the page has. `check.mjs` asserts the export has a transparent ground,
 * which is the property the whole arrangement rests on.
 *
 * THE GEOMETRY, AND WHY EACH NUMBER IS WHAT IT IS
 *
 * - **168px canvas.** Six times the 28px box `.site-portrait` reserves. The pair this replaced was
 *   ~49KB per file and fetched one of the two; this is ~40KB and the only file fetched, so the masthead
 *   gets lighter while the drawing gets more pixels than the mark ever had.
 * - **95% footprint.** The mark's 78% was cut to the weight of the wordmark beside it, which is a
 *   different job: a mark is a glyph and wants air, a portrait fills its slot like an avatar. At 95% the
 *   artwork's own tips still clear the box edge — the ink box is measured below, not assumed — so
 *   nothing is clipped and nothing touches.
 * - **Trim, fit, centre.** The ink box is measured from the alpha channel (>8, so the feathered rim is
 *   not mistaken for content), the content is fitted inside the footprint preserving its aspect, and the
 *   result is centred on the square. Same three moves `mark.mjs` makes, for the same reason: the source's
 *   own margins are not the composition, and a square canvas means a `contain` fit cannot distort it.
 */

import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, '..');

const SOURCE = join(SITE, 'design', 'portrait-source', 'rei-ayanami-cutout.png');
const OUT = join(SITE, 'apps', 'docs', 'public', 'site', 'portrait.png');

/** Six times the 28px box; see the header for the byte and footprint reasoning. */
const CANVAS = 168;
/** The share of the canvas the artwork's longest side fills. */
const FOOTPRINT = 0.95;
/** Alpha at or below this is the feathered rim, not content. */
const ALPHA_THRESHOLD = 8;

const fail = (message) => {
  console.error(`portrait: ${message}`);
  process.exit(1);
};

if (!existsSync(SOURCE)) {
  fail(`${SOURCE} is missing -- the matte in design/portrait-source is the only input`);
}

const image = sharp(SOURCE);
const meta = await image.metadata();
if (!meta.hasAlpha) fail(`${SOURCE} has no alpha channel -- a matte without one is a background`);

/** The ink box, measured from raw alpha -- the same measurement `check.mjs` makes of the export. */
const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let minX = info.width;
let minY = info.height;
let maxX = -1;
let maxY = -1;
for (let y = 0; y < info.height; y++) {
  for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] > ALPHA_THRESHOLD) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
}
if (maxX === -1) fail(`${SOURCE} is fully transparent -- there is nothing to export`);

const box = { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
const fit = Math.round(CANVAS * FOOTPRINT);
const scale = fit / Math.max(box.width, box.height);
const art = { width: Math.max(1, Math.round(box.width * scale)), height: Math.max(1, Math.round(box.height * scale)) };

/*
 * Extract, fit, centre -- three sharp calls, each doing one thing, so a pre-resize `extract` cannot be
 * reordered by sharp's pipeline without this file noticing. The matte's transparent ground carries its
 * nearest edge colour (dilated when the matte was made), so a plain downscale here cannot pull white into
 * the rim.
 */
const cut = await sharp(SOURCE)
  .extract(box)
  .resize({ width: art.width, height: art.height, fit: 'fill', kernel: 'lanczos3' })
  .png()
  .toBuffer();

const png = await sharp({
  create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite([{ input: cut, left: Math.round((CANVAS - art.width) / 2), top: Math.round((CANVAS - art.height) / 2) }])
  .png({ compressionLevel: 9 })
  .toBuffer();

/*
 * The guards. No plate, one square file, and the content where the geometry above says it is -- checked
 * on the bytes that are about to be written, not on the intentions above.
 */
const written = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const alphaAt = (x, y) => written.data[(y * CANVAS + x) * 4 + 3];

const corners = [alphaAt(0, 0), alphaAt(CANVAS - 1, 0), alphaAt(0, CANVAS - 1), alphaAt(CANVAS - 1, CANVAS - 1)];
if (corners.some((a) => a !== 0)) fail(`a corner of the export is not transparent (${corners.join('/')}) -- it grew a plate`);

let outMinX = CANVAS;
let outMinY = CANVAS;
let outMaxX = -1;
let outMaxY = -1;
for (let y = 0; y < CANVAS; y++) {
  for (let x = 0; x < CANVAS; x++) {
    if (alphaAt(x, y) > ALPHA_THRESHOLD) {
      if (x < outMinX) outMinX = x;
      if (y < outMinY) outMinY = y;
      if (x > outMaxX) outMaxX = x;
      if (y > outMaxY) outMaxY = y;
    }
  }
}
if (
  outMaxX - outMinX + 1 !== art.width ||
  outMaxY - outMinY + 1 !== art.height ||
  outMinX < 0 ||
  outMinY < 0 ||
  outMaxX >= CANVAS ||
  outMaxY >= CANVAS
) {
  fail(`the export draws ${outMaxX - outMinX + 1}x${outMaxY - outMinY + 1} where ${art.width}x${art.height} was fitted`);
}
/* Centred within a pixel: the difference between the two margins is rounding, never position. */
if (Math.abs(outMinX - (CANVAS - 1 - outMaxX)) > 1 || Math.abs(outMinY - (CANVAS - 1 - outMaxY)) > 1) {
  fail(`the export is off centre (left ${outMinX}, right ${CANVAS - 1 - outMaxX})`);
}

writeFileSync(OUT, png);
console.log(`portrait: ${art.width}x${art.height} of art centred on ${CANVAS}x${CANVAS}, ${(png.length / 1024).toFixed(1)} KB`);
console.log(`portrait: ink box measured at ${box.width}x${box.height} in the ${meta.width}x${meta.height} matte`);
console.log(`portrait: wrote ${relative(SITE, OUT)}`);
