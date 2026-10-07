import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A mod's mark, drawn as a mask.
 *
 * **A mask rather than an `<img>`, and rather than the inline `<svg>` this used to be.** The file says
 * where the shape is — `mask-image` takes it from the PNG's alpha channel — and the page says what
 * colour it is, because the element's `background-color` is `currentColor`. An `<img>` would draw the
 * file's own black ink instead, which on the dark theme's ground is a mark the same colour as the page
 * behind it: invisible rather than merely wrong, and correct in light mode, which is exactly why it is
 * not something to judge by one eye.
 *
 * **The mask is also what replaced two tokens and a rule.** The old glyphs were vectors with knockouts —
 * interiors that showed the backdrop through — so they read `currentColor` *and* `var(--icon-ground)`,
 * and a catalog cell that inverts on hover had to re-declare the second one. A flat silhouette has no
 * interior, so `currentColor` is the whole of it: the cell's text turns to paper on hover and the mark
 * turns with it, in both themes, from one file.
 *
 * The files come from `design/icons-source/<mod>.png` — the mods' own no-background loader icons — and
 * are copied to `public/icons/` by `scripts/icons.mjs`, which reads each one and refuses a plate, a
 * light ink, an empty file or a footprint the mask's one scale factor cannot serve. They are committed,
 * like the brand logos.
 *
 * `aria-hidden` and nothing else: the mod's name is always beside the icon, so an accessible name would
 * have it announced twice.
 */

/**
 * Whether the mod has a mark, read once per process rather than once per render.
 *
 * `existsSync` on every cell of every page is a syscall per icon per render, and the catalog draws one
 * icon per cell while every docs sidebar draws one per section. The cache is a module-level Map because
 * the build is a single process — on a server this would need to be keyed on something, and on a static
 * export it does not.
 */
const cache = new Map<string, boolean>();

function served(id: string): boolean {
  const hit = cache.get(id);
  if (hit !== undefined) return hit;

  const there = existsSync(join(process.cwd(), 'public', 'icons', `${id}.png`));
  cache.set(id, there);
  return there;
}

const SIZES = { sm: 16, md: 20, lg: 32, xl: 48 } as const;

export function ModIcon({
  id,
  size = 'md',
  className = '',
}: {
  id: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const px = SIZES[size];

  /*
   * No icon yet.
   *
   * A dashed square the same size as the real marks rather than nothing at all, because the alternative
   * is a row that silently shifts left and a reader who cannot tell whether the icon is missing or the
   * mod is different. A visible empty slot is honest about being a slot.
   *
   * The same principle as a Modrinth link that is typed but not yet a link: show the gap, do not hide it.
   */
  /*
   * The class string is built conditionally rather than interpolated.
   *
   * `` `mod-icon ${className}` `` with an empty `className` renders `class="mod-icon "` — a trailing
   * space in every glyph on the site. Harmless, and untidy enough to notice when reading the built HTML,
   * which is where it was spotted.
   */
  const classes = (extra: string) => (extra ? `mod-icon ${extra}` : 'mod-icon');

  if (!served(id)) {
    return (
      <span
        className={classes(`mod-icon-empty ${className}`.trim())}
        style={{ width: px, height: px }}
        aria-hidden="true"
      />
    );
  }

  return (
    <span
      className={classes(className)}
      // The one per-icon value: which file the mask reads its shape from. The size, the colour and the
      // scale are the design's and live in `.mod-icon`.
      style={{ width: px, height: px, ['--icon' as string]: `url(/icons/${id}.png)` }}
      aria-hidden="true"
    />
  );
}
