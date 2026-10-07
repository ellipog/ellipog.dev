#!/usr/bin/env node
/**
 * icons.mjs -- put each mod's mark where the site can serve it.
 *
 * Run: `bun run icons`
 *
 * WHAT THE SOURCES ARE
 *
 * `design/icons-source/<mod>.png`, one per listed mod: the **no-background** export of the mod's own
 * icon, 48 pixels square, one flat ink on transparency. They are the same artwork the mods ship as
 * their loader icon (`assets/<mod>/icon.png` in each repository), so the mark in the catalog is the
 * mark in the mod list rather than a second drawing of the same idea.
 *
 * WHY THERE IS NO TRANSFORM LEFT
 *
 * The old pipeline read a 256-viewBox SVG carrying a white plate, a brand colour and its tints, and
 * rewrote the lot into `currentColor` at ranked opacities plus `var(--icon-ground)` knockouts — which
 * was necessary, because an SVG only takes the page's colour where every shape is told to.
 *
 * A flat silhouette needs none of that. `components/mod-icon.tsx` draws it as a **CSS mask**: the
 * shape comes from the file's alpha channel and the ink is whatever `currentColor` resolves to. So
 * one file works in both themes, the catalog's hover inversion is followed for free, and there is no
 * colour to rewrite. The copy below is byte-for-byte the source, because with nothing to rewrite a
 * re-encode would only put a diff between the served file and the committed one.
 *
 * WHAT IS LEFT, AND WHY IT IS STILL A SCRIPT
 *
 * The part that is invisible when it is wrong. Each source is **read** (`lib/png-ink.mjs`) and refused
 * if it is a picture of a mark rather than a mark:
 *
 *   - **No ground.** The four corners must be fully transparent. A plate exported into the file is a
 *     rectangle of a second paper colour in a design whose premise is that every edge is visible — and
 *     as a mask it would be a solid square of ink, which is worse than the plate was.
 *   - **A dark ink.** The mask throws the colour away, so a light-ink file would still *work* and be
 *     the wrong file: the export is the dark one, and the day one arrives inverted the check should
 *     say so rather than quietly serving it.
 *   - **A mark to find.** A file with no opaque pixel at all renders as nothing, and "the icon is
 *     missing" and "the icon is empty" look identical on the page.
 *   - **A footprint the CSS can scale.** `.mod-icon` scales the mask by one fixed factor, which is only
 *     right while every mark sits in a similar part of its square. A mark drawn to the edge, or drawn
 *     half the size, renders at the wrong size with nothing else to notice — the same class of failure
 *     as the two-file theme switch that resized one half of the site's own mark.
 *
 * OUTPUT
 *
 * `apps/docs/public/icons/<mod>.png`, committed, and drawn as a mask by `components/mod-icon.tsx`.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readInk } from './lib/png-ink.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, '..');

const SOURCE_DIR = join(SITE, 'design', 'icons-source');
const OUT_DIR = join(SITE, 'apps', 'docs', 'public', 'icons');

/*
 * The footprint the one CSS scale factor assumes, as fractions of the source square.
 *
 * The marks are drawn in the middle of their square with room to breathe — 50 to 63 per cent of it
 * today — and `.mod-icon` scales the mask to 130 per cent so that the ink lands at about two thirds of
 * the box's width, which is where the vector glyphs these replaced sat. A mark outside this range
 * would render visibly larger or smaller than its neighbours, and the numbers are asserted here rather
 * than described in a comment because that is the failure nobody sees.
 */
const MIN_FOOTPRINT = 0.45;
const MAX_FOOTPRINT = 0.8;
/** How far the ink's centre may sit from the square's, as a fraction. */
const MAX_OFF_CENTRE = 0.06;
/** Below this sRGB relative luminance the ink is the dark export. */
const MAX_INK_LUMINANCE = 0.2;

if (!existsSync(SOURCE_DIR)) {
  console.error(`icons: no sources at ${SOURCE_DIR}`);
  console.error('Each mod needs design/icons-source/<mod>.png. Nothing to do.');
  process.exit(1);
}

const sources = readdirSync(SOURCE_DIR).filter((f) => f.endsWith('.png')).sort();
if (sources.length === 0) {
  console.error(`icons: ${SOURCE_DIR} has no .png files`);
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

console.log(`icons: ${sources.length} source(s) in design/icons-source\n`);

let problems = 0;

for (const file of sources) {
  const id = file.replace(/\.png$/, '');
  const from = join(SOURCE_DIR, file);
  const to = join(OUT_DIR, `${id}.png`);

  try {
    const mark = readInk(from);
    const failures = [];

    if (!mark.bbox) {
      failures.push('no opaque pixel at all');
    }
    if (mark.cornerAlphas.some((a) => a !== 0)) {
      failures.push(`a ground is exported into it (corners ${mark.cornerAlphas.join('/')})`);
    }
    if (mark.luminance === null || mark.luminance > MAX_INK_LUMINANCE) {
      failures.push(`ink is ${mark.ink} (luminance ${mark.luminance?.toFixed(3) ?? '?'}) — not the dark export`);
    }

    if (mark.bbox) {
      const { minX, minY, maxX, maxY } = mark.bbox;
      const widest = Math.max(maxX - minX + 1, maxY - minY + 1) / mark.width;
      const offCentre = Math.max(
        Math.abs((minX + maxX) / 2 - (mark.width - 1) / 2),
        Math.abs((minY + maxY) / 2 - (mark.height - 1) / 2),
      ) / mark.width;

      if (widest < MIN_FOOTPRINT || widest > MAX_FOOTPRINT) {
        failures.push(
          `the ink is ${(widest * 100).toFixed(0)}% of the square — outside ${MIN_FOOTPRINT * 100}-${MAX_FOOTPRINT * 100}%`,
        );
      }
      if (offCentre > MAX_OFF_CENTRE) {
        failures.push(`the ink sits ${(offCentre * 100).toFixed(0)}% off centre`);
      }

      if (failures.length === 0) {
        copyFileSync(from, to);
      }

      console.log(
        `  ${id.padEnd(10)} ${mark.width}x${mark.height}  ${mark.ink}  ` +
          `${(widest * 100).toFixed(0)}% of the square  ` +
          `${statSync(from).size} bytes` +
          (failures.length === 0 ? '' : `  <- ${failures.join('; ')}`),
      );
    } else {
      console.log(`  ${id.padEnd(10)} ${mark.width}x${mark.height}  <- ${failures.join('; ')}`);
    }

    problems += failures.length > 0 ? 1 : 0;
  } catch (err) {
    console.error(`  ! ${id.padEnd(10)} FAILED: ${err.message}`);
    problems += 1;
  }
}

/*
 * The mods without a source, reported rather than silently missing.
 *
 * `mod-icon.tsx` renders a dashed placeholder for these, which is the honest treatment — a slot waiting
 * to be filled reads better than a row that is mysteriously narrower than its neighbours.
 */
const manifest = JSON.parse(readFileSync(join(SITE, 'manifest.json'), 'utf8'));
const missing = manifest.suite.filter((m) => !existsSync(join(OUT_DIR, `${m.id}.png`)));

if (missing.length > 0) {
  console.log(`\n  no source yet: ${missing.map((m) => m.id).join(', ')}`);
  console.log('  -> components/mod-icon.tsx renders a dashed placeholder for these.');
}

console.log(`\nicons: ${sources.length - problems}/${sources.length} written to apps/docs/public/icons/`);
if (problems > 0) process.exitCode = 1;
