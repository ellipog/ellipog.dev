import type { CSSProperties } from 'react';

/**
 * Progress, drawn in cells. Two shapes, for the two things this page waits on.
 *
 * `PixelBar` is reading the input: a row of cells that fill as files are read, or -- while a folder is
 * still being walked and there is no total to fill toward -- a lit cell sweeping across with a short tail.
 * The sweep is pure CSS, one delay per cell (`--i`), so a busy main thread cannot stall it.
 *
 * `Stages` is the conversion: one cell per stage of the pipeline, named, filled when done. The stage
 * names are the pipeline's own (`lib/pipeline.ts` reports them in this order), so the strip says what
 * the run is waiting on rather than only how far along it is.
 */

const CELLS = 48;

export function PixelBar({ value, label }: { value: number | null; label: string }) {
  const lit = value === null ? 0 : Math.round(Math.max(0, Math.min(1, value)) * CELLS);
  return (
    <div
      className="pixelbar"
      data-mode={value === null ? 'scan' : undefined}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value === null ? undefined : Math.round(value * 100)}
    >
      {Array.from({ length: CELLS }, (_, i) => (
        <i key={i} data-on={i < lit ? '' : undefined} style={{ '--i': i } as CSSProperties} />
      ))}
    </div>
  );
}

export const STAGES = ['detect', 'parse', 'capabilities', 'remap', 'transform', 'validate', 'emit', 'report'] as const;

export function Stages({
  done,
  running,
  complete,
  failed,
}: {
  /** How many stages have finished: the pipeline's own `done` count. */
  done: number;
  running: boolean;
  /** The run finished cleanly, so every cell is lit, `report` included. */
  complete: boolean;
  failed: boolean;
}) {
  const state = (i: number) => {
    if (complete || i < done) return 'done';
    if (i !== done) return 'todo';
    return failed ? 'failed' : running ? 'now' : 'todo';
  };
  const current = STAGES[Math.min(done, STAGES.length - 1)];
  return (
    <div
      role="progressbar"
      aria-label="Conversion"
      aria-valuemin={0}
      aria-valuemax={STAGES.length}
      aria-valuenow={complete ? STAGES.length : done}
      aria-valuetext={complete ? 'done' : failed ? `failed at ${current}` : current}
    >
      <ol className="stages" aria-hidden="true">
        {STAGES.map((name, i) => (
          <li key={name} data-state={state(i)}>
            {name}
          </li>
        ))}
      </ol>
    </div>
  );
}
