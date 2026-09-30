import type { ReactNode } from 'react';

/**
 * A table that can scroll sideways without breaking.
 *
 * **The wrapper is the whole point.** The obvious way to let a wide table scroll is
 * `display: block; overflow-x: auto` on the `<table>` itself -- and it looks like it works, because
 * the table does scroll. What it actually does is take the element out of table layout, and the fix
 * people reach for next (`display: table` on `thead` and `tbody`) makes those two **separate tables**.
 * A separate table computes its own column widths, so the header stops lining up with the body and
 * `border-collapse` no longer applies across the join. Seen for real: the heading row's first column
 * ran 145px wider than the body's, with a doubled border between them.
 *
 * A wrapper div keeps the table as a table and moves the scrolling outward, which is what the
 * `overflow` property was for in the first place.
 *
 * `tabIndex={0}` because a scrollable region that cannot be focused cannot be scrolled by keyboard.
 * It does mean every table gets a tab stop whether or not it overflows — the alternative is measuring
 * overflow at runtime, which would make every table on the site a client component. The focus ring is
 * styled in `docs.css` so the stop is visible when it happens.
 *
 * There is no `role="region"`: a table is already a landmark to assistive tech, and wrapping it in a
 * second one would just be one more thing to step through.
 */
export function Table({ children }: { children?: ReactNode }) {
  return (
    <div className="table-wrap" tabIndex={0}>
      <table>{children}</table>
    </div>
  );
}
