'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

export type TocItem = { title: ReactNode; url: string; depth: number };

/**
 * How long a clicked entry stays marked, in milliseconds.
 *
 * The marker is driven by scroll position, and a click *starts* a scroll — so without a hold, the
 * observer recomputes from wherever the page currently is and moves the marker straight back off the
 * entry that was just clicked. Nine hundred milliseconds is longer than the scroll takes and short
 * enough that it never feels stuck. It is released early the moment the reader scrolls themselves;
 * see the listener below.
 */
const HOLD_MS = 900;

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The contents rail.
 *
 * Sticky, one hairline column, with the section you are reading marked. Two things make it a client
 * component: the marking, and making a click do what the reader expects.
 *
 * **Clicking an entry scrolls smoothly to it and marks it, even when the heading was already on
 * screen.** Three separate things have to be true for that, and each of them was missing:
 *
 * 1. **The scroll is smooth and offset.** `scrollIntoView` with `behavior: 'smooth'`, and the heading
 *    carries a `scroll-margin-top` so it stops *below* the sticky masthead rather than under it. The
 *    browser aligns an anchor target with the top of the viewport, which for a 56px sticky bar means
 *    the heading you asked for ends up hidden behind it.
 * 2. **The mark is held.** `holdUntil` suppresses the scroll observer while the scroll is in flight,
 *    or it overrules the click immediately.
 * 3. **An already-visible heading still counts.** `block: 'start'` scrolls to put the heading at the
 *    top even if it is currently in the middle of the viewport, which is what "go to this section"
 *    should mean. A target already at the top simply does not move, and the mark still lands on it.
 *
 * Done in JavaScript rather than with `html { scroll-behavior: smooth }` on purpose: that property
 * also smooths the jump-to-top that Next does on every route change, so navigating between two docs
 * pages becomes a long visible scroll. This way only the click is affected.
 */
export function TableOfContents({ items }: { items: readonly TocItem[] }) {
  const [active, setActive] = useState<string | null>(null);
  const holdUntil = useRef(0);

  useEffect(() => {
    const root = document.documentElement;
    // Read the token rather than hardcoding it, so the observer's band and the sticky offset cannot
    // drift apart. `getPropertyValue` returns the raw string, `56px`, so it needs parsing.
    const masthead = Number.parseFloat(getComputedStyle(root).getPropertyValue('--masthead')) || 56;

    const headings = items
      .map((item) => document.getElementById(decodeURIComponent(item.url.slice(1))))
      .filter((el): el is HTMLElement => el !== null);

    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // A click wins over scroll position while its scroll is still running.
        if (Date.now() < holdUntil.current) return;

        // Several headings can be on screen at once; the topmost one is the section being read.
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visible[0]) setActive(visible[0].target.id);
      },
      {
        // Clears the sticky masthead, and the bottom margin keeps a heading current until it is most
        // of the way up the screen rather than flickering as it passes the band.
        rootMargin: `-${Math.round(masthead + 16)}px 0px -68% 0px`,
        threshold: 0,
      },
    );

    for (const heading of headings) observer.observe(heading);
    return () => observer.disconnect();
  }, [items]);

  /*
   * Release the hold the moment the reader does anything themselves.
   *
   * A timer alone would leave the marker pinned to a clicked entry for the rest of the hold even if
   * the reader had already wheeled somewhere else. None of these fire for a programmatic scroll, so
   * the hold survives its own scroll and not a real one.
   */
  useEffect(() => {
    const release = () => {
      holdUntil.current = 0;
    };
    window.addEventListener('wheel', release, { passive: true });
    window.addEventListener('touchmove', release, { passive: true });
    window.addEventListener('keydown', release);
    return () => {
      window.removeEventListener('wheel', release);
      window.removeEventListener('touchmove', release);
      window.removeEventListener('keydown', release);
    };
  }, []);

  /* Arriving on a deep link should land with its heading already marked. */
  useEffect(() => {
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (!hash) return;
    if (!items.some((item) => decodeURIComponent(item.url.slice(1)) === hash)) return;
    setActive(hash);
  }, [items]);

  const select = useCallback((id: string, url: string) => {
    const heading = document.getElementById(id);
    if (!heading) return;

    setActive(id);
    holdUntil.current = Date.now() + HOLD_MS;

    heading.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });

    // Keep the URL honest. `pushState` rather than `replaceState`, because a native anchor click would
    // have left a history entry too, and Back returning to the previous section is the behaviour a
    // reader already expects from a link.
    window.history.pushState(null, '', url);

    /*
     * A native anchor click moves the sequential focus point to its target; intercepting the click
     * takes that away. Doing it by hand restores it, so a keyboard user who follows an entry is now
     * "at" the heading they chose rather than back at the top of the document. `preventScroll` because
     * the smooth scroll above is already handling position, and focusing would otherwise jump.
     */
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }, []);

  return (
    <nav className="toc" aria-label="On this page">
      <span className="label">On this page</span>
      <ul>
        {items.map((item) => {
          const id = decodeURIComponent(item.url.slice(1));
          const isActive = active === id;
          return (
            <li key={item.url} className={item.depth > 2 ? 'toc-nested' : undefined}>
              <a
                href={item.url}
                aria-current={isActive ? 'location' : undefined}
                onClick={(event) => {
                  /*
                   * Left-click only. A modifier-click or a middle-click is the reader asking to open
                   * the entry in a background tab, and intercepting that would silently swallow the
                   * request — which is the usual way a "clever" anchor breaks a site.
                   */
                  if (
                    event.defaultPrevented ||
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  ) {
                    return;
                  }
                  event.preventDefault();
                  select(id, item.url);
                }}
              >
                {item.title}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
