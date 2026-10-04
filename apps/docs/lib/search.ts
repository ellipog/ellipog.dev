/**
 * The search index, loaded when somebody asks for it.
 *
 * **Pagefind is not imported at module scope and never runs on page load.** The index is a couple of
 * hundred kilobytes of compressed fragments behind a WASM runtime, and the overwhelming majority of
 * readers never open the palette — spending that on every page view to serve a feature most visits do
 * not use is the trade this file exists to decline. `loadSearch` is called on the first hover or
 * focus of the trigger and on the first open, so by the time anything is typed the runtime is usually
 * already there.
 *
 * **The path is held in a `string`-typed constant, and that is deliberate.** TypeScript resolves a
 * dynamic `import()` whose argument is a string *literal*, and `/_pagefind/pagefind.js` does not
 * exist in the source tree — so a literal here is a `TS2307` in `bun run types` and in `next build`.
 * Typed as `string`, the argument is opaque to the compiler and the import is left for the browser,
 * which is the only thing that can resolve it anyway. `types/pagefind.d.ts` declares the module as a
 * second line of defence, and `webpackIgnore`/`turbopackIgnore` stop the bundler trying to inline a
 * file that arrives after it has run.
 */

export type SearchHit = {
  url: string;
  title: string;
  /** The mod's display name, absent on the pages that belong to no mod (`/docs/`, the glossary). */
  mod?: string;
  /** The rail's name for the folder the page sits in, absent on section front pages. */
  section?: string;
  /** Pagefind's own HTML, with `<mark>` around the matched words. */
  excerpt: string;
};

/** One result body, as Pagefind hands it over. */
type ResultData = {
  url: string;
  excerpt?: string;
  meta?: Record<string, string | undefined>;
};

type SearchResponse = {
  results: Array<{ id: string; data: () => Promise<ResultData> }>;
};

type Pagefind = {
  search: (query: string, options?: { filters?: Record<string, string> }) => Promise<SearchResponse>;
};

let pending: Promise<Pagefind> | null = null;

/**
 * The runtime, fetched once however many callers ask.
 *
 * The promise is cached rather than the module, so two opens in quick succession share one download
 * instead of racing two. A rejection is deliberately *not* cached — the usual reason this fails is
 * that the index has not been built yet, and a reader who builds the site and reloads should not have
 * to know the failure was memoised.
 */
export function loadSearch(): Promise<Pagefind> {
  if (pending) return pending;

  const path: string = '/_pagefind/pagefind.js';
  const load = import(/* webpackIgnore: true */ /* turbopackIgnore: true */ path).then(
    (mod) => mod as unknown as Pagefind,
  );

  load.catch(() => {
    pending = null;
  });

  pending = load;
  return pending;
}

/** How many results the palette shows. The rest are counted, not listed. */
export const RESULT_LIMIT = 8;

/**
 * One search.
 *
 * **The slice happens before the `await`s, and that is the whole performance story.** `search()`
 * returns lightweight stubs; each result's title and excerpt require a separate `data()` call that
 * decompresses a fragment over the network. Awaiting every stub would fire a request per hit — dozens
 * of them, on every keystroke — to render eight rows. Slicing first means eight requests, and the
 * caller gets the total so it can say how many it did not show.
 *
 * A blank or whitespace-only query returns nothing without touching Pagefind: a search for a single
 * space is not a search, and Pagefind answers it with an arbitrary page of results.
 */
export async function searchDocs(
  query: string,
  mod?: string,
): Promise<{ hits: SearchHit[]; total: number }> {
  const trimmed = query.trim();
  if (!trimmed) return { hits: [], total: 0 };

  const pagefind = await loadSearch();
  const found = await pagefind.search(trimmed, mod ? { filters: { mod } } : undefined);

  const chosen = found.results.slice(0, RESULT_LIMIT);
  const loaded = await Promise.all(chosen.map((result) => result.data()));

  return {
    hits: loaded.map((result) => ({
      url: result.url,
      // Pagefind fills `title` from the page's own heading; the URL is the fallback rather than an
      // empty row, which is the one failure a reader cannot act on.
      title: result.meta?.title ?? result.url,
      mod: result.meta?.mod,
      section: result.meta?.section,
      excerpt: result.excerpt ?? '',
    })),
    total: found.results.length,
  };
}

/** What a group of results is called when its pages belong to no mod. */
export const UNGROUPED = 'Documentation';
