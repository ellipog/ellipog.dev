'use client';

import { useState, type ReactNode } from 'react';

/**
 * Loader tabs — one command per loader, without repeating the page for each.
 *
 * **CSS-only tabs were the alternative and were not taken.** The radio-button trick needs no
 * JavaScript, but it cannot set `aria-selected`, cannot move focus with the arrow keys, and reads to
 * a screen reader as a group of radio buttons rather than a set of tabs. For a control whose whole
 * job is showing the reader the one command that applies to them, that is the wrong trade.
 *
 * The first tab is shown by default, so the page is still useful before hydration and with
 * JavaScript off.
 */
export function Tabs({ items, children }: { items: string[]; children: ReactNode }) {
  const [active, setActive] = useState(0);

  // One `<Tab>` per panel. Read as an array so the panels stay in step with the buttons, and filtered
  // down to real elements: MDX can leave a whitespace-only string between two children, and a stray
  // empty entry would shift every panel one place to the right of its button.
  const panels = (Array.isArray(children) ? children : [children]).filter(
    (child) => child != null && !(typeof child === 'string' && child.trim() === ''),
  );

  return (
    <div className="tabs">
      <div className="tabs-list" role="tablist" aria-label="Loader">
        {items.map((label, i) => (
          <button
            key={label}
            type="button"
            role="tab"
            id={`tab-${i}-${label.replace(/\W+/g, '-').toLowerCase()}`}
            aria-selected={i === active}
            aria-controls={`panel-${i}`}
            tabIndex={i === active ? 0 : -1}
            className={i === active ? 'tabs-tab tabs-tab-active' : 'tabs-tab'}
            onClick={() => setActive(i)}
            onKeyDown={(event) => {
              // Arrow keys move between tabs, which is what a tablist is expected to do.
              if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
              event.preventDefault();
              const next = event.key === 'ArrowRight' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
              setActive(next);
              const list = event.currentTarget.parentElement;
              (list?.children[next] as HTMLElement | undefined)?.focus();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="tabs-panels">
        {panels.map((panel, i) => (
          <div
            key={i}
            id={`panel-${i}`}
            role="tabpanel"
            aria-labelledby={`tab-${i}-${(items[i] ?? '').replace(/\W+/g, '-').toLowerCase()}`}
            hidden={i !== active}
            className="tabs-panel"
          >
            {panel}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * One panel. The wrapper does the work; this exists so a panel is written as a named element rather
 * than as an anonymous child, which is what makes the source readable.
 */
export function Tab({ children }: { value?: string; children: ReactNode }) {
  return <>{children}</>;
}
