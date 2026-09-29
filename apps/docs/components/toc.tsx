'use client';

import { useEffect, useState, type ReactNode } from 'react';

/**
 * `TOCItemType` from Fumadocs, restated here rather than imported.
 *
 * The only difference is `title`: Fumadocs types it as `ReactNode` because a heading can contain
 * inline markup, and importing its type would drag a Fumadocs version into this component's public
 * shape. The fields that matter are the same, and this is what the page actually passes.
 */
export type TocItem = { title: ReactNode; url: string; depth: number };

/**
 * The contents rail.
 *
 * Sticky, one hairline column, with the section you are reading marked. The marking is the only
 * reason this is a client component: without it the rail is a list of links and could be rendered on
 * the server.
 *
 * `IntersectionObserver` rather than a scroll handler, because a scroll handler fires on every frame
 * and this fires only when a heading crosses a line. The line is drawn near the top, under the sticky
 * masthead -- a heading counts as "current" once it has reached the top of the viewport and before the
 * next one does, which is what a reader means by "where am I".
 */
export function TableOfContents({ items }: { items: readonly TocItem[] }) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const headings = items
      .map((item) => document.getElementById(decodeURIComponent(item.url.slice(1))))
      .filter((el): el is HTMLElement => el !== null);

    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Several headings can be on screen at once; the topmost one is the section being read.
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visible[0]) setActive(visible[0].target.id);
      },
      {
        // 72px clears the sticky masthead, and the bottom margin keeps a heading "current" until it
        // is most of the way up the screen rather than flickering as it passes.
        rootMargin: '-72px 0px -68% 0px',
        threshold: 0,
      },
    );

    for (const heading of headings) observer.observe(heading);
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav className="toc" aria-label="On this page">
      <span className="label">On this page</span>
      <ul>
        {items.map((item) => {
          const id = decodeURIComponent(item.url.slice(1));
          const isActive = active === id;
          return (
            <li key={item.url} className={item.depth > 2 ? 'toc-nested' : undefined}>
              <a href={item.url} aria-current={isActive ? 'location' : undefined}>
                {item.title}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
