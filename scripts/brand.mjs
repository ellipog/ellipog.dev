#!/usr/bin/env node
/**
 * brand.mjs -- turn the BisectHosting logo into a monochrome mark the site can inline.
 *
 * Run: bun run brand
 *
 * THE SOURCE
 *
 * `design/brand-source/bisecthosting.svg` — the **light** variant, committed. The dark one is the same
 * artwork recoloured for a dark background, so once the mark takes its colour from the page there is only
 * one file to keep and the four-state CSS that switched between two images disappears entirely.
 *
 * THREE THINGS THIS FILE HAS THAT THE MOD ICONS DO NOT
 *
 * 1. **A `<style>` block.** `.cls-1{fill:#000}` and `.cls-3{fill:#0d1129}`, referenced by `class="cls-1"`
 *    on the shapes. An inline SVG's `<style>` is **document-scoped** — inlining this with the block
 *    intact would leak those two rules into the entire page. They are folded into `fill` attributes and
 *    the block is deleted, which is the only safe way to inline a file that carries one.
 *
 * 2. **Two nearly-identical blacks.** The wordmark is `#000` (luminance 0.000) and the hexagon beside it
 *    is `#0d1129` (0.006). Per-colour ranking would give them different weights and the artwork would fall
 *    apart into a black word and a grey icon, which was never the design. The transform clusters colours
 *    within a luminance distance before ranking, so they share the darkest rank — and the threshold is
 *    small enough that the mod icons' genuine facet tones stay apart.
 *
 * 3. **A brand colour that is structurally the ground.** `#03ddff` is not a tone: it fills the hexagon's
 *    interior, with the ink brackets drawn on top of it. Mapping it to a grey would give three values and
 *    a muddy middle. Mapping it to the ground gives **ink hexagon, paper interior, ink detail** — which is
 *    both the faithful reading of the artwork and literally two-colour, which is what "purely black and
 *    white" asks for.
 *
 * WHERE IT GOES
 *
 * `apps/docs/public/brand/bisecthosting.svg`, committed, and inlined by `components/brand-mark.tsx` —
 * **not** loaded as an `<img>`, for the same reason the mod icons are not: an SVG in an `<img>` is a
 * separate document with no access to the page's CSS, so `currentColor` and `var(--icon-ground)` would
 * both fail to resolve and the mark would be black-on-dark with its interior filled in.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { toMonochrome } from './lib/monochrome.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, '..');

const SOURCE = join(SITE, 'design', 'brand-source', 'bisecthosting.svg');
const OUT_DIR = join(SITE, 'apps', 'docs', 'public', 'brand');
const OUT = join(OUT_DIR, 'bisecthosting.svg');

if (!existsSync(SOURCE)) {
  console.error(`brand: no source at ${SOURCE}`);
  console.error('Expected design/brand-source/bisecthosting.svg — the light variant.');
  process.exit(1);
}

const raw = readFileSync(SOURCE, 'utf8');

const { svg, report } = toMonochrome(raw, {
  // Fold the `<style>` classes in and delete the block, or it leaks into the page.
  resolveClasses: true,

  /*
   * The cyan is the hexagon's interior field, not a tone. Named rather than inferred, because "is this
   * fill a field or a tone" is a judgement about the artwork that no amount of parsing answers.
   */
  ground: ['#03ddff'],

  /*
   * Tighter than the default, and the number matters.
   *
   * The brand needs `#000` (0.000) and `#0d1129` (0.006) to share a rank. Armature's mark has `#0f172a`
   * (0.009) and `#334155` (0.052), which are *deliberate* facets and must stay apart. 0.02 sits between
   * those two gaps with room either side; anything larger merges Armature's facets and anything smaller
   * splits the brand's blacks.
   */
  clusterWithin: 0.02,
});

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, svg, 'utf8');

/* A surviving hex would mean the transform missed a shape, and a coloured mark in a monochrome design is
   the loudest possible failure. Reported against the file that caused it. */
const leftover = [...new Set(svg.match(/#[0-9a-f]{6}\b/gi) ?? [])];

console.log(`brand: ${report.bytes} bytes -> apps/docs/public/brand/bisecthosting.svg`);
console.log(`  viewBox            ${report.viewBox}`);
console.log(`  class refs folded  ${report.classesResolved}   (the <style> block is gone)`);
console.log(`  colours mapped     ${report.mapped}`);
console.log(`  ranks              ${report.clusters.join('  ')}`);
console.log(`  background plate   ${report.removedPlate ? 'removed' : 'none found'}`);
console.log(`  glows dropped      ${report.glowsDropped}`);

if (leftover.length > 0) {
  console.error(`\n  ! ${leftover.length} colour(s) survived: ${leftover.join(' ')}`);
  process.exitCode = 1;
} else {
  console.log('  no hex colours remain — the mark is currentColor and the ground token only');
}

/*
 * A leftover variant, reported rather than deleted.
 *
 * The migration is done — `brand-mark.tsx` inlines this glyph and the four `sponsor-logo` rules are gone
 * — so the old files have no job. Deleting them from a build script would be a surprise, but leaving them
 * silently in `public/` would ship two unused images and invite somebody to wire them back up. So: named,
 * with the command to remove them.
 */
for (const stale of ['bisecthosting-light.svg', 'bisecthosting-dark.svg']) {
  if (existsSync(join(OUT_DIR, stale))) {
    console.log(
      `\n  ! ${stale} is still in apps/docs/public/brand/ — it has no job since the mark went monochrome.\n` +
        `    Delete it: the glyph takes its colour from the page, so one file serves both themes.`,
    );
  }
}
