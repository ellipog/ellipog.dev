/**
 * Turn a flat, coloured SVG into a monochrome one that inherits `currentColor`.
 *
 * Written once and shared, which is now three callers rather than one. `brand.mjs` runs `toMonochrome`
 * over the band's two marks; `mark.mjs` and `lib/png-ink.mjs` (and so `icons.mjs`) read `luminance` from
 * here, so the repository has one gamma expansion instead of three. The mod marks stopped going through
 * the colour mapping when their sources became flat PNG silhouettes — a mask takes its ink from the page
 * — which is why the transform's callers are the brand marks and only them.
 *
 * WHAT IT DOES
 *
 * 1. Normalises the named colour `white` to `#ffffff`, so a source that spells it out is read by the
 *    same code as one that writes a hex. Not cosmetic: white is what this transform calls *the ground*,
 *    and an unmapped one survives as literal paper in light mode and as a white slab in dark.
 * 2. Resolves `<style>` class references into plain `fill` attributes, optionally. An inline SVG's
 *    `<style>` is **document-scoped**, so inlining a file that carries one leaks `.cls-1 { fill: #000 }`
 *    into the whole page — which is a real hazard, not a tidiness issue.
 * 3. Drops the export's own wrappers, optionally: the `<defs>`, the full-bleed luminance `<mask>` and
 *    the `mask`/`clip-path` attributes that reference them. See the option's own note below.
 * 4. Removes any full-bleed rect: the plate the mark sat on. By *size*, so a white rect that is part of
 *    the artwork survives.
 * 5. Deletes vestigial glows — shapes at very low opacity that contribute nothing at any size.
 * 6. Floors the remaining accents, because a tone faint enough to vanish when the glyph is drawn at 16px
 *    is a tone that has stopped doing its job.
 * 7. Ranks what is left into `currentColor` at graded opacity, and maps white — plus any colour named as
 *    structural ground — to `var(--icon-ground)`.
 *
 * WHY RANK RATHER THAN A FORMULA
 *
 * Rank is predictable across files: darkest is always full strength, and two icons with one accent look
 * like each other. A luminance formula gives two nearly-identical input colours quite different weights.
 *
 * WHY COLOURS ARE CLUSTERED BEFORE RANKING
 *
 * A real logo often uses two fills that are meant to read as the same darkness — `#000` for the wordmark
 * and `#0d1129` for the mark beside it, say. Luminance 0.000 and 0.006. Ranked strictly they become two
 * different weights and the artwork falls apart into a black word and a grey icon, which was never the
 * design. Colours within `clusterWithin` of each other share a rank.
 *
 * `--icon-ground`, NOT `--bg`
 *
 * A knockout means "whatever is behind me shows through". `--bg` is the *page* background, and the
 * catalog's cells invert on hover while `--bg` carries on meaning the page — so a glyph in a hovered cell
 * would knock its holes out in a colour that is not behind it. `--icon-ground` is a dedicated token the
 * component sets, and overrides wherever the ground changes.
 */

/**
 * sRGB relative luminance, 0 (black) to 1 (white).
 *
 * The gamma expansion matters: without it the numbers are not perceptual and a mid grey ranks next to a
 * near-white.
 */
export function luminance(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
const isWhite = (hex) => /^#(fff|ffffff)$/i.test(hex);

/** Every `<style>` rule of the form `.name{fill:#hex}`. */
function classFills(svg) {
  const map = new Map();
  for (const style of svg.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    for (const rule of style[1].matchAll(/\.([\w-]+)\s*\{([^}]*)\}/g)) {
      const fill = /fill\s*:\s*(#[0-9a-f]{3,6})/i.exec(rule[2]);
      if (fill) map.set(rule[1], fill[1].toLowerCase());
    }
  }
  return map;
}

/**
 * @param {string} raw            The source SVG.
 * @param {object} [options]
 * @param {boolean} [options.resolveClasses]  Fold `<style>` classes into `fill` and delete the block.
 * @param {boolean} [options.stripExportWrappers]  Drop the `<defs>`, the full-bleed `<mask>` and the
 *   `mask`/`clip-path` attributes of an export that wraps its artwork in both.
 * @param {string[]} [options.ground]  Extra colours that mean "the ground shows through" — for artwork
 *   where a bright fill is structurally the interior field rather than a tone.
 * @param {number} [options.glowFloor]   Below this opacity, a shape is considered vestigial.
 * @param {number} [options.accentFloor] Nothing deliberate sits below this.
 * @param {number[]} [options.ranks]     Opacity by rank, darkest first.
 * @param {number} [options.clusterWithin] Luminance distance within which colours share a rank. The
 *   default suits artwork with genuine facet tones; a brand with two near-identical blacks wants it
 *   tighter, and a caller that needs that says so.
 */
export function toMonochrome(raw, options = {}) {
  const {
    resolveClasses = false,
    stripExportWrappers = false,
    ground = [],
    glowFloor = 0.15,
    accentFloor = 0.45,
    ranks = [1, 0.6, 0.45, 0.32],
    clusterWithin = 0.02,
  } = options;

  const viewBox = /viewBox="([^"]+)"/.exec(raw)?.[1] ?? '0 0 256 256';
  const [, , vbW, vbH] = viewBox.split(/\s+/).map(Number);

  let body = raw.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

  /*
   * THE NAMED COLOUR, NORMALISED BEFORE ANYTHING READS IT.
   *
   * `fill="white"` is the same white as `#ffffff`, but every step below matches a hex — the colour scan,
   * the `groundSet` lookup and the rewrite — so a source that spells it out would keep a literal white.
   * That is not a cosmetic difference. White is what this transform calls **the ground**: the field a
   * knockout shows through. Unmapped, it survives as literal paper on a light page — where it looks
   * *correct*, which is the trap — and as a white slab with dark knockouts on a dark one. Ko-fi's
   * wordmark is exactly that file, its capsule and its letterforms both `fill="white"`, and the failure
   * is invisible in the theme it was written in.
   */
  body = body
    .replace(/\bfill="white"/gi, 'fill="#ffffff"')
    .replace(/\bstroke="white"/gi, 'stroke="#ffffff"');

  let classesResolved = 0;
  if (resolveClasses) {
    const fills = classFills(body);
    for (const [name, hex] of fills) {
      // A class reference carries no `fill` of its own in these files, so this is a straight swap.
      body = body.replace(new RegExp(`class="${name}"`, 'g'), () => {
        classesResolved += 1;
        return `fill="${hex}"`;
      });
    }
    // The block has to go, or it leaks styles into the page it is inlined into.
    body = body.replace(/<defs[\s\S]*?<\/defs>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  }

  /*
   * THE EXPORT'S OWN WRAPPERS, WHICH ARE STRUCTURAL NOTHING.
   *
   * Figma-style exports wrap the artwork in a `<mask>` and a `<clipPath>` whose single child is a shape
   * covering the whole viewBox: a white luminance mask is fully opaque, a full-bleed clip path clips
   * nothing. Both are no-ops, and inlined they are worse than useless — the `<clipPath>` lives in
   * `<defs>`, which the class pass above deletes, so `clip-path="url(#clip0_1_194)"` is left dangling
   * and the reference is to an element that is not there. The mask is worse still: its white rect is
   * *the ground* by this file's own rule, so it would be recoloured with everything else and blank the
   * glyph in one theme.
   *
   * So they are dropped, by name and deliberately, rather than left to the browser to ignore. The
   * geometry is what makes it safe, and it is checked in `brand.mjs`'s report: one white path across
   * the whole viewBox, one rect the same size, neither of them a design decision.
   */
  let wrappersDropped = 0;
  if (stripExportWrappers) {
    // The leading `\s*` takes the line the block sat on with it, so removing one does not leave a blank
    // line behind in a file this repository commits and reads.
    for (const pattern of [/\s*<defs[\s\S]*?<\/defs>/gi, /\s*<mask[\s\S]*?<\/mask>/gi]) {
      body = body.replace(pattern, (block) => {
        wrappersDropped += 1;
        return '';
      });
    }
    body = body.replace(/\s(?:mask|clip-path)="url\(#[^)]*\)"/gi, (attr) => {
      wrappersDropped += 1;
      return '';
    });
  }

  /* The plate: a rect covering the whole viewBox. By size, never by colour. */
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

  // The source's comments describe the source design; one may claim a plate that has just been removed.
  body = body.replace(/<!--[\s\S]*?-->/g, '');

  /* Vestigial glows: self-closing shapes below the floor. */
  let glowsDropped = 0;
  body = body.replace(/<[a-z]+\b[^>]*?\/>/gi, (tag) => {
    const m = /\bopacity="([\d.]+)"/.exec(tag);
    if (!m || Number(m[1]) >= glowFloor) return tag;
    glowsDropped += 1;
    return '';
  });

  /* Floor what survives, so nothing deliberate disappears when drawn small. */
  body = body.replace(/\bopacity="([\d.]+)"/g, (whole, v) => {
    const n = Number(v);
    return n >= glowFloor && n < accentFloor ? `opacity="${accentFloor}"` : whole;
  });

  /*
   * Which colours are ink, which are ground.
   *
   * `ground` is passed in rather than inferred, because "is this fill the interior field or a tone" is a
   * judgement about the artwork that no amount of parsing answers.
   */
  const groundSet = new Set(['#fff', '#ffffff', ...ground.map((c) => c.toLowerCase())]);

  const colours = new Set();
  for (const m of body.matchAll(/(?:fill|stroke)="(#[0-9a-fA-F]{3,6})"/g)) colours.add(m[1].toLowerCase());

  const tones = [...colours].filter((c) => !groundSet.has(c.toLowerCase())).sort((a, b) => luminance(a) - luminance(b));

  /*
   * Cluster, then rank the clusters.
   *
   * `#000` (0.000) and `#0d1129` (0.006) land in one cluster and share a rank; `#03ddff` (0.64) is far
   * enough away to be its own. Strict per-colour ranking would have split the first two apart.
   */
  const clusters = [];
  for (const colour of tones) {
    const lum = luminance(colour);
    const last = clusters[clusters.length - 1];
    if (last && lum - last.lum <= clusterWithin) last.colours.push(colour);
    else clusters.push({ lum, colours: [colour] });
  }

  const opacity = new Map();
  clusters.forEach((cluster, i) => {
    const value = ranks[Math.min(i, ranks.length - 1)];
    for (const colour of cluster.colours) opacity.set(colour, value);
  });

  const replacement = (hex) => {
    const h = hex.toLowerCase();
    if (groundSet.has(h)) return { value: 'var(--icon-ground)', opacity: null };
    const op = opacity.get(h) ?? 1;
    return { value: 'currentColor', opacity: op === 1 ? null : op };
  };

  /*
   * Rewrite fills and strokes.
   *
   * `fill="none"` / `stroke="none"` are left alone — those are the outline-only shapes, and colouring
   * them would fill something meant to be a stroke.
   *
   * A tone needing an opacity gets an attribute on the same element, not a wrapping `<g>`: group opacity
   * applies to the group's rendered result, so overlapping shapes inside one blend as a unit and their
   * overlap darkens differently than the same shapes at element level.
   */
  let mapped = 0;
  body = body.replace(/(fill|stroke)="(#[0-9a-fA-F]{3,6})"/g, (_w, attr, hex) => {
    const r = replacement(hex);
    mapped += 1;
    return r.opacity === null ? `${attr}="${r.value}"` : `${attr}="${r.value}" opacity="${r.opacity}"`;
  });

  /* Two `opacity` attributes on one element is invalid; the browser keeps whichever it reads first.
     Multiplied rather than replaced — the source's means how strong that shape is, the rank's means which
     tone it is, and they are different facts. */
  body = body.replace(
    /\bopacity="([\d.]+)"([^>]*?)\bopacity="([\d.]+)"/g,
    (_w, a, mid, b) => `opacity="${(Number(a) * Number(b)).toFixed(3)}"${mid}`,
  );

  body = body
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    // Collapse the blank runs the removals leave behind.
    .filter((line, i, all) => line !== '' || (all[i - 1] ?? '') !== '')
    .join('\n')
    .trim()
    // The sources are deeply nested; re-indent so the output is readable whatever it started as.
    .split('\n')
    .map((line) => (line.trim() === '' ? '' : `  ${line.trim()}`))
    .join('\n');

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none" aria-hidden="true">`,
    body,
    '</svg>',
    '',
  ].join('\n');

  return {
    svg,
    report: {
      viewBox,
      removedPlate,
      glowsDropped,
      classesResolved,
      wrappersDropped,
      mapped,
      tones: tones.length,
      clusters: clusters.map((c) => `${c.colours.join('+')}@${ranks[Math.min(clusters.indexOf(c), ranks.length - 1)]}`),
      bytes: svg.length,
    },
  };
}
