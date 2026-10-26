/**
 * 1.20-era item stacks, read as the 1.21 stacks the mappers know.
 *
 * <h2>What changed between the two</h2>
 *
 * Up to 1.20.4 a stack was `{id, Count: 1b, tag: {...}}`: a capital `Count` and free-form
 * NBT under `tag`. 1.21 writes `{id, count, components: {...}}`. FTB books from 1.20 packs
 * still load in a 1.21 instance (the game's data fixers upgrade the stacks on read), so a
 * converter reading only the new spelling would take every `Count: 64b` as one item and
 * every custom picture as blank. This pass makes the upgrade explicit, once, at load:
 *
 * - `Count` becomes `count` (a stack that writes both keeps `count`, the 1.21 reading).
 * - On FTB's own `ftbquests:custom_icon`, `tag.Icon` becomes the `ftbquests:icon` component —
 *   the same picture, the field FTB moved it to.
 * - Any other `tag` has no general 1.21 reading (the game's fixers translate per item, per
 *   field), so the stack keeps its id and count and the warning names what it carried.
 *   `Damage: 0` alone is the serializer's default for an unworn tool, not intent, and goes
 *   without a word.
 *
 * Only compounds holding a capital `Count` beside a string `id` are stacks to this pass;
 * quests, tasks and rewards carry hex `id`s and never `Count`, so nothing else is touched.
 */

import { Report } from "./report";
import { SnbtNode, snbtGet, snbtToJson } from "./snbt";

const CUSTOM_ICON = "ftbquests:custom_icon";
const TEXTURE_COMPONENT = "ftbquests:icon";

/** The tree with every 1.20-shaped stack in it rewritten; the same object when there is none. */
export function upgradeLegacyStacks(root: SnbtNode, path: string, report: Report): SnbtNode {
  let upgraded = 0;
  const walk = (node: SnbtNode): SnbtNode => {
    if (node.kind === "list") {
      let changed = false;
      const items = node.items.map((item) => {
        const next = walk(item);
        changed ||= next !== item;
        return next;
      });
      return changed ? { ...node, items } : node;
    }
    if (node.kind !== "compound") {
      return node;
    }
    let changed = false;
    let entries = node.entries.map(([key, child]): readonly [string, SnbtNode] => {
      const next = walk(child);
      changed ||= next !== child;
      return [key, next];
    });
    const id = snbtGet(node, "id");
    const legacyCount = snbtGet(node, "Count");
    if (id === undefined || id.kind !== "string" || legacyCount === undefined) {
      return changed ? { ...node, entries } : node;
    }
    upgraded++;
    const hasCount = snbtGet(node, "count") !== undefined;
    const tag = snbtGet(node, "tag");
    const out: Array<readonly [string, SnbtNode]> = [];
    let components: Array<readonly [string, SnbtNode]> | null = null;
    for (const [key, child] of entries) {
      if (key === "Count") {
        if (!hasCount) {
          out.push(["count", child]);
        }
        continue;
      }
      if (key === "tag") {
        continue;
      }
      out.push([key, child]);
    }
    if (tag !== undefined && tag.kind === "compound") {
      const icon = snbtGet(tag, "Icon");
      const rest = tag.entries.filter(([key]) => !(id.value === CUSTOM_ICON && key === "Icon"));
      if (id.value === CUSTOM_ICON && icon !== undefined && icon.kind === "string") {
        components = [[TEXTURE_COMPONENT, icon]];
      }
      const meaningful = rest.filter(
        ([key, child]) =>
          !(key === "Damage" && (child.kind === "int" || child.kind === "short" || child.kind === "byte") && child.value === 0n),
      );
      if (meaningful.length > 0) {
        report.warn({
          code: "legacy-item-nbt",
          message: `a 1.20 stack of ${id.value} carries NBT (${meaningful.map(([key]) => key).join(", ")}) with no general 1.21 component reading; it converts as the plain item`,
          path,
          line: tag.line,
          key: "tag",
          value: JSON.stringify(snbtToJson({ ...tag, entries: meaningful })).slice(0, 120),
        });
      }
    }
    if (components !== null && snbtGet(node, "components") === undefined) {
      out.push([
        "components",
        { kind: "compound", entries: components, keyLines: new Map([[TEXTURE_COMPONENT, [node.line]]]), line: node.line },
      ]);
    }
    entries = out;
    // Lines stay the file's own: a renamed `count` reports where `Count` was written.
    const keyLines = new Map<string, ReadonlyArray<number>>();
    for (const [key] of entries) {
      if (!keyLines.has(key)) {
        const source = key === "count" && !hasCount ? "Count" : key;
        keyLines.set(key, node.keyLines.get(source) ?? [node.line]);
      }
    }
    return { kind: "compound", entries, keyLines, line: node.line };
  };
  const out = walk(root);
  if (upgraded > 0) {
    report.note({
      code: "legacy-stack",
      message: `${upgraded} item stack(s) in the 1.20 shape (Count, tag) read as 1.21 stacks`,
      path,
      line: root.line,
      value: upgraded,
    });
  }
  return out;
}
