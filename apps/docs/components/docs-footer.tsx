import { Arrow } from '@/components/arrow';
import type { Neighbour } from '@/lib/docs';

type SuiteMod = {
  id: string;
  name: string;
  repo?: string;
  issues?: string;
};

/**
 * The foot of a docs page: where the source lives, and what to read next.
 *
 * **A row per page rather than a link in the sidebar.** The sidebar lists pages, and a repository link
 * among them would have to look different from every other entry to avoid being read as one more page.
 * At the foot it answers the question a reader has when something is wrong -- "where do I report
 * this" -- without being in the way while they are reading.
 *
 * Prev and next are scoped to the section, which `lib/docs.ts` explains.
 *
 * `data-pagefind-ignore` keeps the whole row out of the search index. It sits inside the element
 * Pagefind is told to index, so without this the words "Previous" and "Next" and two neighbouring
 * page titles would be indexed as part of *this* page's text — and every page would be a near-duplicate
 * of the two beside it, which is how a search for a page's own title starts returning the pages either
 * side of it first.
 */
export function DocsFooter({
  mod,
  prev,
  next,
}: {
  mod?: SuiteMod;
  prev?: Neighbour;
  next?: Neighbour;
}) {
  return (
    <footer className="docs-footer" data-pagefind-ignore>
      {mod?.repo ? (
        <div className="docs-source">
          <span className="label">Source</span>
          <div className="docs-source-links">
            <a href={mod.repo} target="_blank" rel="noreferrer noopener">
              {mod.repo.replace('https://github.com/', '')} <Arrow />
            </a>
            {mod.issues ? (
              <a href={mod.issues} target="_blank" rel="noreferrer noopener">
                Issues <Arrow />
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      {prev || next ? (
        <nav className="docs-nav" aria-label="Page navigation">
          {prev ? (
            <a className="docs-nav-prev" href={prev.url}>
              <span className="label">Previous</span>
              <span className="docs-nav-title">← {prev.title}</span>
            </a>
          ) : (
            <span />
          )}
          {next ? (
            <a className="docs-nav-next" href={next.url}>
              <span className="label">Next</span>
              <span className="docs-nav-title">{next.title} →</span>
            </a>
          ) : null}
        </nav>
      ) : null}
    </footer>
  );
}
