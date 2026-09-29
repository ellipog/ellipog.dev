import type { ReactNode } from 'react';

/**
 * A heading with a link to itself.
 *
 * The `id` comes from Fumadocs' heading plugin, and the same slugger produces the ids the contents
 * rail links to -- so a link cannot point at a heading that no longer exists under that name.
 *
 * The anchor sits *after* the text and is invisible until the heading is hovered or the anchor itself
 * is focused. A visible `#` on every heading turns a page into a list of hashes; a keyboard-reachable
 * one costs nothing and is the difference between a section being linkable and not.
 */
function Heading({ level, id, children }: { level: 2 | 3; id?: string; children: ReactNode }) {
  const Tag = `h${level}` as 'h2' | 'h3';

  if (!id) return <Tag>{children}</Tag>;

  return (
    <Tag id={id} className="heading">
      {children}
      <a className="heading-anchor" href={`#${id}`} aria-label="Link to this section">
        #
      </a>
    </Tag>
  );
}

export function H2(props: { id?: string; children: ReactNode }) {
  return <Heading level={2} {...props} />;
}

export function H3(props: { id?: string; children: ReactNode }) {
  return <Heading level={3} {...props} />;
}
