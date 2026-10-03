'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * The links of one rail section, and the folders inside it.
 *
 * This is the one client component in the rail, and it exists for two jobs that both need to know
 * where the reader is: the folder holding the current page is opened, and the current link says so.
 * The section's own label stays on the server, because `ModIcon` reads its SVG from disk and cannot
 * cross the boundary -- so the boundary is drawn at the links, which is where the interactivity is.
 *
 * The default state is *closed*, which is what keeps a manual of twelve pages to a readable column.
 * That is also why the rail is not simply static markup: the group containing the current page opens
 * for the reader, and a page they are reading is never behind a fold they did not close.
 */

export type RailLink = { url: string; title: string };

export type RailGroup = { folder: string; label: string; pages: RailLink[] };

export type RailSection = { overview: RailLink | null; loose: RailLink[]; groups: RailGroup[] };

/** Page paths without their trailing slash, the way `page.url` and Next's router spell them. */
const normalise = (path: string) => (path !== '/' ? path.replace(/\/+$/, '') : path);

/** Whether a link is the page being read -- itself, or a section it fronts. */
const isAt = (pathname: string, url: string) =>
  normalise(pathname) === normalise(url) || normalise(pathname).startsWith(`${normalise(url)}/`);

function Link({ page, current }: { page: RailLink; current: boolean }) {
  return (
    <a href={page.url} aria-current={current ? 'page' : undefined}>
      {page.title}
    </a>
  );
}

function Group({ group, pathname }: { group: RailGroup; pathname: string }) {
  const holdsCurrent = group.pages.some((page) => isAt(pathname, page.url));
  const [open, setOpen] = useState(holdsCurrent);

  // Opening follows the reader rather than a remembered choice: a click from one page into another
  // group opens that group, and a group they closed by hand stays closed until they navigate into it.
  useEffect(() => setOpen(holdsCurrent), [holdsCurrent]);

  return (
    <details
      className="sidebar-group"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>{group.label}</summary>
      <ul>
        {group.pages.map((page) => (
          <li key={page.url}>
            <Link page={page} current={isAt(pathname, page.url)} />
          </li>
        ))}
      </ul>
    </details>
  );
}

export function SidebarLinks({ section }: { section: RailSection }) {
  const pathname = usePathname();

  return (
    <>
      {section.overview || section.loose.length > 0 ? (
        <ul>
          {section.overview ? (
            <li>
              <Link page={section.overview} current={isAt(pathname, section.overview.url)} />
            </li>
          ) : null}
          {section.loose.map((page) => (
            <li key={page.url}>
              <Link page={page} current={isAt(pathname, page.url)} />
            </li>
          ))}
        </ul>
      ) : null}
      {section.groups.map((group) => (
        <Group key={group.folder} group={group} pathname={pathname} />
      ))}
    </>
  );
}
