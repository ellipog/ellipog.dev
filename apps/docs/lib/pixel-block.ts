import {
  CACTUS_SIDE,
  CACTUS_TOP,
  COAL_ORE,
  COBBLESTONE,
  CRYING_OBSIDIAN,
  DEEPSLATE,
  DEEPSLATE_TOP,
  DIAMOND_ORE,
  DIRT,
  GLASS,
  GOLD_BLOCK,
  GRASS_SIDE,
  GRASS_TOP,
  IRON_ORE,
  MOSSY_COBBLESTONE,
  NETHERRACK,
  OAK_LEAVES,
  OAK_LOG,
  OAK_LOG_TOP,
  OAK_PLANKS,
  OBSIDIAN,
  SAND,
  SANDSTONE,
  SANDSTONE_BOTTOM,
  SANDSTONE_TOP,
  SPRUCE_PLANKS,
  STONE,
  STONE_BRICKS,
  soften,
} from '@/lib/textures';

/**
 * A block, rendered from scratch each frame with the game's own textures in grayscale.
 *
 * `blockPixels(yaw, pitch, kind)` returns a SIZE x SIZE frame: `EMPTY` where there is nothing, `EDGE` on the
 * wireframe, and otherwise the pixel's grey level. The component paints the levels as greys and the edges
 * in the site's frame colour, so the outline follows the theme while the block stays the block.
 *
 * How a frame is made:
 *
 *   1. The six faces are rotated and projected; the ones facing away are dropped. A cube is convex, so
 *      what survives never overlaps, and there is no depth buffer to keep. A block with holes in it
 *      (`SEE_THROUGH`) keeps its far faces and paints them first, so they show through the holes.
 *   2. Each visible face is split into two triangles and filled with its 16x16 texture, perspective-
 *      correct and nearest-neighbour, so each texel stays a hard-edged square as the block turns.
 *   3. Each face is darkened the way the game darkens it, by the direction it faces.
 *   4. The visible edges are drawn over the top -- the wireframe the rest of the site is made of.
 */

export const SIZE = 64;

/** What a pixel is: nothing, an edge of the wireframe, or a grey level (always well above both). */
export const EMPTY = 0;
export const EDGE = 1;

type Vec = [number, number, number];

const FACES: { n: Vec; v: Vec[]; kind: 'top' | 'side' | 'bottom' }[] = [
  // Corners go round from top-left as seen from outside, so `u` runs along the first edge and `v` down
  // the second -- which puts row 0 of a side's texture against the grass.
  { kind: 'top', n: [0, 1, 0], v: [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]] },
  { kind: 'bottom', n: [0, -1, 0], v: [[-1, -1, 1], [1, -1, 1], [1, -1, -1], [-1, -1, -1]] },
  { kind: 'side', n: [0, 0, 1], v: [[-1, 1, 1], [1, 1, 1], [1, -1, 1], [-1, -1, 1]] },
  { kind: 'side', n: [0, 0, -1], v: [[1, 1, -1], [-1, 1, -1], [-1, -1, -1], [1, -1, -1]] },
  { kind: 'side', n: [1, 0, 0], v: [[1, 1, 1], [1, 1, -1], [1, -1, -1], [1, -1, 1]] },
  { kind: 'side', n: [-1, 0, 0], v: [[-1, 1, -1], [-1, 1, 1], [-1, -1, 1], [-1, -1, -1]] },
];

/** One texture on all six faces. */
const all = (name: string, texture: Uint8Array) => ({ name, top: texture, side: texture, bottom: texture });

/**
 * The blocks the site can draw, by id, each as the texture on its top, sides and bottom. See
 * `lib/textures.ts` for where the pixels come from. `name` is the game's own id, which the hero prints.
 */
export const BLOCKS = {
  grass: { name: 'grass_block', top: GRASS_TOP, side: GRASS_SIDE, bottom: DIRT },
  dirt: all('dirt', DIRT),
  stone: all('stone', STONE),
  log: { name: 'oak_log', top: OAK_LOG_TOP, side: OAK_LOG, bottom: OAK_LOG_TOP },
  leaves: all('oak_leaves', OAK_LEAVES),
  sand: all('sand', SAND),
  sandstone: { name: 'sandstone', top: SANDSTONE_TOP, side: SANDSTONE, bottom: SANDSTONE_BOTTOM },
  cactus: { name: 'cactus', top: CACTUS_TOP, side: CACTUS_SIDE, bottom: CACTUS_TOP },
  cobblestone: all('cobblestone', COBBLESTONE),
  mossy: all('mossy_cobblestone', MOSSY_COBBLESTONE),
  planks: all('oak_planks', OAK_PLANKS),
  spruce: all('spruce_planks', SPRUCE_PLANKS),
  glass: all('glass', GLASS),
  obsidian: all('obsidian', OBSIDIAN),
  crying: all('crying_obsidian', CRYING_OBSIDIAN),
  netherrack: all('netherrack', NETHERRACK),
  bricks: all('stone_bricks', STONE_BRICKS),
  gold: all('gold_block', GOLD_BLOCK),
  deepslate: { name: 'deepslate', top: DEEPSLATE_TOP, side: DEEPSLATE, bottom: DEEPSLATE_TOP },
  coal: all('coal_ore', COAL_ORE),
  iron: all('iron_ore', IRON_ORE),
  diamond: all('deepslate_diamond_ore', DIAMOND_ORE),
} as const;

export type BlockKind = keyof typeof BLOCKS;

/** Blocks with holes in their texture. The faces behind show through, so they are drawn first rather than culled. */
const SEE_THROUGH: ReadonlySet<BlockKind> = new Set(['leaves', 'glass', 'cactus']);

/*
 * Minecraft's own face shading, not a light source: the game darkens each face by the direction it points
 * -- top full, north/south 0.8, east/west 0.6, bottom 0.5 -- and so does this. It is a large part of why a
 * block looks like a block from the game rather than a cube with a texture on it.
 */
function shadeOf([x, y, z]: Vec) {
  if (y > 0.5) return 1;
  if (y < -0.5) return 0.5;
  return Math.abs(z) > Math.abs(x) ? 0.8 : 0.6;
}

const DISTANCE = 7;
const SCALE = 14;

function rotate([x, y, z]: Vec, yaw: number, pitch: number): Vec {
  // Yaw about Y, then pitch about X: the block turns on its own axis while the camera looks down on it.
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  return [x1, y * cp - z1 * sp, y * sp + z1 * cp];
}

/** Screen x, screen y, and 1/w for perspective-correct texturing. */
function project([x, y, z]: Vec): [number, number, number] {
  const w = DISTANCE - z;
  const f = DISTANCE / w;
  // A pixel down from centre: looking down on the block puts more of it below its middle than above.
  return [SIZE / 2 + x * f * SCALE, SIZE / 2 + 1 - y * f * SCALE, 1 / w];
}

export function blockPixels(yaw: number, pitch = 0.62, kind: BlockKind = 'grass'): Uint8Array {
  const frame = new Uint8Array(SIZE * SIZE);
  const camera: Vec = [0, 0, DISTANCE];
  // On a unit cube a face's centre *is* its normal, so one vector serves as both.
  const facing = (face: (typeof FACES)[number]) => {
    const n = rotate(face.n, yaw, pitch);
    return n[0] * (camera[0] - n[0]) + n[1] * (camera[1] - n[1]) + n[2] * (camera[2] - n[2]) > 0;
  };
  // A solid block shows only the faces turned towards the camera. Glass and leaves show the far faces
  // through their holes as well, so those go down first and the near faces are painted over them.
  const order = SEE_THROUGH.has(kind)
    ? [...FACES.filter((f) => !facing(f)), ...FACES.filter(facing)]
    : FACES.filter(facing);

  for (const face of order) {

    const shade = shadeOf(face.n);
    const texture = BLOCKS[kind][face.kind];
    const p = face.v.map((v) => project(rotate(v, yaw, pitch)));
    const uv: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];

    for (const [a, b, c] of [[0, 1, 2], [0, 2, 3]]) {
      const [x0, y0, w0] = p[a];
      const [x1, y1, w1] = p[b];
      const [x2, y2, w2] = p[c];
      const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
      if (Math.abs(area) < 1e-6) continue;

      const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
      const maxX = Math.min(SIZE - 1, Math.ceil(Math.max(x0, x1, x2)));
      const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
      const maxY = Math.min(SIZE - 1, Math.ceil(Math.max(y0, y1, y2)));

      for (let py = minY; py <= maxY; py += 1) {
        for (let px = minX; px <= maxX; px += 1) {
          const sx = px + 0.5;
          const sy = py + 0.5;
          const l0 = ((x1 - sx) * (y2 - sy) - (x2 - sx) * (y1 - sy)) / area;
          const l1 = ((x2 - sx) * (y0 - sy) - (x0 - sx) * (y2 - sy)) / area;
          const l2 = 1 - l0 - l1;
          if (l0 < -1e-4 || l1 < -1e-4 || l2 < -1e-4) continue;

          // Perspective-correct: interpolate u/w, v/w and 1/w, then divide back out.
          const q = l0 * w0 + l1 * w1 + l2 * w2;
          const u = (l0 * uv[a][0] * w0 + l1 * uv[b][0] * w1 + l2 * uv[c][0] * w2) / q;
          const v = (l0 * uv[a][1] * w0 + l1 * uv[b][1] * w1 + l2 * uv[c][1] * w2) / q;
          const tx = Math.min(15, Math.max(0, Math.floor(u * 16)));
          const ty = Math.min(15, Math.max(0, Math.floor(v * 16)));

          // Leaves have holes in them, stored as 0: the pixel stays whatever is behind it.
          const texel = texture[ty * 16 + tx];
          if (texel === 0) continue;
          frame[py * SIZE + px] = soften(texel * shade);
        }
      }
    }

    // The face's outline, so the block keeps its wireframe on top of its texture.
    for (let i = 0; i < 4; i += 1) line(frame, p[i], p[(i + 1) % 4]);
  }

  return frame;
}

/** Bresenham, onto the frame. */
function line(frame: Uint8Array, [ax, ay]: number[], [bx, by]: number[]) {
  let x0 = Math.round(ax - 0.5);
  let y0 = Math.round(ay - 0.5);
  const x1 = Math.round(bx - 0.5);
  const y1 = Math.round(by - 0.5);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    if (x0 >= 0 && x0 < SIZE && y0 >= 0 && y0 < SIZE) frame[y0 * SIZE + x0] = EDGE;
    if (x0 === x1 && y0 === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}
