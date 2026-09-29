/**
 * An arrow that leans out of its corner on hover.
 *
 * Rendered as text rather than an icon: it is one glyph, it inherits the current colour and size, and
 * it needs no dependency. `aria-hidden` because the link's own label already says where it goes.
 *
 * Its own file rather than an export from `layout.tsx`, which would work but means a page importing
 * from a layout — a coupling that has no reason to exist and is exactly the sort of thing a framework
 * upgrade changes the rules about.
 */
export function Arrow() {
  return (
    <span className="arrow" aria-hidden>
      ↗
    </span>
  );
}
