#!/usr/bin/env node
/**
 * site-mark.mjs -- turn the site's own favicon into the mark in the site's masthead.
 *
 * Run: bun run site-mark
 *
 * WHAT THE SOURCE IS
 *
 * `apps/docs/public/favicon.svg`, the tab icon, which is the only committed copy of the site's identity.
 * It is deliberately not one of the mod marks -- a favicon is the *site's* identity, and a tab showing
 * Armature's glyph while the reader is on Tasked's page would be saying something untrue. It is also the
 * same file byte for byte as `aaenz/public/favicon.svg` in the studio repository.
 *
 * That one file is the source for two things now, and that is the point: the tab icon, which
 * `metadata.icons` in `app/layout.tsx` points at directly, and the mark beside the wordmark, by way of
 * this script. One drawing, two jobs, and nothing to keep in step by hand.
 *
 * It replaced the Modrinth avatar, which was a build-time download of the account's profile picture -- a
 * photograph of a person standing in for the site, the one thing on the page with no dark variant, and
 * the only mark that could go missing when a fetch failed.
 *
 * THE ONE DECISION: THE PLATE COMES OFF
 *
 * The favicon is drawn on a `#f3f1ec` paper tile, full-bleed. That is right for a browser tab, where the
 * icon sits in chrome this design does not own, and wrong in the masthead, where it would be a small
 * rectangle of a second paper colour sitting on the page's own. The transform removes it by *size* -- a
 * rect covering the whole viewBox -- exactly as `icons.mjs` does with the mod icons.
 *
 * What is left is strokes only: an outline and two legs, all `#101010`, all `currentColor` at full
 * strength, with `fill="none"` untouched. There is no second tone to rank and no white to knock out, which
 * makes this the simplest version of the transform and the only mark on the site that needs neither a rank
 * nor `--icon-ground`. The assertion that it wanted nothing else is that the generated file contains no
 * `var(--icon-ground)` at all.
 *
 * OUTPUT
 *
 * `apps/docs/public/site/ellipog.svg`, committed, and inlined by `components/site-mark.tsx`.
 *
 * THE TRANSFORM ITSELF lives in `scripts/lib/monochrome.mjs`, shared with `icons.mjs` and `brand.mjs`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { toMonochrome } from './lib/monochrome.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, '..');

/** The tab icon, which is also the input to this transform. See the note at the top. */
const SOURCE = join(SITE, 'apps', 'docs', 'public', 'favicon.svg');
const OUT_DIR = join(SITE, 'apps', 'docs', 'public', 'site');
const OUT = join(OUT_DIR, 'ellipog.svg');

if (!existsSync(SOURCE)) {
  console.error(`site-mark: no source at ${SOURCE}`);
  console.error('That file is the tab icon, so without it there is no site identity to derive from.');
  process.exit(1);
}

const raw = readFileSync(SOURCE, 'utf8');

let svg;
let report;
try {
  /*
   * Every option is the default, and that is worth saying out loud because the other two callers both
   * state `clusterWithin`.
   *
   * `brand.mjs` needs it at 0.02 to merge two blacks that are meant to read as one, and `icons.mjs` needs
   * it at 0.02 to keep Armature's two facet tones apart. This artwork has neither: one stroke colour, so
   * there is nothing to cluster and nothing to keep apart, and a number here would be a stated preference
   * with nothing to express.
   */
  ({ svg, report } = toMonochrome(raw));
} catch (err) {
  console.error(`site-mark: transform failed: ${err.message}`);
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, svg, 'utf8');

console.log(`site-mark: ${SOURCE.replace(`${SITE}/`, '')} -> apps/docs/public/site/ellipog.svg\n`);
console.log(
  `  ${String(report.mapped).padStart(2)} mapped   ${report.tones} tone(s)   ` +
    `${report.removedPlate ? 'plate gone' : 'NO PLATE FOUND'}   ${report.bytes} bytes`,
);

/*
 * Two failures, and both are invisible at a glance rather than obvious: a surviving hex is a colour in a
 * monochrome design, and a plate that stayed behind is a rectangle of a second paper colour that reads as
 * a slightly wrong background. `check.mjs` asserts the same two against the generated file.
 */
const leftover = [...new Set(svg.match(/#[0-9a-f]{6}\b/gi) ?? [])];
if (leftover.length > 0) console.error(`  ! ${leftover.length} colour(s) survived: ${leftover.join(' ')}`);
if (!report.removedPlate) console.error('  ! the paper plate was not found -- the mark will sit on a tile');

if (leftover.length > 0 || !report.removedPlate) process.exitCode = 1;
