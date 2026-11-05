#!/usr/bin/env node
/**
 * tab-icon.mjs -- export the tab icon pair from the site's mark pair.
 *
 * Run: bun run tab-icon
 *
 * WHAT THIS IS
 *
 * The browser tab draws the site's mark, the pair in `apps/docs/public/site/mark-on-*.png` copied by hand
 * from the studio repository. Those files are 879px square and ~72KB each, and the tab draws them at 16 or
 * 32 pixels: every first visit to either site downloaded about seventy kilobytes to make a 32px picture.
 *
 * This script resizes the same pair to 64px -- twice the 32px a 2x tab draws -- and writes
 * `tab-on-light.png` and `tab-on-dark.png` beside them, about 2KB each. **It is the same drawing, not a
 * second one**: nothing here is artwork, so there is still one mark to keep in step, and re-running this
 * after the pair is re-copied is the whole of keeping the tab in step with it. The 879px pair stays the
 * source, and stays what the link card (`app/og.png`) and the iOS home-screen icon draw.
 *
 * The migrator (tenet.ellipog.dev) names the same tab icon, so the export is written to its
 * `public/site/` as well. `check.mjs` asserts the docs copy's geometry and ink, and that the two sites'
 * copies are the same bytes.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, '..');
const SOURCE_DIR = join(SITE, 'apps', 'docs', 'public', 'site');
const OUT_DIRS = [SOURCE_DIR, join(SITE, 'apps', 'migrator', 'public', 'site')];
/** Twice the 32px a high-density tab draws, so the browser only ever scales down. */
const SIZE = 64;

for (const ground of ['light', 'dark']) {
  const source = join(SOURCE_DIR, `mark-on-${ground}.png`);
  if (!existsSync(source)) {
    console.error(`tab-icon: ${source} is missing -- copy the pair from the studio repository first`);
    process.exit(1);
  }
  const png = await sharp(source)
    .resize(SIZE, SIZE, { fit: 'contain', kernel: 'lanczos3', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  for (const dir of OUT_DIRS) {
    const out = join(dir, `tab-on-${ground}.png`);
    writeFileSync(out, png);
    console.log(`tab-icon: ${relative(SITE, out)} -- ${SIZE}px, ${png.length} bytes`);
  }
}
