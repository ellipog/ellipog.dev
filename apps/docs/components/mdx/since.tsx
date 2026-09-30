/**
 * A chip marking the version a field or a feature arrived in.
 *
 * `<Since v="0.2.0" />` in a document — inline, and small enough to sit beside a table cell's contents
 * without breaking the row. Written as a component rather than as a link syntax because it is inline
 * markup, not a reference: there is nothing to resolve and nothing that can rot.
 *
 * Deliberately not a link to a changelog. There is no changelog page yet, and a chip that looks
 * clickable and is not is worse than one that plainly states a fact. When there is one, `href` is the
 * only thing this needs to learn.
 */
export function Since({ v }: { v: string }) {
  if (!v) return null;
  return (
    <span className="since" title={`Added in ${v}`}>
      {v}
    </span>
  );
}
