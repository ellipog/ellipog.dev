'use client';

import { useEffect, useRef } from 'react';

import { blockPixels, EDGE, EMPTY, SIZE, type BlockKind } from '@/lib/pixel-block';

/** Where the block starts: a three-quarter view, which is also the frame a reader with reduced motion keeps. */
const START_YAW = 0.6;
/** Radians per second: one turn in about fourteen seconds. */
const SPEED = 0.45;
/** Twelve frames a second: the rate hand-drawn sprite animation runs at, and it reads as pixel art for it. */
const FRAME_MS = 83;

/**
 * One block in the game's own textures, in grayscale, turning slowly on its axis -- the hero's inspector,
 * showing whichever block the pointer is over in the wireframe beside it.
 *
 * Drawn at 64x64 into a canvas and scaled up with `image-rendering: pixelated`, so every texel is a hard
 * square. The outline is whatever CSS `color` the canvas has, re-read when the theme attribute changes.
 *
 * Decorative: `aria-hidden`, sized in CSS so the box is there before the script is, stopped while scrolled
 * out of view, and one still frame with `prefers-reduced-motion: reduce`.
 */
export function PixelBlock({ kind = 'grass' }: { kind?: BlockKind }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const kindRef = useRef(kind);
  const redraw = useRef<() => void>(() => undefined);

  useEffect(() => {
    kindRef.current = kind;
    redraw.current();
  }, [kind]);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;

    const image = ctx.createImageData(SIZE, SIZE);
    let edge: [number, number, number] = [160, 160, 160];
    let yaw = START_YAW;

    const readInk = () => {
      const m = getComputedStyle(el).color.match(/\d+(\.\d+)?/g)?.map(Number) ?? edge;
      edge = [m[0], m[1], m[2]];
    };
    const draw = () => {
      const frame = blockPixels(yaw, 0.62, kindRef.current);
      for (let i = 0; i < frame.length; i += 1) {
        const v = frame[i];
        const [r, g, b] = v === EDGE ? edge : [v, v, v];
        image.data[i * 4] = r;
        image.data[i * 4 + 1] = g;
        image.data[i * 4 + 2] = b;
        image.data[i * 4 + 3] = v === EMPTY ? 0 : 255;
      }
      ctx.putImageData(image, 0, 0);
    };
    redraw.current = draw;

    readInk();
    draw();

    const theme = new MutationObserver(() => {
      readInk();
      draw();
    });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => theme.disconnect();

    let raf = 0;
    let lastFrame = 0;
    let lastTick = performance.now();
    let onScreen = true;

    const tick = (now: number) => {
      raf = 0;
      if (!onScreen) return;
      yaw += SPEED * Math.min(0.1, (now - lastTick) / 1000);
      lastTick = now;
      if (now - lastFrame >= FRAME_MS) {
        lastFrame = now;
        draw();
      }
      raf = requestAnimationFrame(tick);
    };

    const visibility = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen && !raf) {
        lastTick = performance.now();
        raf = requestAnimationFrame(tick);
      }
    });
    visibility.observe(el);

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      theme.disconnect();
      visibility.disconnect();
      redraw.current = () => undefined;
    };
  }, []);

  return <canvas className="pixel-block" ref={canvas} width={SIZE} height={SIZE} aria-hidden="true" />;
}
