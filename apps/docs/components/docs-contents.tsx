import { Arrow } from '@/components/arrow';
import { sectionTrees } from '@/lib/docs';

/**
 * The contents list on `/docs/`.
 *
 * Rendered from what was actually synced rather than written into the page, so a section cannot be
 * listed that has no pages and a page cannot be missing from it — and the same is true of the folders
 * inside a section: they are the grouping the rail uses, from the same function, so a folder in the
 * rail is a folder here. That is the same reason the manifest drives the catalog: a list written by
 * hand is a list that goes stale, and this one is derived from the build.
 *
 * Rows rather than cards: one hairline-separated band per mod, its pages as links within it. It is the
 * same grid the rest of the site is made of.
 */
export function DocsContents() {
  const sections = sectionTrees();

  if (sections.length === 0) {
    return (
      <p className="muted">
        Nothing has been synced yet. Each mod&apos;s documentation comes from the <code>docs/</code> folder
        in its own repository.
      </p>
    );
  }

  return (
    <div className="contents">
      {sections.map((tree) => (
        <section className="contents-group" key={tree.mod.id}>
          <div className="contents-head">
            <span className="contents-name">{tree.mod.name}</span>
            <span className="faint mono">
              {tree.ordered.length} page{tree.ordered.length === 1 ? '' : 's'}
            </span>
          </div>
          <p className="contents-summary">{tree.mod.summary}</p>
          <ul className="contents-pages">
            {tree.overview ? (
              <li>
                <a href={tree.overview.url}>
                  {tree.overview.data.title}
                  <Arrow />
                </a>
              </li>
            ) : null}
            {tree.loose.map((page) => (
              <li key={page.url}>
                <a href={page.url}>
                  {page.data.title}
                  <Arrow />
                </a>
              </li>
            ))}
          </ul>
          {tree.groups.map((group) => {
            // A folder's own page is reached through the folder's name, the way its URL reads -- so it
            // is not repeated as a row beneath, which would have the label and the link say one thing
            // twice. A folder with no page of its own is a plain label over its pages.
            const front =
              group.pages[0]?.url === `/docs/${tree.mod.id}/${group.folder}` ? group.pages[0] : null;
            const rest = front ? group.pages.slice(1) : group.pages;

            return (
              <div className="contents-folder" key={group.folder}>
                <p className="label">
                  {front ? <a href={front.url}>{group.label}</a> : group.label}
                </p>
                <ul className="contents-pages">
                  {rest.map((page) => (
                    <li key={page.url}>
                      <a href={page.url}>
                        {page.data.title}
                        <Arrow />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
