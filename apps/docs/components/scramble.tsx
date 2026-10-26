'use client';

import { useEffect, useRef, useState } from 'react';

/** What a letter is replaced with while it is being decoded: printable ASCII with no letters in it. */
const GLYPHS = '#%&*+=-:/\<>[]{}?!';
/** One letter settles per frame, and the run starts two frames behind, so a word reads left to right. */
const FRAME_MS = 32;
const LEAD = 2;

/**
 * A short label that, when it changes, decodes into its new text through a run of ASCII noise -- a
 * terminal resolving a line -- rather than swapping in place. For feedback on an action ("copy" to
 * "copied"), where the change is the point and a swap is easy to miss.
 *
 * The first render is the text as it is, so the static HTML and a reader without JavaScript see the
 * real word. With reduced motion it swaps.
 */
export function Scramble({ text }: { text: string }) {
  const [shown, setShown] = useState(text);
  const last = useRef(text);

  useEffect(() => {
    if (last.current === text) return;
    last.current = text;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(text);
      return;
    }
    let frame = 0;
    const timer = window.setInterval(() => {
      frame += 1;
      const settled = frame - LEAD;
      if (settled >= text.length) {
        window.clearInterval(timer);
        setShown(text);
        return;
      }
      setShown(
        Array.from(text, (c, i) => (i < settled || c === ' ' ? c : GLYPHS[Math.floor(Math.random() * GLYPHS.length)])).join(''),
      );
    }, FRAME_MS);
    return () => window.clearInterval(timer);
  }, [text]);

  return <>{shown}</>;
}
