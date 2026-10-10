/**
 * Items and icons: FTB stacks and pictures into Tenet references.
 *
 * <h2>The four arms</h2>
 *
 * A plain `{id, count?, components?}` stays an item, with the key renamed (`id` becomes
 * `item`) and the components passed through verbatim as JSON. FTB's custom pictures hide
 * inside the same shape with `id: "ftbquests:custom_icon"`: a `ftbquests:icon` component
 * carries a file path (`{texture}`) or an atlas region (`{sprite}`), and a
 * `ftbquests:entity_face` component carries an entity (`{entity}`). File or atlas is FTB's
 * own rule, read from its icon source: a `.png`/`.jpg` suffix is a file, anything else an
 * atlas region. Both keys present is malformed packing; the entity wins and the report names
 * the collision, because a press that draws nothing reads as a broken control while a press
 * that draws the mob reads as a choice.
 *
 * <h2>What drops, and what never does</h2>
 *
 * Data components on item arms travel whole — Tenet resolves them at use, warning itself
 * about items a pack's mods do not have. Components on custom arms have nowhere to travel
 * (a texture path is not an item), so any key beyond the two reserved ones warns naming
 * itself. `ftbquests:missing_item` is FTB's tombstone for an item the pack no longer has;
 * the id it stood for rides in its component, so the intended item is recovered rather than
 * carried as a placeholder that could never resolve.
 */

import { Report } from "./report";
import { SnbtNode, snbtGet, snbtToJson } from "./snbt";

export interface ItemRefJson {
  readonly item: string;
  readonly count?: number;
  readonly components?: unknown;
}

export type IconJson = ItemRefJson | { texture: string } | { sprite: string } | { entity: string };

const CUSTOM_ICON = "ftbquests:custom_icon";
const TEXTURE_COMPONENT = "ftbquests:icon";
const ENTITY_COMPONENT = "ftbquests:entity_face";
const MISSING_ITEM = "ftbquests:missing_item";
const MAX_COUNT = 6400;

/**
 * An FTB item stack into a Tenet item reference, or null when it names nothing mappable.
 * Counts clamp to 1–6400 with a warning; components pass through verbatim as JSON.
 */
export function mapItemRef(
  node: SnbtNode,
  report: Report,
  path: string,
  what: string,
): ItemRefJson | null {
  if (node.kind !== "compound") {
    report.error({
      code: "malformed-icon",
      message: `${what} is not an item object`,
      path,
      line: node.line,
    });
    return null;
  }
  const id = snbtGet(node, "id");
  if (id === undefined || id.kind !== "string" || id.value.length === 0) {
    report.error({
      code: "malformed-icon",
      message: `${what} names no item`,
      path,
      line: node.line,
      key: "id",
    });
    return null;
  }
  if (id.value === MISSING_ITEM) {
    return recoverMissing(node, report, path, what);
  }
  const out: { item: string; count?: number; components?: unknown } = { item: id.value };
  const count = snbtGet(node, "count");
  if (count !== undefined) {
    const clamped = clampCount(count, report, path, what);
    if (clamped === null) {
      return null;
    }
    if (clamped !== 1) {
      out.count = clamped;
    }
  }
  const components = snbtGet(node, "components");
  if (components !== undefined) {
    if (components.kind !== "compound") {
      report.error({
        code: "malformed-icon",
        message: `${what} carries components that are not an object`,
        path,
        line: components.line,
        key: "components",
      });
      return null;
    }
    out.components = componentsToJson(components, report, path, what);
  }
  return out;
}

/**
 * A components object into datapack JSON, with two systematic translations:
 *
 * - NBT has no booleans, so flag fields arrive as `0b`/`1b` bytes (`pollinated: 1b`)
 *   while JSON codecs demand `false`/`true`. Plain `0`/`1` stay numeric — the pack's own
 *   spelling distinguishes flags from quantities, and only the byte form converts.
 * - JSON has no 64-bit integers: an integral literal outside ±(2^53-1) cannot survive the
 *   trip (Tenet's long codec refuses the string form, a rounded number matches nothing).
 *   The whole top-level component goes — not the leaf — because any retained ancestor
 *   still compares unequal at match time, so a pruned husk would gate exactly as badly
 *   as the missing digits. Each item names what went and what converted, so batch review
 *   can spot-check both readings. Task match data reports through `onDropped` instead,
 *   so the caller can answer the follow-up question: strict is unachievable without the
 *   digits, and only fuzzy still matches.
 */
export function componentsToJson(
  node: SnbtNode,
  report: Report,
  path: string,
  what: string,
  onDropped?: (components: Array<string>) => void,
): Record<string, unknown> {
  const coerced: Array<string> = [];
  const dropped: Array<string> = [];
  const droppedTop: Array<string> = [];
  const walk = (value: SnbtNode, trail: string, top: string): unknown => {
    if (value.kind === "compound") {
      const out: Record<string, unknown> = {};
      for (const [key, child] of value.entries) {
        const leaf = walk(child, trail === "" ? key : `${trail}.${key}`, trail === "" ? key : top);
        if (leaf !== undefined) {
          out[key] = leaf;
        }
      }
      return out;
    }
    if (value.kind === "list") {
      const out: Array<unknown> = [];
      for (let index = 0; index < value.items.length; index++) {
        const leaf = walk(value.items[index] as SnbtNode, `${trail}[${index}]`, top);
        if (leaf !== undefined) {
          out.push(leaf);
        }
      }
      return out;
    }
    if (
      (value.kind === "byte" ||
        value.kind === "short" ||
        value.kind === "int" ||
        value.kind === "long") &&
      (value.value > BigInt("9007199254740991") || value.value < BigInt("-9007199254740991"))
    ) {
      dropped.push(trail);
      droppedTop.push(top);
      return undefined;
    }
    if (value.kind === "byte" && (value.value === 0n || value.value === 1n)) {
      coerced.push(trail);
      return value.value === 1n;
    }
    return snbtToJson(value);
  };
  const json = walk(node, "", "") as Record<string, unknown>;
  if (coerced.length > 0) {
    report.note({
      code: "byte-flag-component",
      message: `${what} carries byte flags read as true/false: ${coerced.join(", ")}`,
      path,
      line: node.line,
      key: "components",
      value: coerced,
    });
  }
  const gone = [...new Set(droppedTop)];
  for (const key of gone) {
    delete json[key];
  }
  if (dropped.length > 0) {
    if (onDropped !== undefined) {
      // Task match data: the caller reports in context, because the drop forces a
      // follow-up — strict matching is unachievable without the digits.
      onDropped(gone);
    } else {
      report.warn({
        code: "huge-long-component",
        message: `${what} carries integers JSON cannot hold exactly, dropped whole components: ${gone.join(", ")}`,
        path,
        line: node.line,
        key: "components",
        value: dropped,
      });
    }
  }
  return json;
}

/**
 * An FTB icon (quest, chapter, group, book, task or reward) into Tenet's icon union, or null
 * when absent. Absent stays absent: the type's own picture is the default on both sides.
 */
export function mapIcon(
  node: SnbtNode | undefined,
  report: Report,
  path: string,
  what: string,
): IconJson | null {
  if (node === undefined) {
    return null;
  }
  if (node.kind !== "compound") {
    report.error({
      code: "malformed-icon",
      message: `${what} is not an icon object`,
      path,
      line: node.line,
    });
    return null;
  }
  const id = snbtGet(node, "id");
  const idText = id !== undefined && id.kind === "string" ? id.value : null;
  if (idText === CUSTOM_ICON) {
    return mapCustomIcon(node, report, path, what);
  }
  return mapItemRef(node, report, path, what);
}

function mapCustomIcon(
  node: SnbtNode,
  report: Report,
  path: string,
  what: string,
): IconJson | null {
  const components = snbtGet(node, "components");
  const reserved = new Map<string, string>();
  if (components !== undefined && components.kind === "compound") {
    for (const [key, value] of components.entries) {
      if ((key === TEXTURE_COMPONENT || key === ENTITY_COMPONENT) && value.kind === "string") {
        if (!reserved.has(key)) {
          reserved.set(key, value.value);
        }
      } else {
        report.warn({
          code: "icon-components-dropped",
          message: `${what} carries the component ${JSON.stringify(key)}, which a custom picture cannot keep`,
          path,
          line: value.line,
          key,
        });
      }
    }
  }
  const entity = reserved.get(ENTITY_COMPONENT);
  const texture = reserved.get(TEXTURE_COMPONENT);
  if (entity !== undefined && texture !== undefined) {
    report.note({
      code: "icon-both-arms",
      message: `${what} names both an entity and a texture; the entity draws`,
      path,
      line: node.line,
      key: "icon",
    });
  }
  if (entity !== undefined) {
    return { entity };
  }
  if (texture !== undefined) {
    // FTB's own file-or-atlas rule: a .png/.jpg suffix is a file, anything else an atlas
    // region. A sprite-form string in the texture arm would blit a path no file holds, so the
    // arm is chosen here rather than downstream.
    if (/\.(png|jpg)$/i.test(texture)) {
      return { texture };
    }
    return { sprite: texture };
  }
  report.error({
    code: "malformed-icon",
    message: `${what} is a custom icon with no texture or entity behind it`,
    path,
    line: node.line,
    key: "icon",
  });
  return null;
}

function recoverMissing(
  node: SnbtNode,
  report: Report,
  path: string,
  what: string,
): ItemRefJson | null {
  const components = snbtGet(node, "components");
  let recovered: string | null = null;
  if (components !== undefined && components.kind === "compound") {
    const inner = snbtGet(components, MISSING_ITEM);
    if (inner !== undefined && inner.kind === "string") {
      recovered = inner.value;
    }
  }
  if (recovered === null) {
    report.error({
      code: "malformed-icon",
      message: `${what} is FTB's missing_item tombstone with no id recorded in it`,
      path,
      line: node.line,
      key: "item",
    });
    return null;
  }
  report.note({
    code: "recovered-item",
    message: `${what} was FTB's missing_item tombstone; the item it stood for (${recovered}) is used instead`,
    path,
    line: node.line,
    key: "item",
    value: recovered,
  });
  return { item: recovered };
}

function clampCount(node: SnbtNode, report: Report, path: string, what: string): number | null {
  let value: number | null = null;
  if (
    node.kind === "byte" ||
    node.kind === "short" ||
    node.kind === "int" ||
    node.kind === "long"
  ) {
    value = Number(node.value);
  } else if (node.kind === "float" || node.kind === "double") {
    value = Math.floor(node.value);
  }
  if (value === null || !Number.isFinite(value)) {
    report.error({
      code: "malformed-icon",
      message: `${what} asks for a count that is not a number`,
      path,
      line: node.line,
      key: "count",
    });
    return null;
  }
  if (value < 1) {
    report.warn({
      code: "clamped-count",
      message: `${what} asks for ${value}, below one; it counts one`,
      path,
      line: node.line,
      key: "count",
      value,
    });
    return 1;
  }
  if (value > MAX_COUNT) {
    report.warn({
      code: "clamped-count",
      message: `${what} asks for ${value}, over Tenet's cap of ${MAX_COUNT}; it counts ${MAX_COUNT}`,
      path,
      line: node.line,
      key: "count",
      value,
    });
    return MAX_COUNT;
  }
  return value;
}
