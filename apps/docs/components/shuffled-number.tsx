'use client';

import { useEffect, useState } from 'react';

/**
 * A number that resolves itself when the page loads.
 *
 * The digits scramble for a few hundred milliseconds and settle left to right, each one a little after
 * the one before it. Punctuation never moves — a comma flickering into a digit reads as a glitch
 * rather than an effect.
 *
 * Three things make this safe rather than merely clever:
 *
 * 1. **THE REAL VALUE IS IN THE SERVER HTML.** `useState(value)` means the first render — the one Next
 *    writes into `out/` — is the true number, and the effect only ever animates *towards* it on the
 *    client. JavaScript off, a hydration failure, a crawler reading the static file: all of them get a
 *    correct number that simply does not move. `check.mjs` asserts the total is present in the static
 *    HTML, because that is the property that must not break.
 * 2. **THE ANIMATED COPY IS HIDDEN FROM ASSISTIVE TECH**, and a second copy that never moves is
 *    exposed. A screen reader reading the page at 200ms would otherwise announce four digits of noise.
 * 3. **REDUCED MOTION IS HONOURED.** `prefers-reduced-motion: reduce` skips the animation and there is
 *    nothing to undo, because the server already rendered the right value.
 *
 * The digits are monospace with `tabular-nums` set on the figure classes, so a scrambling number
 * cannot change width and drag the layout around underneath it — which is the one failure mode this
 * effect genuinely has, and it is closed.
 */
export function ShuffledNumber({
  value,
  delay = 0,
}: {
  /** The formatted number, exactly as it should read once settled. */
  value: string;
  /**
   * How much later than the rest this one settles, in milliseconds. Used to cascade a row of them so
   * they read as one gesture rather than four unrelated flickers.
   */
  delay?: number;
}) {
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const chars = [...value];

    // How many digits come before each character. Punctuation gets -1: it never scrambles, and it
    // never locks, so it is simply always itself.
    const ordinal: number[] = [];
    let digits = 0;
    for (const char of chars) ordinal.push(/\d/.test(char) ? digits++ : -1);
    if (digits === 0) return;

    // 50ms per digit gives a seven-digit figure about 300ms to settle. Short enough to be a flourish
    // rather than something the reader waits for.
    const STEP_MS = 50;
    const FRAME_MS = 40;
    const startedAt = performance.now();

    const timer = window.setInterval(() => {
      // A positive delay makes this negative at first, so a staggered number is already scrambling by
      // the time its own countdown starts. The cascade is in when they finish, not when they start.
      const elapsed = performance.now() - startedAt - delay;
      let settled = true;

      const next = chars
        .map((char, i) => {
          if (ordinal[i] < 0) return char;
          if (elapsed >= ordinal[i] * STEP_MS) return char;
          settled = false;
          return String(Math.floor(Math.random() * 10));
        })
        .join('');

      setDisplay(next);
      if (settled) window.clearInterval(timer);
    }, FRAME_MS);

    return () => window.clearInterval(timer);
  }, [value, delay]);

  return (
    <>
      {/* The class is what `check.mjs` counts the pairs by. Without it the assertion has to guess from
          `aria-hidden`, and the arrows use that attribute too -- which it did, and got 15 against 4. */}
      <span className="shuffle" aria-hidden="true">
        {display}
      </span>
      <span className="sr-only">{value}</span>
    </>
  );
}
