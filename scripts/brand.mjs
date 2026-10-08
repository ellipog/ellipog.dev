#!/usr/bin/env node
/**
 * brand.mjs -- turn the brand logos into monochrome marks the site can inline.
 *
 * Run: bun run brand
 *
 * Two marks, one transform, and a table rather than a copy of this script per logo. The table is the
 * whole shape of it: a source, its quirks, and the file it becomes. The quirks are the only part that
 * differs between the two, and they are the part worth writing down — every one of them is a thing that
 * renders *correctly in light mode*, which is what makes them worth a script instead of an eye.
 *
 * THE SOURCES
 *
 * `design/brand-source/bisecthosting.svg` — the **light** variant, committed. The dark one is the same
 * artwork recoloured for a dark background, so once the mark takes its colour from the page there is only
 * one file to keep and the four-state CSS that switched between two images disappears entirely.
 *
 * `design/brand-source/kofi.svg` — Ko-fi's wordmark, committed verbatim from their brand asset pack
 * (the `kofi_brandasset.zip` that also carries a symbol and four coloured "Support me on Ko-fi" badges,
 * none of which are used: a coloured raster cannot take `currentColor` and cannot follow the hover
 * inversion, and the row needs both).
 *
 * THREE THINGS THE HOST'S FILE HAS THAT THE MOD ICONS DO NOT
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
 * THREE THINGS KO-FI'S FILE HAS, AND THE THIRD IS A DARK-MODE BUG
 *
 * 1. **The named colour `white`, everywhere it matters.** The wordmark's own capsule, the letterforms
 *    inside it and the cup's interior are all `fill="white"` rather than a hex. White is what the
 *    transform calls *the ground* — the field a knockout shows through — so left named it survived as
 *    literal paper. That looks right on a light page and is a **white slab with dark knockouts on a dark
 *    one**, which is the failure this whole pipeline exists to catch: correct in the theme it was drawn
 *    in. `monochrome.mjs` now normalises the named colour before anything reads it.
 *
 * 2. **An export wrapper that is a no-op, twice over.** The artwork sits in a `<g clip-path="url(#…)">`
 *    and a `<g mask="url(#…)">`, and both definitions are a single shape covering the whole viewBox: a
 *    white luminance mask is fully opaque and a full-bleed clip path clips nothing. Inlined they are worse
 *    than useless — the `<clipPath>` lives in `<defs>`, which the class pass deletes, so the reference is
 *    left dangling; and the mask's white would be recoloured to the ground with everything else, which
 *    blanks the glyph in one theme. `stripExportWrappers` drops all three deliberately, and the report
 *    below counts them so a re-export that changes shape says so.
 *
 * 3. **The cup is a tone, not the ground, and the difference is the heart.** `#ff5a16` fills the cup's
 *    interior, and the heart is a hole knocked out of it. Declared as ground — which is what the host's
 *    cyan is — the interior *and* the heart become paper and the heart disappears. Left as a tone it
 *    ranks at `currentColor @ 0.6`, and the mark reads as an engraved cup with a knocked-out heart. So
 *    this entry passes no `ground`, and that is a decision rather than an omission.
 *
 * WHERE THEY GO
 *
 * `apps/docs/public/brand/bisecthosting.svg` and `.../kofi.svg`, both committed, and inlined by
 * `components/brand-mark.tsx` — **not** loaded as an `<img>`, for the same reason the mod icons are not:
 * an SVG in an `<img>` is a separate document with no access to the page's CSS, so `currentColor` and
 * `var(--icon-ground)` would both fail to resolve and the mark would be black-on-dark with its interior
 * filled in.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { toMonochrome } from './lib/monochrome.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, '..');

const SOURCE_DIR = join(SITE, 'design', 'brand-source');
const OUT_DIR = join(SITE, 'apps', 'docs', 'public', 'brand');

/*
 * The two marks, and everything that differs between them.
 *
 * `clusterWithin` is stated by both rather than left to the default, because the number is a judgement
 * about the artwork: 0.02 is small enough that the mod icons' genuine facet tones stay apart, and the
 * host's two blacks (0.000 and 0.006) land in one cluster.
 */
const MARKS = [
  {
    id: 'bisecthosting',
    options: {
      // Fold the `<style>` classes in and delete the block, or it leaks into the page.
      resolveClasses: true,
      // The cyan is the hexagon's interior field, not a tone. Named rather than inferred, because "is
      // this fill a field or a tone" is a judgement about the artwork that no amount of parsing answers.
      ground: ['#03ddff'],
      clusterWithin: 0.02,
    },
  },
  {
    id: 'kofi',
    options: {
      // The `<defs>`, the full-bleed `<mask>` and the two attributes that point at them.
      stripExportWrappers: true,
      // No `ground`: the orange cup is a tone, and mapping it to the ground would erase the heart.
      clusterWithin: 0.02,
    },
  },
];

mkdirSync(OUT_DIR, { recursive: true });

let failed = false;

for (const mark of MARKS) {
  const source = join(SOURCE_DIR, `${mark.id}.svg`);
  const out = join(OUT_DIR, `${mark.id}.svg`);

  if (!existsSync(source)) {
    console.error(`brand: no source at ${source}`);
    failed = true;
    continue;
  }

  const { svg, report } = toMonochrome(readFileSync(source, 'utf8'), mark.options);
  writeFileSync(out, svg, 'utf8');

  console.log(`brand: ${mark.id} — ${report.bytes} bytes -> apps/docs/public/brand/${mark.id}.svg`);
  console.log(`  viewBox            ${report.viewBox}`);
  console.log(`  class refs folded  ${report.classesResolved}   (the <style> block is gone)`);
  console.log(`  export wrappers    ${report.wrappersDropped}   (defs, mask, and the refs to them)`);
  console.log(`  colours mapped     ${report.mapped}`);
  console.log(`  ranks              ${report.clusters.join('  ')}`);
  console.log(`  background plate   ${report.removedPlate ? 'removed' : 'none found'}`);
  console.log(`  glows dropped      ${report.glowsDropped}`);

  /* A surviving hex would mean the transform missed a shape, and a coloured mark in a monochrome design
     is the loudest possible failure. Reported against the file that caused it — and the named colour is
     checked separately, because a `fill="white"` that reached the output is the one that only shows up
     in dark mode. */
  const leftover = [...new Set(svg.match(/#[0-9a-f]{6}\b/gi) ?? [])];
  const namedWhite = /(?:fill|stroke)="white"/i.test(svg);

  if (leftover.length > 0 || namedWhite) {
    console.error(
      `\n  ! ${mark.id}: ${[
        ...leftover,
        ...(namedWhite ? ['a surviving fill="white"'] : []),
      ].join(' ')}`,
    );
    failed = true;
  } else {
    console.log('  no hex and no named colour — the mark is currentColor and the ground token only');
  }
}

if (failed) process.exitCode = 1;

/*
 * A leftover variant, reported rather than deleted.
 *
 * The migration is done — `brand-mark.tsx` inlines these glyphs and the four `sponsor-logo` rules are
 * gone — so the old files have no job. Deleting them from a build script would be a surprise, but leaving
 * them silently in `public/` would ship two unused images and invite somebody to wire them back up. So:
 * named, with the command to remove them.
 */
for (const stale of ['bisecthosting-light.svg', 'bisecthosting-dark.svg']) {
  if (existsSync(join(OUT_DIR, stale))) {
    console.log(
      `\n  ! ${stale} is still in apps/docs/public/brand/ — it has no job since the mark went monochrome.\n` +
        `    Delete it: the glyph takes its colour from the page, so one file serves both themes.`,
    );
  }
}
