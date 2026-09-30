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
 * clip paths, no masks, no `<style>` blocks — which matters, because it means a colour map is enough and
 * nothing needs to parse SVG structure.
 *
 * The sources are committed rather than read from a pictures folder, so this transform is reproducible.
 * A script that reads its input from one machine is not a transform, it is a one-way door.
 *
 * OUTPUT
 *
 * `apps/docs/public/icons/<mod>.svg`, committed like the brand logos, and inlined at render time by
 * `components/mod-icon.tsx`.
 *
 * FIVE DECISIONS, AND WHY
 *
 * 1. **The background plate is removed, not recoloured.** A full-bleed rect in a glyph is the plate the
 *    mark sat on. Recolouring it would leave an invisible element behind, and on a design whose premise is
 *    that every edge is visible, shipping an element that does nothing is the wrong instinct. Identified
 *    by *size* rather than by colour, so a white rect that is part of the mark survives.
 *
 * 2. **Tones become `currentColor` at reduced opacity.** "Black and white" could mean two values, and that
 *    would lose the second tone that gives each mark its depth — most of these have one dominant colour
 *    and one or two accent shapes. A grey is black at 45%, so opacity keeps the glyph strictly monochrome
 *    while preserving the structure, and it inherits correctly: ink at 45% on paper, paper at 45% on ink.
 *
 *    Opacity comes from **rank**, not a luminance formula. Rank is predictable across files — darkest is
 *    always full strength, and two icons with one accent look like each other. A formula would give two
 *    nearly-identical input colours quite different weights.
 *
 * 3. **White becomes `var(--icon-ground)`, not `transparent` and not `currentColor`.** Remaining white
 *    after the plate is gone is a knockout or a highlight across a solid shape — in both cases it means
 *    "whatever is behind me shows through". `transparent` would be wrong the moment a white shape overlaps
 *    a coloured one, which several of them do.
 *
 *    **Not `var(--bg)`, which was the first attempt.** The catalog's cells invert on hover: their ground
 *    becomes `--inv-bg` while `--bg` carries on meaning the page behind everything. A glyph in a hovered
 *    cell would knock its holes out in paper on an ink ground — a colour that is not behind it at all.
 *    `--icon-ground` is a dedicated token the component sets to `--bg` by default and to `--inv-bg` where
 *    the ground inverts.
 *
 * 4. **Vestigial glows are deleted.** Every source carries one shape at `opacity 0.04–0.08` — a flat-design
 *    shadow that contributes nothing at any size, and is invisible even at 48px. Dropping them is a pure
 *    simplification: no visual change, five fewer elements.
 *
 * 5. **Accents are floored at 0.45, and the rank steps raised to match.** The contact sheet that tested
 *    this showed the `0.3` accents disappearing as the glyph shrank, and a `0.18` rank would have done the
 *    same. Nothing deliberate in these marks sits below 0.45 now, so every tone survives being drawn at
 *    16px.
 */

import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, '..');

const SOURCE_DIR = join(SITE, 'design', 'icons-source');
const OUT_DIR = join(SITE, 'apps', 'docs', 'public', 'icons');

/** Anything fainter than this is a vestigial glow rather than a deliberate tone. */
const GLOW_FLOOR = 0.15;

/** Nothing deliberate sits below this, so every tone survives a 16px render. */
const ACCENT_FLOOR = 0.45;

/** Opacity by rank, darkest first. Above `ACCENT_FLOOR` on purpose — see decision 5. */
const BY_RANK = [1, 0.6, 0.45, 0.32];

/** sRGB relative luminance, 0 (black) to 1 (white). Only used for ranking tones. */
function luminance(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

const isWhite = (hex) => /^#(fff|ffffff)$/i.test(hex);

function transform(id, raw) {
  const viewBox = /viewBox="([^"]+)"/.exec(raw)?.[1] ?? '0 0 256 256';
  const [, , vbW, vbH] = viewBox.split(/\s+/).map(Number);

  let body = raw.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

  // 1. The plate: a rect covering the whole viewBox. By size, not by colour.
  let removedPlate = false;
  body = body.replace(/<rect\b[^>]*\/?>/g, (tag) => {
    const w = Number.parseFloat(/width="([\d.]+)"/.exec(tag)?.[1] ?? '0');
    const h = Number.parseFloat(/height="([\d.]+)"/.exec(tag)?.[1] ?? '0');
    if (w >= vbW && h >= vbH) {
      removedPlate = true;
      return '';
    }
    return tag;
  });

  /*
   * The sources' own comments describe the source design, and one of them says the icon has "a flat,
   * solid background" — which stopped being true the moment the plate came out. A generated file should
   * not carry a claim its own transformation has invalidated.
   */
  body = body.replace(/<!--[\s\S]*?-->/g, '');

  // 4. Delete the vestigial glows. Every one is a self-closing shape, so this is exact rather than clever.
  let glowsDropped = 0;
  body = body.replace(/<[a-z]+\b[^>]*?\/>/gi, (tag) => {
    const m = /\bopacity="([\d.]+)"/.exec(tag);
    if (!m || Number(m[1]) >= GLOW_FLOOR) return tag;
    glowsDropped += 1;
    return '';
  });

  // 5. Raise what survives, so a tone cannot vanish by being drawn small.
  body = body.replace(/\bopacity="([\d.]+)"/g, (whole, v) => {
    const n = Number(v);
    return n >= GLOW_FLOOR && n < ACCENT_FLOOR ? `opacity="${ACCENT_FLOOR}"` : whole;
  });

  // 2. Rank the tones. White is the ground, not a tone.
  const colours = new Set();
  for (const m of body.matchAll(/(?:fill|stroke)="(#[0-9a-fA-F]{3,6})"/g)) colours.add(m[1].toLowerCase());

  const tones = [...colours].filter((c) => !isWhite(c)).sort((a, b) => luminance(a) - luminance(b));
  const opacity = new Map(tones.map((c, i) => [c, BY_RANK[Math.min(i, BY_RANK.length - 1)]]));

  const replacement = (hex) => {
    const h = hex.toLowerCase();
    if (isWhite(h)) return { value: 'var(--icon-ground)', opacity: null };
    const op = opacity.get(h) ?? 1;
    // Omitted at full strength, so the common case stays readable in the output.
    return { value: 'currentColor', opacity: op === 1 ? null : op };
  };

  /*
   * 3. Rewrite every fill and stroke.
   *
   * `fill="none"` / `stroke="none"` are left alone — they are the outline-only shapes, and turning them
   * into a colour would fill a shape meant to be a stroke.
   *
   * Where a tone needs an opacity it is added as an attribute on the same element. Not a wrapping `<g>`:
   * `opacity` on a group applies to the group's rendered result, so overlapping shapes inside one group
   * blend as a unit and their overlap darkens differently from the same shapes at element level.
   */
  let mapped = 0;
  body = body.replace(/(fill|stroke)="(#[0-9a-fA-F]{3,6})"/g, (_w, attr, hex) => {
    const r = replacement(hex);
    mapped += 1;
    return r.opacity === null ? `${attr}="${r.value}"` : `${attr}="${r.value}" opacity="${r.opacity}"`;
  });

  /*
   * A source shape can carry its own `opacity` *and* receive one from the rank, which would put two
   * `opacity` attributes on one element — invalid, and the browser keeps whichever it reads first.
   * Multiplied rather than replaced, because these mean different things: the source's is how strong that
   * shape is meant to be, the rank's is which tone it is.
   */
  body = body.replace(
    /\bopacity="([\d.]+)"([^>]*?)\bopacity="([\d.]+)"/g,
    (_w, a, mid, b) => `opacity="${(Number(a) * Number(b)).toFixed(3)}"${mid}`,
  );

  // Collapse the blank lines the removals leave behind, so the output stays readable.
  body = body
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .filter((line, i, all) => line !== '' || (all[i - 1] ?? '') !== '')
    .join('\n')
    .trim()
    // Re-indent: the sources are deeply nested and the removals leave the remainder over-indented.
    .split('\n')
    .map((line) => (line.trim() === '' ? '' : `  ${line.trim()}`))
    .join('\n');

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none" aria-hidden="true">`,
    body,
    '</svg>',
    '',
  ].join('\n');

  return { svg, removedPlate, glowsDropped, mapped, tones: tones.length, bytes: svg.length };
}

/* ------------------------------------------------------------------ */

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
    const r = transform(id, raw);
    writeFileSync(join(OUT_DIR, `${id}.svg`), r.svg, 'utf8');

    // A surviving hex would mean the transform missed a shape, and a coloured glyph in a monochrome
    // design is the loudest possible failure. Verified here as well as in `check.mjs`, because this is
    // where it can be reported against the file that caused it.
    const leftover = [...r.svg.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0]);
    if (leftover.length > 0) {
      console.error(`  ! ${id.padEnd(10)} ${leftover.length} colour(s) survived: ${[...new Set(leftover)].join(' ')}`);
      problems += 1;
    }

    console.log(
      `  ${id.padEnd(10)} ${String(r.mapped).padStart(2)} mapped   ` +
        `${r.tones} tone(s)   ${r.glowsDropped} glow(s) dropped   ` +
        `${r.removedPlate ? 'plate gone' : 'NO PLATE FOUND'}   ${r.bytes} bytes`,
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
