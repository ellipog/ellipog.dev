/**
 * Geometry: FTB units into Tenet pixels, deterministically.
 *
 * <h2>The scales</h2>
 *
 * Quest coordinates multiply by 64: a typical 2.0-unit gap becomes Tenet's 128px
 * title-collision threshold. Sizes (quests, images, links) multiply by 48: measured against
 * FTB in-game rendering, 32 drew nodes about two-thirds their FTB size, and 48 restores them
 * to Tenet's own default node size. Both scales ride in {@link GeomOptions} rather than living
 * as constants,
 * so a pack that needs them tuned tunes them in one place and the report names the scale.
 *
 * <h2>Rounding and nudging</h2>
 *
 * A scaled value that is not whole records a `rounded-coordinate` note naming the raw value,
 * the scale and the pixel it sits at — never a silent move. Positions that land on the same
 * pixel nudge `+1,+1` in list order until free ({@link nudgeDuplicates}): Tenet warns on
 * duplicate quest positions, and the tool's nudge lands on positions that load with zero
 * warnings. Only quest nodes nudge; images and links keep their scaled positions.
 */

export interface GeomOptions {
  readonly coordinateScale: number;
  readonly sizeScale: number;
  /**
   * Extra multiplier for chapter images only, applied to width and height with the visual
   * center preserved. 1.0 is neutral; packs whose pictures read small next to FTB take more.
   */
  readonly imageScale: number;
}

export const DEFAULT_GEOM: GeomOptions = { coordinateScale: 64, sizeScale: 48, imageScale: 1.0 };

export const MIN_PX = 16;
export const MAX_PX = 512;

export interface ScaledCoord {
  readonly px: number;
  readonly exact: boolean;
}

/** A coordinate scaled to whole pixels, flagging whether the raw value landed exactly. */
export function scaleCoord(value: number, scale: number): ScaledCoord {
  const px = Math.round(value * scale);
  return { px, exact: value * scale === px };
}

export interface CornerPoint {
  readonly px: number;
  readonly exact: boolean;
}

/**
 * An FTB center into a Tenet top-left corner: every FTB movable draws centered on its
 * position (`QuestPanel.alignWidgets` subtracts half the size with no corner branch —
 * `corner` moves only the rotation pivot on both sides), while every Tenet box starts at
 * its corner (quest `nodeVisible` reads `[x, x+size]`). The corner sits half the drawn size
 * up-left of the scaled center; `exact` is false when that corner is not a whole pixel.
 */
export function centerToCorner(center: number, sizePx: number, scale: number): CornerPoint {
  const ideal = center * scale - sizePx / 2;
  const px = Math.round(ideal);
  return { px, exact: ideal === px };
}

export interface SizedPx {
  readonly px: number;
  readonly clamped: boolean;
}

/** A size scaled to pixels inside Tenet's 16–512 node bounds, flagging the clamp. */
export function sizePx(ftbSize: number, geom: GeomOptions): SizedPx {
  const px = Math.round(ftbSize * geom.sizeScale);
  if (px < MIN_PX) {
    return { px: MIN_PX, clamped: true };
  }
  if (px > MAX_PX) {
    return { px: MAX_PX, clamped: true };
  }
  return { px, clamped: false };
}

export interface NudgedPoint {
  readonly x: number;
  readonly y: number;
  readonly moved: boolean;
}

/**
 * Positions with collisions resolved: in list order, a point sitting on a taken pixel steps
 * `+1,+1` until it finds a free one. Deterministic — same list in, same points out — and
 * `moved` names every point that travelled, for the report.
 */
export function nudgeDuplicates(points: ReadonlyArray<{ x: number; y: number }>): Array<NudgedPoint> {
  const taken = new Set<string>();
  return points.map((point) => {
    let x = point.x;
    let y = point.y;
    let moved = false;
    while (taken.has(`${x},${y}`)) {
      x += 1;
      y += 1;
      moved = true;
    }
    taken.add(`${x},${y}`);
    return { x, y, moved };
  });
}
