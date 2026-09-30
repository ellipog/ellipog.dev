import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The site's own mark, beside the wordmark it belongs to.
 *
 * **It is the tab icon.** Not the same artwork redrawn — the same file, put through `bun run site-mark`
 * on its way here, so the thing in the browser tab and the thing in the masthead are one drawing. That is
 * why the tab shows the site's own identity on every page rather than a mod's: the mark is the site, and
 * the mod marks belong beside mod names, where a reader can tell which is which.
 *
 * **Inlined rather than an `<img>`, like the mod marks and the host's logo, and for the same reason.** The
 * glyph takes its ink from `currentColor`, so it is ink on paper and paper on ink with nothing switched —
 * which is exactly what the tab icon has to be too, and the reason this file is a good favicon for a
 * two-theme site. An SVG in an `<img>` is a separate document with no access to the page's CSS, so
 * `currentColor` would fall back to black and the mark would be invisible on the dark theme.
 *
 * **The one thing that changed on the way in is the plate, and it is why the transform exists.** The
 * favicon is drawn on a full-bleed `#f3f1ec` tile — right for a browser tab, where the icon sits in chrome
 * this design does not own, and wrong here, where it would be a small rectangle of a second paper colour
 * sitting on the page's own. `site-mark.mjs` removes it by size and leaves strokes only.
 *
 * There is no `--icon-ground` here and that is not an oversight: the mark has no knockouts. The mod marks
 * and the host's logo are shapes drawn in ink with holes where the ground shows through, which is what
 * needs a token to say what is behind them. This one is line work with `fill="none"`, so it has no holes.
 *
 * Read once per process rather than once per render, like the mod icons.
 */

let cached: { body: string; viewBox: string } | null | undefined;

function mark() {
  if (cached !== undefined) return cached;

  try {
    const raw = readFileSync(join(process.cwd(), 'public', 'site', 'ellipog.svg'), 'utf8');
    cached = {
      // Everything between the outer `<svg>` and its close, so React owns the element and its props.
      body: /<svg[^>]*>([\s\S]*)<\/svg>/.exec(raw)?.[1]?.trim() ?? '',
      viewBox: /viewBox="([^"]+)"/.exec(raw)?.[1] ?? '0 0 64 64',
    };
  } catch {
    // No mark at all rather than a broken one. The wordmark beside it still says who this is.
    cached = null;
  }

  return cached;
}

export function SiteMark({ size = 22 }: { size?: number }) {
  const m = mark();
  if (!m) return null;

  return (
    <svg
      className="site-mark"
      width={size}
      height={size}
      viewBox={m.viewBox}
      fill="none"
      aria-hidden="true"
      // Raw SVG from a file this repository generates, not user content — nothing here can carry a script.
      dangerouslySetInnerHTML={{ __html: m.body }}
    />
  );
}
