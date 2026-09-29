import { Arrow } from '@/components/arrow';
import { contentsByMod } from '@/lib/docs';

/**
 * The contents list on `/docs/`.
 *
 * Rendered from what was actually synced rather than written into the page, so a section cannot be
 * listed that has no pages and a page cannot be missing from it. That is the same reason the
 * manifest drives the catalog: a list written by hand is a list that goes stale, and this one is
 * derived from the build.
 *
 * Rows rather than cards: one hairline-separated band per mod, its pages as links within it. It is the
 * same grid the rest of the site is made of.
 */
export function DocsContents() {
  const groups = contentsByMod();

  if (groups.length === 0) {
    return (
      <p className="muted">
        Nothing has been synced yet. Each mod's documentation comes from the <code>docs/</code> folder
        in its own repository.
      </p>
    );
  }

  return (
    <div className="contents">
      {groups.map(({ mod, pages }) => (
        <section className="contents-group" key={mod.id}>
          <div className="contents-head">
            <span className="contents-name">{mod.name}</span>
            <span className="faint mono">
              {pages.length} page{pages.length === 1 ? '' : 's'}
            </span>
          </div>
          <p className="contents-summary">{mod.summary}</p>
          <ul className="contents-pages">
            {pages.map((page) => (
              <li key={page.url}>
                <a href={page.url}>
                  {page.data.title}
                  <Arrow />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
