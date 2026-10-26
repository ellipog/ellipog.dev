'use client';

import { useEffect, useRef, useState } from 'react';

import { PixelBlock } from '@/components/pixel-block';
import { BLOCKS, type BlockKind } from '@/lib/pixel-block';
import { firstStructure, rememberStructure, STRUCTURES } from '@/lib/structures';
import { soften } from '@/lib/textures';
import {
  boundsOf,
  FACE_NAMES,
  facesOf,
  key,
  MATERIALS,
  NORMALS,
  outlineOf,
  pick,
  toCamera,
  toScreen,
  type Block,
  type Bounds,
  type Camera,
  type Hatch,
  type World as WorldMap,
} from '@/lib/voxels';

/** One layer every this many milliseconds while a structure prints. Fifteen layers: about 1.6s. */
const LAYER_MS = 105;
/** The idle orbit, in radians per second: a full turn a minute, slow enough to read as still at a glance. */
const SPIN = 0.1;
const PITCH = 0.46;
const START_YAW = -0.75;
/** How far the pointer may travel and still count as a click rather than the start of a drag. */
const SLOP = 4;
/** How far past the printed structure a placed block may go, so building cannot wander off the canvas. */
const REACH = 3;

/**
 * The hatches, as tiles: the pixels of each that are inked. Laid at a third of the ink's strength, so a
 * hatch shades whatever tone is under it rather than replacing it, in either theme.
 */
const HATCHES: Record<Hatch, { size: [number, number]; ink: (x: number, y: number) => boolean }> = {
  dots: { size: [4, 4], ink: (x, y) => (x === 0 && y === 0) || (x === 2 && y === 2) },
  lines: { size: [6, 6], ink: (x, y) => (x + y) % 6 === 0 },
  ribs: { size: [4, 1], ink: (x) => x === 0 },
  courses: { size: [8, 6], ink: (x, y) => y === 0 || y === 3 || (x === 0 && y < 3) || (x === 4 && y > 3) },
  cross: { size: [4, 4], ink: (x, y) => (x + y) % 4 === 0 || (x - y + 4) % 4 === 0 },
  flecks: { size: [7, 7], ink: (x, y) => (x >= 1 && x <= 2 && y >= 1 && y <= 2) || (x === 5 && y === 4) },
};

type Hover = { x: number; y: number; z: number; kind: BlockKind; face: string } | null;
type Particle = { x: number; y: number; vx: number; vy: number; born: number; life: number; grey: number; size: number };

/** `#rrggbb`, `#rgb` or `rgb(...)` to three numbers. Custom properties come back as the author wrote them. */
function rgbOf(value: string, fallback: [number, number, number]): [number, number, number] {
  const v = value.trim();
  if (v.startsWith('#')) {
    const hex = v.length === 4 ? [...v.slice(1)].map((c) => c + c).join('') : v.slice(1, 7);
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  const m = v.match(/\d+(\.\d+)?/g)?.map(Number);
  return m && m.length >= 3 ? [m[0], m[1], m[2]] : fallback;
}

const mix = (a: [number, number, number], b: [number, number, number], t: number) =>
  `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;

/** A fixed per-block number in [0, 1), so the print lays each layer in the same scattered order every time. */
const order = (b: Block) => (((b.x * 7919 + b.z * 104729 + b.y * 1299709) >>> 0) % 997) / 997;

/**
 * The hero: a structure from the game -- one of `lib/structures.ts`, a different one on each visit -- drawn
 * as a technical drawing, that prints itself layer by layer when the page opens and then turns slowly.
 * Point at a block to select it -- the game's thin outline, its coordinates, and the real block, textured,
 * in the inspector. Click to mine it, right-click to place one, drag to turn, `next` for another.
 *
 * **It is the one toy on the site, and it is a toy.** The canvas is `aria-hidden`; the only controls a
 * keyboard reaches are the view switch and the reset, which are real buttons. Nothing it does is needed to
 * use the page, and without JavaScript the frame is an empty viewport with its caption.
 *
 * The loop runs only while the viewport is on screen and the tab is visible. With reduced motion there is
 * no print, no orbit and no debris: it draws when something changes and otherwise sits still.
 */
export function World() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loadRef = useRef<(index: number) => void>(() => undefined);
  const modeRef = useRef<'solid' | 'wire'>('solid');
  const kickRef = useRef<() => void>(() => undefined);

  const [hover, setHover] = useState<Hover>(null);
  const [mode, setMode] = useState<'solid' | 'wire'>('solid');
  const [edited, setEdited] = useState(false);
  const [held, setHeld] = useState<BlockKind>('grass');
  // Which structure, and its size for the caption. Null until the canvas has chosen, so the static HTML
  // names no structure rather than the wrong one.
  const [shown, setShown] = useState<{ index: number; size: string } | null>(null);

  useEffect(() => {
    modeRef.current = mode;
    kickRef.current();
  }, [mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let index = firstStructure();
    let world: WorldMap = STRUCTURES[index].build();
    // The extent as printed. Mining and building do not move it, so the camera never re-frames mid-play.
    let fit: Bounds = boundsOf(world);
    let printFrom = reduced ? -Infinity : performance.now() + 250;
    const announce = () => {
      const { minX, maxX, minY, maxY, minZ, maxZ } = fit;
      setShown({ index, size: `${maxX - minX + 1} × ${maxZ - minZ + 1} × ${maxY - minY + 1}` });
      setHeld(STRUCTURES[index].signature);
      rememberStructure(index);
    };
    announce();
    const born = new Map<number, number>();
    const particles: Particle[] = [];

    let width = 0;
    let height = 0;
    let dpr = 1;
    let yaw = START_YAW;
    let pitch = PITCH;
    let spin = SPIN;

    let pointer: { x: number; y: number } | null = null;
    let press: { x: number; y: number; yaw: number; pitch: number; button: number; dragged: boolean } | null = null;
    let hovered: { block: Block; dir: number } | null = null;
    let lastHoverKey = '';

    // Colours, from the canvas's own custom properties, so the drawing follows the theme.
    let paper: [number, number, number] = [255, 255, 255];
    let ink: [number, number, number] = [24, 24, 27];
    let line = 'rgb(190,190,194)';
    let lineBack = 'rgb(225,225,228)';
    let select = 'rgb(82,82,91)';
    let hatches: Partial<Record<Hatch, CanvasPattern>> = {};
    // How much ink a top face gets, and how much more (or, on a dark ground, less) per step of shade, so
    // the light always comes from above whichever way round the theme is.
    let faceTop = 0;
    let faceStep = 0.6;
    const readColours = () => {
      const style = getComputedStyle(canvas);
      paper = rgbOf(style.getPropertyValue('--world-paper'), paper);
      ink = rgbOf(style.getPropertyValue('--world-ink'), ink);
      line = style.getPropertyValue('--world-line').trim() || line;
      lineBack = style.getPropertyValue('--world-line-back').trim() || lineBack;
      select = style.getPropertyValue('--world-select').trim() || select;
      faceTop = Number(style.getPropertyValue('--world-face-top')) || 0;
      faceStep = Number(style.getPropertyValue('--world-face-step')) || 0.6;
      hatches = {};
      for (const [name, { size, ink: inked }] of Object.entries(HATCHES) as [Hatch, (typeof HATCHES)[Hatch]][]) {
        const tile = document.createElement('canvas');
        [tile.width, tile.height] = size;
        const t = tile.getContext('2d');
        if (!t) continue;
        t.fillStyle = `rgba(${ink[0]},${ink[1]},${ink[2]},0.3)`;
        for (let y = 0; y < size[1]; y += 1) for (let x = 0; x < size[0]; x += 1) if (inked(x, y)) t.fillRect(x, y, 1, 1);
        hatches[name] = ctx!.createPattern(tile, 'repeat') ?? undefined;
      }
    };

    const camera = (): Camera => {
      const { minX, maxX, minY, maxY, minZ, maxZ } = fit;
      // Framed on the structure's footprint and height at the opening pitch, so a tall tower and a wide
      // pyramid both fill the viewport with paper all round, and dragging the pitch does not re-zoom.
      const across = Math.hypot(maxX - minX + 1, maxZ - minZ + 1);
      const tall = (maxY - minY + 1) * Math.cos(PITCH) + across * Math.sin(PITCH);
      return {
        yaw,
        pitch,
        target: [(minX + maxX + 1) / 2, (minY + maxY + 1) / 2, (minZ + maxZ + 1) / 2],
        distance: 46,
        scale: Math.min((width * 0.86) / across, (height * 0.86) / tall),
        width,
        height,
      };
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    };

    /** Where the print has got to, as a fractional layer; past `maxY + 1` it is done. */
    const printLayer = (now: number) => (printFrom === -Infinity ? Infinity : fit.minY + (now - printFrom) / LAYER_MS);

    function draw(now: number) {
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.imageSmoothingEnabled = false;
      ctx!.clearRect(0, 0, width, height);
      const cam = camera();
      const layer = printLayer(now);
      const printing = layer <= fit.maxY + 1;
      const whole = Math.floor(layer);
      const frac = layer - whole;

      // During the print a block is laid (solid), being laid (wire), or not there yet.
      const laid = (b: Block) => b.y < whole;
      const laying = (b: Block) => b.y === whole && order(b) < frac * 1.25;
      const visible: Block[] = [];
      for (const b of world.values()) if (!printing || laid(b) || laying(b)) visible.push(b);

      const present = (x: number, y: number, z: number) => {
        const b = world.get(key(x, y, z));
        if (!b) return undefined;
        if (!printing) return isNew(b, now) ? undefined : b;
        return laid(b) ? b : undefined;
      };

      const faces = facesOf(visible, present, cam);
      const wire = modeRef.current === 'wire';
      ctx!.lineJoin = 'round';

      for (const face of faces) {
        const { points } = face;
        const material = MATERIALS[face.block.kind];
        const sketch = (printing && !laid(face.block)) || isNew(face.block, now);
        // Glass shows its far side through its near one, so its back faces stay even in the solid view.
        if (!wire && !face.front && !sketch && !material.clear) continue;

        ctx!.beginPath();
        ctx!.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < 4; i += 1) ctx!.lineTo(points[i][0], points[i][1]);
        ctx!.closePath();

        if (sketch) {
          // The layer being printed: outlines only, darker, so the slice reads as the active one.
          if (!face.front) continue;
          ctx!.strokeStyle = select;
          ctx!.lineWidth = 1;
          ctx!.stroke();
          continue;
        }
        if (wire) {
          ctx!.strokeStyle = face.front ? line : lineBack;
          ctx!.lineWidth = 1;
          ctx!.stroke();
          continue;
        }
        if (material.clear) {
          // A pane, as a drawing shows one: a veil of paper, its edge, and two short strokes of glint.
          ctx!.lineWidth = 1;
          if (!face.front) {
            ctx!.strokeStyle = lineBack;
            ctx!.stroke();
            continue;
          }
          ctx!.fillStyle = `rgba(${paper[0]},${paper[1]},${paper[2]},0.55)`;
          ctx!.fill();
          ctx!.strokeStyle = line;
          ctx!.stroke();
          const [a, b, , d] = points;
          ctx!.beginPath();
          for (const t of [0.28, 0.5]) {
            ctx!.moveTo(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
            ctx!.lineTo(a[0] + (d[0] - a[0]) * t, a[1] + (d[1] - a[1]) * t);
          }
          ctx!.stroke();
          continue;
        }
        ctx!.fillStyle = mix(paper, ink, Math.max(0, Math.min(1, faceTop + face.tone * faceStep)));
        ctx!.fill();
        // The material's hatch over its tone: what tells sand from sandstone, or a plank from a log.
        const hatch = material.hatch && hatches[material.hatch];
        if (hatch) {
          ctx!.fillStyle = hatch;
          ctx!.fill();
        }
        ctx!.strokeStyle = line;
        ctx!.lineWidth = 1;
        ctx!.stroke();
      }

      if (printing) drawFrame(cam, layer, now);

      // Pick against what was just drawn, so the outline is always on the face under the pointer.
      hovered = null;
      if (pointer && !printing && !press?.dragged) {
        const hit = pick(faces, pointer.x, pointer.y, !wire);
        if (hit) hovered = { block: hit.block, dir: hit.dir };
      }
      if (hovered) {
        ctx!.strokeStyle = select;
        ctx!.lineWidth = 1.5;
        for (const quad of outlineOf(hovered.block, cam)) {
          ctx!.beginPath();
          ctx!.moveTo(quad[0][0], quad[0][1]);
          for (let i = 1; i < 4; i += 1) ctx!.lineTo(quad[i][0], quad[i][1]);
          ctx!.closePath();
          ctx!.stroke();
        }
      }
      report();

      // Debris: the mined block's own texture greys, as hard square pixels.
      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i];
        const age = (now - p.born) / 1000;
        if (age > p.life) {
          particles.splice(i, 1);
          continue;
        }
        const x = p.x + p.vx * age;
        const y = p.y + p.vy * age + 0.5 * 900 * age * age;
        const g = p.grey;
        ctx!.fillStyle = `rgb(${g},${g},${g})`;
        ctx!.fillRect(Math.round(x), Math.round(y), p.size, p.size);
      }
    }

    /** The print's furniture: the bounding box, dashed, and the slicing plane at the current layer. */
    function drawFrame(cam: Camera, layer: number, now: number) {
      const at = (x: number, y: number, z: number) => onScreenAt(x, y, z, cam);
      const lo = fit.minY;
      const hi = fit.maxY + 1;
      const [x0, x1, z0, z1] = [fit.minX, fit.maxX + 1, fit.minZ, fit.maxZ + 1];
      const box = [
        at(x0, lo, z0), at(x1, lo, z0), at(x1, lo, z1), at(x0, lo, z1),
        at(x0, hi, z0), at(x1, hi, z0), at(x1, hi, z1), at(x0, hi, z1),
      ];
      const fade = Math.max(0, Math.min(1, (now - printFrom) / 300));
      ctx!.save();
      ctx!.globalAlpha = fade;
      ctx!.setLineDash([3, 4]);
      ctx!.strokeStyle = line;
      ctx!.lineWidth = 1;
      for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) {
        ctx!.beginPath();
        ctx!.moveTo(box[a][0], box[a][1]);
        ctx!.lineTo(box[b][0], box[b][1]);
        ctx!.stroke();
      }
      const y = Math.min(hi, Math.max(lo, layer));
      const plane = [at(x0, y, z0), at(x1, y, z0), at(x1, y, z1), at(x0, y, z1)];
      ctx!.setLineDash([]);
      ctx!.strokeStyle = select;
      ctx!.beginPath();
      ctx!.moveTo(plane[0][0], plane[0][1]);
      for (let i = 1; i < 4; i += 1) ctx!.lineTo(plane[i][0], plane[i][1]);
      ctx!.closePath();
      ctx!.stroke();
      ctx!.restore();
    }

    const isNew = (b: Block, now: number) => {
      const t = born.get(key(b.x, b.y, b.z));
      return t !== undefined && now - t < 160;
    };

    /** Tell React what is selected, only when it changes. */
    function report() {
      const b = hovered?.block;
      const k = b ? `${b.x},${b.y},${b.z},${hovered!.dir}` : '';
      if (k === lastHoverKey) return;
      lastHoverKey = k;
      // Coordinates from the structure's centre, and y as the game counts it, from sea level at 64.
      setHover(
        b
          ? {
              x: b.x - Math.floor((fit.minX + fit.maxX) / 2),
              y: b.y + 64,
              z: b.z - Math.floor((fit.minZ + fit.maxZ) / 2),
              kind: b.kind,
              face: FACE_NAMES[hovered!.dir],
            }
          : null,
      );
      if (b) setHeld(b.kind);
    }

    function mine(now: number) {
      if (!hovered) return;
      const b = hovered.block;
      world.delete(key(b.x, b.y, b.z));
      setEdited(true);
      if (reduced) return;
      // Where the block was on screen, roughly its centre.
      const cam = camera();
      const [cx, cy] = onScreenAt(b.x + 0.5, b.y + 0.5, b.z + 0.5, cam);
      const texture = BLOCKS[b.kind].side;
      for (let i = 0; i < 18; i += 1) {
        let texel = 0;
        while (texel === 0) texel = texture[Math.floor(Math.random() * 256)];
        const angle = Math.random() * Math.PI * 2;
        const speed = 40 + Math.random() * 110;
        particles.push({
          x: cx + Math.cos(angle) * 6,
          y: cy + Math.sin(angle) * 6,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 160,
          born: now,
          life: 0.45 + Math.random() * 0.35,
          grey: soften(texel),
          size: Math.random() < 0.5 ? 3 : 4,
        });
      }
    }

    function place(now: number) {
      if (!hovered) return;
      const { block, dir } = hovered;
      const [nx, ny, nz] = NORMALS[dir];
      const x = block.x + nx;
      const y = block.y + ny;
      const z = block.z + nz;
      const out =
        x < fit.minX - REACH || x > fit.maxX + REACH ||
        z < fit.minZ - REACH || z > fit.maxZ + REACH ||
        y < fit.minY - REACH || y > fit.maxY + REACH * 2;
      if (out) return;
      if (world.has(key(x, y, z))) return;
      world.set(key(x, y, z), { x, y, z, kind: block.kind });
      if (!reduced) born.set(key(x, y, z), now);
      setEdited(true);
    }

    // --- the loop ---------------------------------------------------------------------------------------

    let raf = 0;
    let last = performance.now();
    let onScreen = true;

    const frame = (now: number) => {
      raf = 0;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!reduced) {
        // Stop turning while the pointer is over the island, so a block can be aimed at.
        const target = pointer || press ? 0 : SPIN;
        spin += (target - spin) * Math.min(1, dt * 3);
        if (!press?.dragged) yaw += spin * dt;
      }
      draw(now);
      if (!reduced && onScreen && !document.hidden) raf = requestAnimationFrame(frame);
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    kickRef.current = kick;

    // Reprint what is there, or print another: either way from its recipe, and from the bottom up.
    loadRef.current = (next: number) => {
      index = next;
      world = STRUCTURES[index].build();
      fit = boundsOf(world);
      born.clear();
      particles.length = 0;
      printFrom = reduced ? -Infinity : performance.now();
      setEdited(false);
      announce();
      kick();
    };

    // --- input ------------------------------------------------------------------------------------------

    const local = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onMove = (e: PointerEvent) => {
      pointer = local(e);
      if (press) {
        const dx = pointer.x - press.x;
        const dy = pointer.y - press.y;
        if (!press.dragged && Math.hypot(dx, dy) > SLOP) press.dragged = true;
        if (press.dragged) {
          yaw = press.yaw + dx * 0.009;
          pitch = Math.max(0.15, Math.min(1.1, press.pitch + dy * 0.005));
        }
      }
      kick();
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 2) return;
      pointer = local(e);
      press = { ...pointer, yaw, pitch, button: e.button, dragged: false };
      canvas.setPointerCapture(e.pointerId);
      kick();
    };
    const onUp = (e: PointerEvent) => {
      if (!press) return;
      const now = performance.now();
      if (!press.dragged) {
        // Pick at the release point first, so a click on a reduced-motion page (no loop) still lands.
        draw(now);
        if (press.button === 0 && !e.shiftKey) mine(now);
        else place(now);
      }
      press = null;
      if (e.pointerType !== 'mouse') pointer = null;
      kick();
    };
    const onLeave = () => {
      if (press) return;
      pointer = null;
      kick();
    };
    const onContext = (e: MouseEvent) => e.preventDefault();

    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('contextmenu', onContext);

    const sizer = new ResizeObserver(() => {
      resize();
      kick();
    });
    sizer.observe(canvas);

    const theme = new MutationObserver(() => {
      readColours();
      kick();
    });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    const visibility = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen) {
        last = performance.now();
        kick();
      }
    });
    visibility.observe(canvas);
    const onVisible = () => {
      last = performance.now();
      kick();
    };
    document.addEventListener('visibilitychange', onVisible);

    resize();
    readColours();
    kick();

    return () => {
      cancelAnimationFrame(raf);
      sizer.disconnect();
      theme.disconnect();
      visibility.disconnect();
      document.removeEventListener('visibilitychange', onVisible);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('contextmenu', onContext);
    };
  }, []);

  const inspected = hover?.kind ?? held;
  const structure = shown ? STRUCTURES[shown.index] : null;

  return (
    <figure className="world" role="group" aria-label={`A ${structure?.name ?? 'structure'} from the game, to play with`}>
      <canvas ref={canvasRef} className="world-canvas" aria-hidden="true" />

      <figcaption className="world-label">
        {/* Figure 1a to 1e: one figure, in as many states as there are structures. */}
        <span>fig. 1{shown ? 'abcdefgh'[shown.index] : ''}</span>
        <span>{structure && shown ? `${structure.name}, ${shown.size}` : ' '}</span>
      </figcaption>

      <div className="world-inspector" aria-hidden="true">
        <PixelBlock kind={inspected} />
        <span className="world-inspector-name">{BLOCKS[inspected].name}</span>
      </div>

      <div className="world-readout" aria-live="off">
        {hover ? (
          <>
            <span>
              x <b>{hover.x}</b>
            </span>
            <span>
              y <b>{hover.y}</b>
            </span>
            <span>
              z <b>{hover.z}</b>
            </span>
            <span className="world-face">{hover.face}</span>
          </>
        ) : (
          <span className="world-hint">click to mine · shift-click to place · drag to turn</span>
        )}
      </div>

      <div className="world-tools">
        <div className="world-modes" role="group" aria-label="Drawing">
          <button type="button" aria-pressed={mode === 'solid'} onClick={() => setMode('solid')}>
            solid
          </button>
          <button type="button" aria-pressed={mode === 'wire'} onClick={() => setMode('wire')}>
            wire
          </button>
        </div>
        {edited && shown ? (
          <button type="button" className="world-reset" onClick={() => loadRef.current(shown.index)}>
            reprint
          </button>
        ) : null}
        <button
          type="button"
          className="world-reset"
          aria-label="Print the next structure"
          disabled={!shown}
          onClick={() => shown && loadRef.current((shown.index + 1) % STRUCTURES.length)}
        >
          next
        </button>
      </div>
    </figure>
  );
}

/** One world point to the screen, through the same camera as the faces. */
const onScreenAt = (x: number, y: number, z: number, cam: Camera) => toScreen(toCamera([x, y, z], cam), cam);
