#!/usr/bin/env node
/**
 * icons.mjs -- turn the flat brand icons into monochrome glyphs the site can use.
 *
 * Run: bun run icons
 *
 * WHAT THE SOURCES ARE
 *
 * `design/icons-source/<mod>.svg`, five files, all the same shape of document: a `0 0 256 256` viewBox, a
 * full-bleed white background rect, one dominant brand colour with one or two lighter tints of it, white
 * used as knockouts, and several shapes stroked with `fill="none"` rather than filled. No gradients, no
 * clip paths, no masks, no `<style>` blocks — which is why the shared transform needs no class-resolution
 * step for these.
 *
 * The sources are committed rather than read from a pictures folder, so this transform is reproducible.
 * A script that reads its input from one machine is not a transform, it is a one-way door.
 *
 * OUTPUT
 *
 * `apps/docs/public/icons/<mod>.svg`, committed, and inlined by `components/mod-icon.tsx`.
 *
 * THE TRANSFORM ITSELF lives in `scripts/lib/monochrome.mjs`, shared with `brand.mjs`. That file carries
 * the reasoning for every step — the plate, the vestigial glows, the accent floor, rank-based opacity,
 * luminance clustering and why the knockout points at `--icon-ground` rather than `--bg`. Read it before
 * changing anything here; the two callers disagree only in their options.
 *
 * WHAT IS SPECIFIC TO THE MOD MARKS
 *
 * - **No class resolution.** These files carry no `<style>`, so there is nothing to fold in. The brand
 *   logo does, which is the one option that differs between the two callers.
 * - **`clusterWithin: 0.02`.** These marks have genuine facet tones — Armature's `#0f172a` and `#334155`
 *   are 0.043 apart — that must stay distinguishable as separate ranks.
 */

import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { toMonochrome } from './lib/monochrome.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, '..');

const SOURCE_DIR = join(SITE, 'design', 'icons-source');
const OUT_DIR = join(SITE, 'apps', 'docs', 'public', 'icons');

if (!existsSync(SOURCE_DIR)) {
  console.error(`icons: no sources at ${SOURCE_DIR}`);
  console.error('Each mod needs design/icons-source/<mod>.svg. Nothing to do.');
  process.exit(1);
}

const sources = readdirSync(SOURCE_DIR).filter((f) => f.endsWith('.svg')).sort();
if (sources.length === 0) {
  console.error(`icons: ${SOURCE_DIR} has no .svg files`);
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

console.log(`icons: ${sources.length} source(s) in design/icons-source\n`);

let problems = 0;

for (const file of sources) {
  const id = file.replace(/\.svg$/, '');
  const raw = readFileSync(join(SOURCE_DIR, file), 'utf8');

  try {
    /*
     * Defaults except for `clusterWithin`, which is the one tuning knob these marks care about.
     * See the note at the top of the file — Armature's facets and the brand's blacks pull the same
     * option in opposite directions, so each caller states its own.
     */
    const { svg, report } = toMonochrome(raw, { clusterWithin: 0.02 });

    writeFileSync(join(OUT_DIR, `${id}.svg`), svg, 'utf8');

    const leftover = [...new Set(svg.match(/#[0-9a-f]{6}\b/gi) ?? [])];
    if (leftover.length > 0) {
      console.error(`  ! ${id.padEnd(10)} ${leftover.length} colour(s) survived: ${leftover.join(' ')}`);
      problems += 1;
    }

    console.log(
      `  ${id.padEnd(10)} ${String(report.mapped).padStart(2)} mapped   ` +
        `${report.tones} tone(s)   ${report.glowsDropped} glow(s) dropped   ` +
        `${report.removedPlate ? 'plate gone' : 'NO PLATE FOUND'}   ${report.bytes} bytes`,
    );
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
const missing = manifest.suite.filter((m) => !existsSync(join(OUT_DIR, `${m.id}.svg`)));

if (missing.length > 0) {
  console.log(`\n  no source yet: ${missing.map((m) => m.id).join(', ')}`);
  console.log('  -> components/mod-icon.tsx renders a dashed placeholder for these.');
}

console.log(`\nicons: ${sources.length - problems}/${sources.length} written to apps/docs/public/icons/`);
if (problems > 0) process.exitCode = 1;
