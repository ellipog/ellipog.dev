import type { ReactNode } from 'react';

import '../docs.css';
import { ModIcon } from '@/components/mod-icon';
import { SidebarLinks, type RailSection } from '@/components/sidebar-links';
import { sectionTrees, standalonePages, type DocPage } from '@/lib/docs';

/**
 * The documentation shell: a fixed navigation rail on the left, everything else inside it.
 *
 * **Two columns here, three on a page.** This layout owns the section nav and nothing else; the page
 * inside decides whether it also wants a contents rail. Putting the third column here would give every
 * page a rail whether it had contents or not.
 *
 * The sections come from the manifest rather than from the folder tree, so a mod's name and its order
 * are read from the one place they are written down. A mod with no synced pages does not appear — the
 * filter is on what actually built, not on what was intended.
 *
 * **One level of folders is a group, and it is collapsed.** A mod's `docs/` folders become `<details>`
 * groups inside its section, labelled with the name the sync gave the folder — a folder with its own
 * `index.md` is called whatever that page calls itself. The grouping itself is `lib/docs.ts`'s, shared
 * with the contents list and the previous/next row, so the three cannot disagree about the order. The
 * one client component is the links, because the group holding the reader's page has to be open and
 * only the browser knows where the reader is.
 *
 * There is no home link and no "Docs" heading in the rail. The masthead already carries both: the
 * wordmark goes to the site root and the Docs cell goes to the index. Repeating them here was two
 * links back to places the reader had just come from.
 */
export default function DocsLayout({ children }: { children: ReactNode }) {
  const linkOf = (page: DocPage, label?: string) => ({
    url: page.url,
    title: label ?? page.data.title ?? page.slugs.at(-1) ?? page.url,
  });

  const sections = sectionTrees().map((tree) => ({
    id: tree.mod.id,
    name: tree.mod.name,
    section: {
      // The section's own front page is called "Overview" in the rail rather than by its page title.
      // It sits under a label that already names the mod, so "Tasked" above "Tasked documentation"
      // says the same thing twice. The page's own heading is untouched -- that one is read on its own
      // and needs the full name. A folder's front page reads the same way, one level in.
      overview: tree.overview ? linkOf(tree.overview, 'Overview') : null,
      loose: tree.loose.map((page) => linkOf(page)),
      groups: tree.groups.map((group) => ({
        folder: group.folder,
        label: group.label,
        pages: group.pages.map((page) =>
          linkOf(page, page.url === `/docs/${tree.mod.id}/${group.folder}` ? 'Overview' : undefined),
        ),
      })),
    } satisfies RailSection,
  }));

  /**
   * Pages belonging to no mod — the glossary.
   *
   * Without this the glossary would build, be reachable by URL, and appear nowhere. It is not a section
   * with a `docs/` folder, so it does not fit the loop above, and it gets its own labelled group rather
   * than being sorted in among the mods.
   */
  const reference: RailSection = {
    overview: null,
    loose: standalonePages().map((page) => linkOf(page)),
    groups: [],
  };

  return (
    <div className="docs">
      {/* Labelled so the section list is distinguishable from the masthead's nav when a screen
          reader lists the page's landmarks; both are navigation, and only one of them is the site. */}
      <aside className="sidebar" aria-label="Documentation sections">
        {sections.map((section) => (
          <div className="sidebar-section" key={section.id}>
            {/* The mark on the section label. 16px, because the label itself is 11px uppercase — an icon
                any larger than that would out-weigh the word it belongs to. */}
            <span className="label sidebar-label">
              <ModIcon id={section.id} size="sm" />
              {section.name}
            </span>
            <SidebarLinks section={section.section} />
          </div>
        ))}

        {reference.loose.length > 0 ? (
          <div className="sidebar-section">
            <span className="label">Reference</span>
            <SidebarLinks section={reference} />
          </div>
        ) : null}
      </aside>
      {/* `<main>`, so the prose is a landmark rather than an anonymous box — `<div>` here meant a
          reader could jump to the site's nav but not past it. The class stays, and the grid around
          it is `.docs`'s, so nothing about the layout moves; `global.css`'s `main { flex: 1 }` is
          inert on a grid item. */}
      <main className="docs-body">{children}</main>
    </div>
  );
}
