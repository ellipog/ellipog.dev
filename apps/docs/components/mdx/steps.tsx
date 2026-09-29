import type { ReactNode } from 'react';

/**
 * A sequence where the order matters and each step needs more than one line.
 *
 * An ordered list is the wrong shape for that: it cannot hold a command between two paragraphs
 * without the numbering drifting, and the numbering is the point. These are hairline-separated bands
 * with the number in a rail, which is the same construction as everything else on the site.
 */
export function Steps({ children }: { children: ReactNode }) {
  return <div className="steps">{children}</div>;
}

export function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="step">
      <div className="step-title">{title}</div>
      <div className="step-body">{children}</div>
    </div>
  );
}
