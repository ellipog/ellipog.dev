import type { BlockKind } from '@/lib/pixel-block';

/**
 * The hero's world: blocks in a grid, drawn as a hidden-line wireframe. `lib/structures.ts` builds what
 * stands in it; this file is the geometry every structure shares.
 *
 * Everything here is plain arithmetic and returns plain data, so the component that paints it is only a
 * canvas loop and this file can be reasoned about (and run under Node) without a browser.
 *
 * How a frame is made:
 *
 *   1. Every face of every block that touches air is a candidate. A face against another block is never
 *      seen, so it is never drawn -- that is what turns ~1,000 cubes into one surface. Glass is the
 *      exception: it hides nothing, so the faces behind a window are still candidates.
 *   2. Each candidate is projected through a perspective camera that orbits the structure's centre, and
 *      the ones facing away are dropped (in the solid view; the wire view keeps them, which is the point).
 *   3. What is left is sorted far to near and painted in that order, each face filled with the page's
 *      ground and outlined, so a near face hides the lines behind it the way paper would. Voxel faces are
 *      all the same size and axis-aligned, which is the case where sorting by centre distance is reliable.
 */

export type Vec3 = [number, number, number];

/** A face is a block and one of its six directions. */
export type Dir = 0 | 1 | 2 | 3 | 4 | 5;

/** Up, down, south (+z), north (-z), east (+x), west (-x), in the order `Dir` counts them. */
export const NORMALS: Vec3[] = [
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
  [1, 0, 0],
  [-1, 0, 0],
];

export const FACE_NAMES = ['up', 'down', 'south', 'north', 'east', 'west'] as const;

/** The four corners of each face of the unit cube at the origin, going round. */
const CORNERS: Vec3[][] = [
  [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]],
  [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]],
  [[0, 1, 1], [1, 1, 1], [1, 0, 1], [0, 0, 1]],
  [[1, 1, 0], [0, 1, 0], [0, 0, 0], [1, 0, 0]],
  [[1, 1, 1], [1, 1, 0], [1, 0, 0], [1, 0, 1]],
  [[0, 1, 0], [0, 1, 1], [0, 0, 1], [0, 0, 0]],
];

/*
 * Minecraft's own face shading, as an amount of ink rather than a brightness: the game darkens a face by
 * the way it points (top none, north/south a little, east/west more, bottom most), and that is most of
 * what makes a pile of cubes read as solid.
 */
const DIRECTION_TONE = [0, 0.3, 0.1, 0.1, 0.18, 0.18];

/**
 * How a material is drawn in the solid view.
 *
 * Grey alone cannot tell sixteen materials apart, so the drawing does what an architect's section does:
 * a material is a tone and a **hatch**. Sand and leaves are stippled, wood is ruled diagonally, cut stone
 * is coursed like brick, obsidian is cross-hatched, and an ore is stone with flecks in it. The hatches
 * are laid in screen space, as a drawing's are, rather than wrapped round the cube.
 */
export type Hatch = 'dots' | 'lines' | 'ribs' | 'courses' | 'cross' | 'flecks';

export type Material = {
  /** How much darker than the paper it sits, before the face's own shading is added. */
  tone: number;
  hatch?: Hatch;
  /** Glass: drawn as a pane, and it hides nothing behind it. */
  clear?: true;
};

export const MATERIALS: Record<BlockKind, Material> = {
  grass: { tone: 0 },
  dirt: { tone: 0.08 },
  stone: { tone: 0.15 },
  log: { tone: 0.12, hatch: 'ribs' },
  leaves: { tone: 0.02, hatch: 'dots' },
  sand: { tone: 0, hatch: 'dots' },
  sandstone: { tone: 0.03, hatch: 'courses' },
  cactus: { tone: 0.12, hatch: 'ribs' },
  cobblestone: { tone: 0.17 },
  mossy: { tone: 0.15, hatch: 'dots' },
  planks: { tone: 0.06, hatch: 'lines' },
  spruce: { tone: 0.24, hatch: 'lines' },
  glass: { tone: 0, clear: true },
  obsidian: { tone: 0.44, hatch: 'cross' },
  crying: { tone: 0.4, hatch: 'cross' },
  netherrack: { tone: 0.26, hatch: 'flecks' },
  bricks: { tone: 0.14, hatch: 'courses' },
  gold: { tone: 0 },
  deepslate: { tone: 0.32 },
  coal: { tone: 0.15, hatch: 'flecks' },
  iron: { tone: 0.15, hatch: 'flecks' },
  diamond: { tone: 0.32, hatch: 'flecks' },
};

/**
 * Where a block sits, as one number: a Map keyed by a string would build three strings for every
 * neighbour it checks, and a frame checks every neighbour of every block.
 */
export const key = (x: number, y: number, z: number) => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);

export type Block = { x: number; y: number; z: number; kind: BlockKind };
export type World = Map<number, Block>;

/** A cheap, fixed hash in [0, 1), so a structure is the same structure on every load. */
export function hash(x: number, z: number, salt = 0) {
  let h = Math.imul(x * 73856093 + salt * 83492791, 1) ^ Math.imul(z, 19349663);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export type Bounds = { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };

/** The world's extent, for centring the camera and for the bounding box the print draws. */
export function boundsOf(world: World): Bounds {
  const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const { x, y, z } of world.values()) {
    b.minX = Math.min(b.minX, x);
    b.maxX = Math.max(b.maxX, x);
    b.minY = Math.min(b.minY, y);
    b.maxY = Math.max(b.maxY, y);
    b.minZ = Math.min(b.minZ, z);
    b.maxZ = Math.max(b.maxZ, z);
  }
  return b;
}

export type Camera = {
  yaw: number;
  pitch: number;
  /** Where the camera looks: the structure's centre. */
  target: Vec3;
  /** Distance from the target; the perspective. */
  distance: number;
  /** Pixels per block at the target's depth. */
  scale: number;
  width: number;
  height: number;
};

/** World point to camera space: yaw about Y, then pitch about X, with the target at the origin. */
export function toCamera([x, y, z]: Vec3, cam: Camera): Vec3 {
  const px = x - cam.target[0];
  const py = y - cam.target[1];
  const pz = z - cam.target[2];
  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  const x1 = px * cy + pz * sy;
  const z1 = -px * sy + pz * cy;
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  return [x1, py * cp - z1 * sp, py * sp + z1 * cp];
}

/** Camera space to screen pixels. */
export function toScreen([x, y, z]: Vec3, cam: Camera): [number, number] {
  const f = cam.distance / (cam.distance - z);
  return [cam.width / 2 + x * f * cam.scale, cam.height / 2 - y * f * cam.scale];
}

export type Face = {
  block: Block;
  dir: Dir;
  /** Screen corners, x/y pairs, going round. */
  points: [number, number][];
  /** Distance from the eye to the face's centre; larger is further away. */
  depth: number;
  /** 0 is the paper, 1 is the ink; the fill is mixed between them by this much. */
  tone: number;
  /** Whether it faces the camera. The solid view draws only these; the wire view draws all of them. */
  front: boolean;
};

/**
 * Which faces to draw this frame, far to near.
 *
 * `present` says which block counts as being at a place for the purpose of hiding its neighbour's face:
 * during the print, a block that has not been laid yet must not hide the face of the one beneath it.
 */
export function facesOf(
  blocks: Iterable<Block>,
  present: (x: number, y: number, z: number) => Block | undefined,
  cam: Camera,
): Face[] {
  const faces: Face[] = [];
  const eye: Vec3 = [0, 0, cam.distance];

  for (const block of blocks) {
    for (let i = 0; i < 6; i += 1) {
      const d = i as Dir;
      const [nx, ny, nz] = NORMALS[d];
      // A neighbour hides this face unless it is a pane of glass -- and two panes side by side are one
      // window, so glass does hide glass.
      const next = present(block.x + nx, block.y + ny, block.z + nz);
      if (next && (!MATERIALS[next.kind].clear || next.kind === block.kind)) continue;

      const corners = CORNERS[d].map(([cx, cy, cz]) => toCamera([block.x + cx, block.y + cy, block.z + cz], cam));
      const centre: Vec3 = [
        (corners[0][0] + corners[2][0]) / 2,
        (corners[0][1] + corners[2][1]) / 2,
        (corners[0][2] + corners[2][2]) / 2,
      ];
      const n = toCamera([block.x + 0.5 + nx, block.y + 0.5 + ny, block.z + 0.5 + nz], cam);
      const c0 = toCamera([block.x + 0.5, block.y + 0.5, block.z + 0.5], cam);
      const normal: Vec3 = [n[0] - c0[0], n[1] - c0[1], n[2] - c0[2]];
      const toEye: Vec3 = [eye[0] - centre[0], eye[1] - centre[1], eye[2] - centre[2]];
      const front = normal[0] * toEye[0] + normal[1] * toEye[1] + normal[2] * toEye[2] > 0;

      faces.push({
        block,
        dir: d,
        points: corners.map((p) => toScreen(p, cam)),
        depth: Math.hypot(toEye[0], toEye[1], toEye[2]),
        tone: MATERIALS[block.kind].tone + DIRECTION_TONE[d],
        front,
      });
    }
  }

  faces.sort((a, b) => b.depth - a.depth);
  return faces;
}

/** Whether a screen point is inside a convex quad, either winding. */
export function inside(points: [number, number][], x: number, y: number) {
  let sign = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [ax, ay] = points[i];
    const [bx, by] = points[(i + 1) % points.length];
    const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    if (cross === 0) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** The nearest drawn face under a screen point, or null. `faces` is far to near, so it is read backwards. */
export function pick(faces: Face[], x: number, y: number, solid: boolean): Face | null {
  for (let i = faces.length - 1; i >= 0; i -= 1) {
    const face = faces[i];
    if (solid && !face.front) continue;
    if (inside(face.points, x, y)) return face;
  }
  return null;
}

/**
 * The selection outline: the block's own faces that point at the camera, slightly enlarged, as the game
 * draws the box around the block under the crosshair. Every face of the cube rather than only its exposed
 * ones, so the outline is always the whole block.
 */
export function outlineOf(block: Block, cam: Camera, grow = 0.012): [number, number][][] {
  const eye: Vec3 = [0, 0, cam.distance];
  const quads: [number, number][][] = [];
  for (let d = 0; d < 6; d += 1) {
    const [nx, ny, nz] = NORMALS[d];
    const corners = CORNERS[d].map(([cx, cy, cz]) =>
      toCamera(
        [
          block.x + (cx === 0 ? -grow : 1 + grow),
          block.y + (cy === 0 ? -grow : 1 + grow),
          block.z + (cz === 0 ? -grow : 1 + grow),
        ],
        cam,
      ),
    );
    const c0 = toCamera([block.x + 0.5, block.y + 0.5, block.z + 0.5], cam);
    const n = toCamera([block.x + 0.5 + nx, block.y + 0.5 + ny, block.z + 0.5 + nz], cam);
    const mid = corners.reduce((acc, p) => [acc[0] + p[0] / 4, acc[1] + p[1] / 4, acc[2] + p[2] / 4] as Vec3, [0, 0, 0] as Vec3);
    const dot = (n[0] - c0[0]) * (eye[0] - mid[0]) + (n[1] - c0[1]) * (eye[1] - mid[1]) + (n[2] - c0[2]) * (eye[2] - mid[2]);
    if (dot > 0) quads.push(corners.map((p) => toScreen(p, cam)));
  }
  return quads;
}
