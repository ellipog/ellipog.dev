import type { BlockKind } from '@/lib/pixel-block';
import { hash, key, type World } from '@/lib/voxels';

/**
 * What stands in the hero: one of a handful of structures from the game, chosen when the page opens.
 *
 * Each is built from a fixed recipe and a fixed hash, so a structure is the same blocks on every load --
 * only which one is shown changes. They are deliberately different shapes rather than different
 * materials on one shape: a round island, a stepped pyramid, a gabled house, a tall broken frame and a
 * cut-open cube each read as themselves from across the room, and in grey that is all there is to go on.
 */
export type Structure = {
  id: string;
  /** What the figure's caption calls it. */
  name: string;
  /** The block the inspector shows before anything is pointed at. */
  signature: BlockKind;
  build: () => World;
};

/** A world and the three verbs every recipe uses. */
function site() {
  const world: World = new Map();
  const put = (x: number, y: number, z: number, kind: BlockKind) => world.set(key(x, y, z), { x, y, z, kind });
  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, kind: BlockKind) => {
    for (let x = x0; x <= x1; x += 1) for (let y = y0; y <= y1; y += 1) for (let z = z0; z <= z1; z += 1) put(x, y, z, kind);
  };
  const clear = (x: number, y: number, z: number) => world.delete(key(x, y, z));
  const at = (x: number, y: number, z: number) => world.get(key(x, y, z));
  return { world, put, box, clear, at };
}

/**
 * A floating island's ground: a disc of columns, rolling a block or two on top and hanging deeper at
 * the middle than at the rim -- the shape every floating island in the game has. Returns the height of
 * the top of each column so a recipe can stand things on it.
 */
function floatingGround(
  put: (x: number, y: number, z: number, kind: BlockKind) => void,
  size: number,
  layer: (x: number, z: number, depthBelowTop: number) => BlockKind,
  relief = 1,
) {
  const c = (size - 1) / 2;
  const tops = new Map<string, number>();
  for (let x = 0; x < size; x += 1) {
    for (let z = 0; z < size; z += 1) {
      const r = Math.hypot(x - c, z - c);
      const rim = c - 0.3 + (hash(x, z, 1) - 0.5) * 1.4;
      if (r > rim) continue;
      const t = 1 - r / rim;
      const top = Math.round(4 + 0.9 * t * relief + (Math.sin(x * 1.1) * 0.45 + Math.cos(z * 0.9) * 0.4) * relief);
      const depth = 1 + Math.round(Math.pow(t, 1.7) * 9 + hash(x, z, 2) * 1.4);
      for (let y = top - depth; y <= top; y += 1) put(x, y, z, layer(x, z, top - y));
      tops.set(`${x},${z}`, top);
    }
  }
  return tops;
}

/** An oak: logs, two wide layers of leaves, then a cross on top. `wide` 1 is a young tree that fits a corner. */
function oak(
  put: (x: number, y: number, z: number, kind: BlockKind) => void,
  at: (x: number, y: number, z: number) => unknown,
  tx: number,
  ground: number,
  tz: number,
  trunk = 4,
  wide = 2,
) {
  for (let i = 1; i <= trunk; i += 1) put(tx, ground + i, tz, 'log');
  for (let dy = trunk - 1; dy <= trunk + 2; dy += 1) {
    const reach = dy <= trunk ? wide : 1;
    for (let dx = -reach; dx <= reach; dx += 1) {
      for (let dz = -reach; dz <= reach; dz += 1) {
        const corner = Math.abs(dx) === reach && Math.abs(dz) === reach;
        if (corner && (dy === trunk + 2 || hash(dx + 9, dz + 9, dy) < 0.6)) continue;
        if (dx === 0 && dz === 0 && dy <= trunk) continue;
        if (!at(tx + dx, ground + dy, tz + dz)) put(tx + dx, ground + dy, tz + dz, 'leaves');
      }
    }
  }
}

/** The original: grass over two blocks of dirt over stone, and one oak a little off the middle. */
function island(): World {
  const { world, put, at } = site();
  const size = 13;
  const tops = floatingGround(put, size, (_x, _z, d) => (d === 0 ? 'grass' : d <= 2 ? 'dirt' : 'stone'));
  const c = Math.round((size - 1) / 2);
  oak(put, at, c + 1, tops.get(`${c + 1},${c - 2}`) ?? 4, c - 2);
  return world;
}

/**
 * A desert pyramid: six steps of sandstone on a plinth of sand over sandstone, a doorway cut into the
 * front, and cacti in the dunes. A plinth rather than an island, so it reads as a model on a table.
 */
function pyramid(): World {
  const { world, put, box, clear } = site();
  const size = 13;
  const c = 6;
  box(0, size - 1, -2, -1, 0, size - 1, 'sandstone');
  for (let x = 0; x < size; x += 1) {
    for (let z = 0; z < size; z += 1) {
      put(x, 0, z, 'sand');
      // A dune here and there along the edges, where the pyramid is not.
      const edge = Math.min(x, z, size - 1 - x, size - 1 - z) === 0;
      if (edge && hash(x, z, 3) > 0.62) put(x, 1, z, 'sand');
    }
  }
  for (let k = 0; k <= 5; k += 1) {
    const r = 5 - k;
    box(c - r, c + r, 1 + k, 1 + k, c - r, c + r, 'sandstone');
  }
  // The doorway: a notch two high into the front, so the steps have something to frame.
  for (const [y, z] of [[1, 11], [1, 10], [2, 10], [1, 9], [2, 9]]) clear(c, y, z);
  // Cacti: on the sand, between the pyramid's corners and the plinth's.
  for (const [x, z, h] of [[0, 2, 3], [12, 9, 2], [2, 12, 1]]) box(x, x, 1, h, z, z, 'cactus');
  return world;
}

/**
 * A cottage of the plains-village kind: a cobblestone floor, oak plank walls framed in logs, glass in the
 * windows, a door you can see into, a spruce roof stepped to a ridge, a chimney, and a young oak in the
 * corner of the garden. The glass is real: the walls behind a window show through it.
 */
function cottage(): World {
  const { world, put, box, clear, at } = site();
  const size = 13;
  box(0, size - 1, -3, -3, 0, size - 1, 'stone');
  box(0, size - 1, -2, -1, 0, size - 1, 'dirt');
  box(0, size - 1, 0, 0, 0, size - 1, 'grass');

  const [x0, x1, z0, z1] = [3, 9, 3, 8];
  box(x0, x1, 1, 1, z0, z1, 'cobblestone');
  for (let x = x0; x <= x1; x += 1) {
    for (let z = z0; z <= z1; z += 1) {
      const edgeX = x === x0 || x === x1;
      const edgeZ = z === z0 || z === z1;
      if (!edgeX && !edgeZ) continue;
      for (let y = 2; y <= 4; y += 1) put(x, y, z, edgeX && edgeZ ? 'log' : 'planks');
    }
  }
  // Windows: two in the back, two flanking the door, a wide one in each end.
  for (const [x, z] of [[5, z0], [7, z0], [4, z1], [8, z1], [x0, 5], [x0, 6], [x1, 5], [x1, 6]]) put(x, 3, z, 'glass');
  clear(6, 2, z1);
  clear(6, 3, z1);
  // A path of cobblestone to the door.
  for (let z = z1 + 1; z < size; z += 1) put(6, 0, z, 'cobblestone');

  // The roof: a ridge along x, stepping in a block each course, overhanging the walls by one all round.
  for (let i = 0; i <= 3; i += 1) box(x0 - 1, x1 + 1, 5 + i, 5 + i, z0 - 1 + i, z1 + 1 - i, 'spruce');
  box(8, 8, 5, 9, 4, 4, 'cobblestone');

  oak(put, at, 11, 0, 1, 3, 1);
  return world;
}

/**
 * A ruined portal on a scrap of floating ground, the way the game scatters them: an obsidian frame with
 * blocks missing and one weeping, netherrack spread round its foot, the fallen pieces lying in the grass,
 * and a block of gold for whoever finds it.
 */
function ruinedPortal(): World {
  const { world, put, clear } = site();
  const size = 13;
  const c = (size - 1) / 2;
  const tops = floatingGround(
    put,
    size,
    (x, z, d) => {
      // Netherrack spreads from the portal's foot: always under it, thinning out with distance.
      const near = Math.hypot(x - c, (z - c) * 1.6) + hash(x, z, 4) * 2.4;
      if (d === 0) return near < 4.2 ? 'netherrack' : 'grass';
      if (d <= 2) return near < 3.2 ? 'netherrack' : 'dirt';
      return hash(x, z, d) < 0.25 ? 'mossy' : 'stone';
    },
    0.5,
  );

  // The frame stands on the highest ground under it, with netherrack filling any gap below.
  const xs = [4, 5, 6, 7];
  const z = 6;
  const base = Math.max(...xs.map((x) => tops.get(`${x},${z}`) ?? 4)) + 1;
  for (const x of xs) for (let y = (tops.get(`${x},${z}`) ?? 4) + 1; y < base; y += 1) put(x, y, z, 'netherrack');
  for (const x of xs) {
    put(x, base, z, 'obsidian');
    put(x, base + 4, z, 'obsidian');
  }
  for (let y = base + 1; y <= base + 3; y += 1) {
    put(4, y, z, 'obsidian');
    put(7, y, z, 'obsidian');
  }
  // The ruin: a corner and a side gone, one block crying.
  clear(7, base + 4, z);
  clear(7, base + 3, z);
  clear(6, base + 4, z);
  put(4, base + 2, z, 'crying');
  // Where the missing pieces landed.
  for (const [x, zz] of [[9, 8], [8, 9], [3, 9]]) put(x, (tops.get(`${x},${zz}`) ?? 4) + 1, zz, 'obsidian');
  put(9, (tops.get(`9,4`) ?? 4) + 1, 4, 'gold');
  return world;
}

/**
 * A chunk section, cut open: grass, dirt and stone over deepslate, a cave wandering through, seams of
 * coal and iron in the stone and diamonds at the bottom -- with a quarter of it taken out, so the inside
 * is on show the way a cutaway drawing shows it.
 */
function chunk(): World {
  const { world, put, clear, at } = site();
  const size = 12;
  const floor = -8;
  for (let x = 0; x < size; x += 1) {
    for (let z = 0; z < size; z += 1) {
      const top = 3 + Math.round(Math.sin(x * 0.55) * 0.6 + Math.cos(z * 0.5 + 1) * 0.6);
      const slate = -4 - (hash(x, z, 5) < 0.5 ? 0 : 1);
      for (let y = floor; y <= top; y += 1) {
        put(x, y, z, y === top ? 'grass' : y >= top - 2 ? 'dirt' : y < slate ? 'deepslate' : 'stone');
      }
    }
  }

  // Ore: a small blob round each centre, only where the host rock is the right rock.
  const vein = (cx: number, cy: number, cz: number, ore: BlockKind, host: BlockKind, salt: number) => {
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 1 && hash(cx + dx * 3 + dy, cz + dz * 5, salt) < 0.55) continue;
          if (at(cx + dx, cy + dy, cz + dz)?.kind === host) put(cx + dx, cy + dy, cz + dz, ore);
        }
      }
    }
  };
  vein(2, -1, 3, 'coal', 'stone', 11);
  vein(8, 0, 2, 'coal', 'stone', 12);
  vein(4, -2, 9, 'coal', 'stone', 13);
  vein(9, -3, 6, 'iron', 'stone', 14);
  vein(3, -3, 6, 'iron', 'stone', 15);
  vein(8, -6, 8, 'diamond', 'deepslate', 16);
  vein(6, -7, 6, 'diamond', 'deepslate', 17);

  // A cave: a worm of spheres from one side to the other, dipping as it goes.
  for (let s = 0; s <= 40; s += 1) {
    const t = s / 40;
    const cx = -1 + t * (size + 1);
    const cy = -1 - Math.sin(t * Math.PI) * 2.2;
    const cz = 2.5 + t * 4 + Math.sin(t * 7) * 1.2;
    const r = 1.25 + Math.sin(t * 11) * 0.3;
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x += 1) {
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y += 1) {
        for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z += 1) {
          if (Math.hypot(x - cx, (y - cy) * 1.2, z - cz) <= r) clear(x, y, z);
        }
      }
    }
  }

  // The cutaway: the near quarter, down to the deepslate floor, so the floor shows its diamonds.
  for (let x = size / 2; x < size; x += 1) {
    for (let z = size / 2; z < size; z += 1) {
      for (let y = -5; y <= 8; y += 1) clear(x, y, z);
    }
  }
  return world;
}

export const STRUCTURES: Structure[] = [
  { id: 'island', name: 'floating island', signature: 'grass', build: island },
  { id: 'pyramid', name: 'desert pyramid', signature: 'sandstone', build: pyramid },
  { id: 'cottage', name: 'plains cottage', signature: 'planks', build: cottage },
  { id: 'portal', name: 'ruined portal', signature: 'obsidian', build: ruinedPortal },
  { id: 'chunk', name: 'chunk section, cut away', signature: 'diamond', build: chunk },
];

/**
 * Which structure to open with: any but the one shown last time, so a reload is always something new.
 * Remembered in `localStorage`; where that is denied, it is simply random.
 */
export function firstStructure(): number {
  let last = -1;
  try {
    last = STRUCTURES.findIndex((s) => s.id === localStorage.getItem('world'));
  } catch {
    // Storage denied: no memory, so no exclusion.
  }
  const choices = STRUCTURES.map((_, i) => i).filter((i) => i !== last);
  return choices[Math.floor(Math.random() * choices.length)];
}

/** Remember what is on show, for `firstStructure` next time. */
export function rememberStructure(index: number) {
  try {
    localStorage.setItem('world', STRUCTURES[index].id);
  } catch {
    // Storage denied: the next load is random rather than different, which is fine.
  }
}
