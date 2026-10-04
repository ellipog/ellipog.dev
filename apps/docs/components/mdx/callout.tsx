import type { ReactNode } from 'react';

/**
 * A callout, written in the source as a GFM alert:
 *
 *     > [!NOTE]
 *     > Something worth knowing.
 *
 * `scripts/sync.mjs` rewrites that into `<Callout kind="note">` at copy time, so no document has to
 * import anything and the markdown still reads correctly on GitHub.
 *
 * Five kinds, and the restraint is deliberate: a page where everything is highlighted has highlighted
 * nothing. `note` is information, `tip` is a better way to do what you were already doing, `warning`
 * is something that costs time, `caution` is something that costs data.
 *
 * **The mark carries the kind as much as the colour does, and here it carries it instead.** The
 * palette has one red and reserves it for `caution`, so the four remaining kinds are told apart by
 * shape alone -- which is also the version that survives being printed, being read in greyscale, and
 * being read by somebody who cannot separate the red from the ink. The icons are stroked in
 * `currentColor`, so the caution mark picks up the red from the label rule without being told about it.
 */
const KINDS = {
  note: { label: 'Note', icon: 'info' },
  tip: { label: 'Tip', icon: 'bulb' },
  warning: { label: 'Warning', icon: 'triangle' },
  caution: { label: 'Caution', icon: 'octagon' },
  important: { label: 'Important', icon: 'alert' },
} as const;

type Kind = keyof typeof KINDS;

/**
 * One path set per kind, drawn at 12px on a 24-unit grid.
 *
 * Small on purpose: the label beside it is 10.5px uppercase mono, and a mark that out-weighs the
 * word it belongs to turns a callout into a badge. `aria-hidden` because the label already says the
 * kind in words -- an announced icon would say it twice.
 */
const ICONS: Record<string, ReactNode> = {
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  bulb: (
    <>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.4.3.5.7.5 1.1h6c0-.4.1-.8.5-1.1A6 6 0 0 0 12 3z" />
    </>
  ),
  triangle: (
    <>
      <path d="M12 4 2.5 20h19L12 4z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  octagon: (
    <>
      <path d="M8 3h8l5 5v8l-5 5H8l-5-5V8l5-5z" />
      <path d="M12 8v5M12 16h.01" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h.01" />
    </>
  ),
};

export function Callout({ kind = 'note', children }: { kind?: string; children: ReactNode }) {
  const resolved = (kind.toLowerCase() in KINDS ? kind.toLowerCase() : 'note') as Kind;

  return (
    <aside className={`callout callout-${resolved}`}>
      <span className="callout-label">
        <svg
          className="callout-icon"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {ICONS[KINDS[resolved].icon]}
        </svg>
        {KINDS[resolved].label}
      </span>
      <div className="callout-body">{children}</div>
    </aside>
  );
}
