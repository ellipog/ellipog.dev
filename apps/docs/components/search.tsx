'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { RESULT_LIMIT, UNGROUPED, loadSearch, searchDocs, type SearchHit } from '@/lib/search';

/**
 * The masthead's search: a button, and the palette behind it.
 *
 * A native `<dialog>` rather than a div with a focus trap, because the element already is the focus
 * trap, already closes on `Esc`, already inerts the page behind it and already marks the rest of the
 * document `aria-hidden`. Every one of those is a thing a hand-rolled modal gets subtly wrong.
 *
 * **The index is not fetched on page load.** `loadSearch` is warmed on the trigger's first hover or
 * focus and awaited on the first open, which is the difference between a page view costing nothing
 * and a page view costing a WASM runtime that four out of five readers never use. `lib/search.ts`
 * explains the rest.
 *
 * The comment-heavy list below is the set of things native `<dialog>` does *not* do for you, each of
 * which is a real bug rather than a hypothetical one:
 *
 *   - `Esc` closes the element without telling React, so `state.open` stays true and the next `⌘K`
 *     toggles it *further* into the wrong value. The `close` event is the only notification.
 *   - A `<dialog>` does not close when the backdrop is clicked. Worse, binding that to `click` alone
 *     closes the palette when a reader drag-selects text in the input and releases outside the box,
 *     because the click target is the common ancestor of the press and the release. Hence the
 *     `mousedown` bookkeeping.
 *   - Focus lands on the first tabbable child, which would be the scope row rather than the input,
 *     and a reader who hits `⌘K` and starts typing loses the first word. `autoFocus` is the
 *     spec-defined way to say where focus goes; a `focus()` call after `showModal()` races WebKit,
 *     which runs its own focusing step asynchronously.
 *   - `showModal()` throws on an already-open dialog and there is no way to ask "is it opening",
 *     only `.open`. The guard is what keeps React's idea and the element's from diverging.
 *   - Nothing here re-mounts on navigation — this component lives in the root layout — so an open
 *     palette would sit over the page the reader just navigated to. It is closed twice: explicitly
 *     when a result is chosen, and by an effect on the pathname for every other way of leaving.
 */
type Mod = { id: string; name: string };

/** Rows are one flat list for the keyboard; the grouping is only how they are drawn. */
type Row = { hit: SearchHit; index: number };
type Grouping = Array<{ label: string; rows: Row[] }>;

const SEARCH_ICON = (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.6-3.6" />
  </svg>
);

export function Search({ mods }: { mods: Mod[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const backdropPress = useRef(false);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<string>('all');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [total, setTotal] = useState(0);
  const [active, setActive] = useState(0);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'unavailable' | 'error'>('idle');
  const [shortcut, setShortcut] = useState('Ctrl K');

  const router = useRouter();
  const pathname = usePathname();

  /** The mod whose docs the reader is in, so the palette opens scoped to it. */
  const defaultScope = useMemo(() => {
    const [, first, second] = pathname.split('/');
    if (first === 'docs' && second && mods.some((mod) => mod.id === second)) return second;
    return 'all';
  }, [pathname, mods]);

  /*
   * Every search carries a number, and a reply is dropped unless it is still the newest.
   *
   * There is no abort to call: `data()` is a decompression, not a fetch with a handle. So the guard
   * is the token — without it, a slow search for "que" lands after a fast one for "quests" and the
   * list jumps back to results for a word the reader has already finished typing.
   */
  const token = useRef(0);

  useEffect(() => {
    // Rendered as `Ctrl K` on the server and corrected here, because the platform is not known until
    // the client runs. The mismatch is a word in a `<kbd>`, which is not worth a hydration warning.
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setShortcut('⌘K');
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // The only notification that `Esc` (or anything else) closed the element behind React's back.
    const onClose = () => setOpen(false);
    dialog.addEventListener('close', onClose);
    return () => dialog.removeEventListener('close', onClose);
  }, []);

  // Warming the runtime costs nothing the reader will notice and saves the first search a round trip.
  const warm = useCallback(() => {
    if (status === 'idle') loadSearch().catch(() => undefined);
  }, [status]);

  useEffect(() => {
    if (!open) return;

    const trimmed = query.trim();
    if (!trimmed) {
      token.current += 1;
      setHits([]);
      setTotal(0);
      setActive(0);
      setStatus('idle');
      return;
    }

    setStatus('loading');
    const mine = ++token.current;
    const timer = setTimeout(() => {
      searchDocs(trimmed, scope === 'all' ? undefined : scope)
        .then(({ hits: found, total: count }) => {
          if (mine !== token.current) return;
          setHits(found);
          setTotal(count);
          setActive(0);
          setStatus('ready');
        })
        .catch(() => {
          if (mine !== token.current) return;
          setHits([]);
          setTotal(0);
          setStatus('unavailable');
        });
    }, 150);

    return () => clearTimeout(timer);
  }, [open, query, scope]);

  function openPalette() {
    setScope(defaultScope);
    setOpen(true);
  }

  function go(url: string) {
    setOpen(false);
    router.push(url);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      // Without this the caret jumps to the start or end of the input on every press, which turns
      // walking the list into watching the text cursor flicker.
      event.preventDefault();
      if (hits.length === 0) return;
      setActive((current) => {
        const next = event.key === 'ArrowDown' ? current + 1 : current - 1;
        return (next + hits.length) % hits.length;
      });
      return;
    }

    if (event.key === 'Enter') {
      const hit = hits[active];
      if (hit) {
        event.preventDefault();
        go(hit.url);
      }
    }
  }

  useEffect(() => {
    function onGlobalKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        // The browser's own ⌘K (focus the address bar in some builds) would otherwise win.
        event.preventDefault();
        setOpen((current) => {
          if (!current) setScope(defaultScope);
          return !current;
        });
        warm();
      }
    }
    window.addEventListener('keydown', onGlobalKey);
    return () => window.removeEventListener('keydown', onGlobalKey);
  }, [defaultScope, warm]);

  /*
   * The rows get their numbers here rather than at render time.
   *
   * The keyboard walks one flat list while the eye sees groups, so every row needs an index that is
   * stable across both — and a counter incremented inside the render loop is not that. It reads as
   * working until a re-render happens, and then `aria-activedescendant` points at the wrong row.
   * Numbering inside the memo makes the index a property of the data.
   *
   * Scoped to one mod there is nothing to group by, so the list is a single unnamed group; unscoped,
   * the mods come out in the order their first hit appeared, and the pages belonging to no mod
   * (`/docs/`, the glossary) collect under one heading of their own.
   */
  const grouped: Grouping = useMemo(() => {
    const buckets: Array<{ label: string; hits: SearchHit[] }> = [];

    if (scope !== 'all') {
      buckets.push({ label: '', hits });
    } else {
      const byLabel = new Map<string, SearchHit[]>();
      for (const hit of hits) {
        const label = hit.mod ?? UNGROUPED;
        const bucket = byLabel.get(label);
        if (bucket) bucket.push(hit);
        else {
          const fresh: SearchHit[] = [hit];
          byLabel.set(label, fresh);
          buckets.push({ label, hits: fresh });
        }
      }
    }

    let index = 0;
    return buckets
      .filter((bucket) => bucket.hits.length > 0)
      .map((bucket) => ({
        label: bucket.label,
        rows: bucket.hits.map((hit) => ({ hit, index: index++ })),
      }));
  }, [hits, scope]);

  const flat = useMemo(() => grouped.flatMap((group) => group.rows.map((row) => row.hit)), [grouped]);
  const activeId = grouped.flatMap((group) => group.rows).some((row) => row.index === active)
    ? `search-hit-${active}`
    : undefined;

  return (
    <>
      <button
        type="button"
        className="search-trigger"
        onClick={openPalette}
        onMouseEnter={warm}
        onFocus={warm}
        aria-label="Search documentation"
      >
        {SEARCH_ICON}
        <span className="search-trigger-text">Search documentation…</span>
        <kbd className="search-kbd">{shortcut}</kbd>
      </button>

      <dialog
        ref={dialogRef}
        className="search-dialog"
        aria-label="Search documentation"
        onMouseDown={(event) => {
          backdropPress.current = event.target === dialogRef.current;
        }}
        onClick={(event) => {
          if (backdropPress.current && event.target === dialogRef.current) dialogRef.current?.close();
          backdropPress.current = false;
        }}
      >
        <div className="search-field">
          {SEARCH_ICON}
          <input
            className="search-input"
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search documentation…"
            aria-label="Search documentation"
            role="combobox"
            aria-expanded="true"
            aria-controls="search-results"
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="search-kbd">{shortcut}</kbd>
        </div>

        <div className="search-scopes" role="group" aria-label="Limit the search to one mod">
          <button
            type="button"
            className="search-scope"
            aria-pressed={scope === 'all'}
            onClick={() => setScope('all')}
          >
            All
          </button>
          {mods.map((mod) => (
            <button
              key={mod.id}
              type="button"
              className="search-scope"
              aria-pressed={scope === mod.id}
              onClick={() => setScope(mod.id)}
            >
              {mod.name}
            </button>
          ))}
        </div>

        <div className="search-results" id="search-results" role="listbox" aria-label="Results">
          {status === 'unavailable' ? (
            <p className="search-note">
              The search index is built with the site. Run <code>bun run build</code> to search locally.
            </p>
          ) : null}

          {status === 'ready' && flat.length === 0 ? (
            <p className="search-note">Nothing matches “{query.trim()}”.</p>
          ) : null}

          {status === 'idle' && flat.length === 0 ? (
            <p className="search-note">Type to search the documentation.</p>
          ) : null}

          {grouped.map((group) => (
            <div className="search-group" key={group.label || 'results'}>
              {group.label ? <p className="label search-group-label">{group.label}</p> : null}
              {group.rows.map(({ hit, index }) => (
                <a
                  key={hit.url}
                  id={`search-hit-${index}`}
                  className="search-hit"
                  href={hit.url}
                  role="option"
                  aria-selected={index === active}
                  data-active={index === active ? '' : undefined}
                  onMouseMove={() => setActive(index)}
                  onClick={(event) => {
                    event.preventDefault();
                    go(hit.url);
                  }}
                >
                  <span className="search-hit-head">
                    <span className="search-hit-title">{hit.title}</span>
                    {hit.mod ? <span className="search-hit-mod">{hit.mod}</span> : null}
                  </span>
                  {/* A breadcrumb only when there is a section to name: a section front page is in
                      no folder, and the separator would otherwise be left dangling after the mod. */}
                  {hit.section ? <span className="search-hit-path">{hit.section}</span> : null}
                  {/* Pagefind's own excerpt: the page's text with `<mark>` around the match. It is
                      built from content this site authored, and the text around the marks is
                      escaped by Pagefind before it is written. */}
                  <span
                    className="search-hit-excerpt"
                    dangerouslySetInnerHTML={{ __html: hit.excerpt }}
                  />
                </a>
              ))}
            </div>
          ))}

          {status === 'ready' && total > flat.length ? (
            <p className="search-note search-more">
              {total - flat.length} more {total - flat.length === 1 ? 'result' : 'results'} not shown.
            </p>
          ) : null}
        </div>
      </dialog>
    </>
  );
}
