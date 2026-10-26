'use client';

import { useEffect, useRef, useState } from 'react';

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
 *
 * **When the value changes after load, only the digits that changed move.** The catalog's figures are
 * live, so `2,707,157` becoming `2,707,163` scrambles the last two places and leaves the rest still —
 * which is what makes an update readable as an update rather than as the whole number re-rolling. A
 * change of length (`999,999` to `1,000,000`) has no positions to compare, so it moves every digit.
 */
export function ShuffledNumber({
  value,
  delay = 0,
  still = false,
}: {
  /** The formatted number, exactly as it should read once settled. */
  value: string;
  /**
   * How much later than the rest this one settles, in milliseconds. Used to cascade a row of them so
   * they read as one gesture rather than four unrelated flickers.
   */
  delay?: number;
  /** Skip the load animation and move only when the value later changes. For secondary figures. */
  still?: boolean;
}) {
  const [display, setDisplay] = useState(value);
  /*
   * The last value this copy finished settling on, or null before the first one has.
   *
   * Written only when an animation completes, and that is what keeps the load animation alive under
   * Strict Mode: React mounts, cleans up and re-runs every effect once in development, and a ref
   * written at the *start* of the effect would make the second run see "no change" and skip it.
   */
  const settledOn = useRef<string | null>(still ? value : null);

  useEffect(() => {
    const from = settledOn.current;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(value);
      settledOn.current = value;
      return;
    }

    const chars = [...value];
    const comparable = from !== null && from.length === value.length;
    const moves = (char: string, i: number) => /\d/.test(char) && (!comparable || from[i] !== char);

    // How many moving digits come before each character. Punctuation and unchanged digits get -1: they
    // never scramble and never lock, so they are simply always themselves.
    const ordinal: number[] = [];
    let digits = 0;
    chars.forEach((char, i) => ordinal.push(moves(char, i) ? digits++ : -1));
    if (digits === 0) {
      setDisplay(value);
      settledOn.current = value;
      return;
    }
    // The cascade across cells is a load gesture; an update arrives on its own and settles at once.
    const wait = from === null ? delay : 0;

    // 50ms per digit gives a seven-digit figure about 300ms to settle. Short enough to be a flourish
    // rather than something the reader waits for.
    const STEP_MS = 50;
    const FRAME_MS = 40;
    const startedAt = performance.now();

    const timer = window.setInterval(() => {
      // A positive delay makes this negative at first, so a staggered number is already scrambling by
      // the time its own countdown starts. The cascade is in when they finish, not when they start.
      const elapsed = performance.now() - startedAt - wait;
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
      if (settled) {
        window.clearInterval(timer);
        settledOn.current = value;
      }
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
