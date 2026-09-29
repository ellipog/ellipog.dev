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
 * Four kinds, and the restraint is deliberate: a page where everything is highlighted has highlighted
 * nothing. `note` is information, `tip` is a better way to do what you were already doing, `warning`
 * is something that costs time, `caution` is something that costs data.
 */
const KINDS = {
  note: { label: 'Note' },
  tip: { label: 'Tip' },
  warning: { label: 'Warning' },
  caution: { label: 'Caution' },
  important: { label: 'Important' },
} as const;

type Kind = keyof typeof KINDS;

export function Callout({ kind = 'note', children }: { kind?: string; children: ReactNode }) {
  const resolved = (kind.toLowerCase() in KINDS ? kind.toLowerCase() : 'note') as Kind;

  return (
    <aside className={`callout callout-${resolved}`}>
      <span className="callout-label">{KINDS[resolved].label}</span>
      <div className="callout-body">{children}</div>
    </aside>
  );
}
