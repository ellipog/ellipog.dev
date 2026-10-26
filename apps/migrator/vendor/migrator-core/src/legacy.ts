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
 * - A loot crate (`ftbquests:lootcrate`) keeps the crate it opens: `tag.type` becomes the
 *   `ftbquests:loot_crate` component 1.21 FTB reads. The rest of its tag dresses the crate item
 *   (name, lore, glint), which the reward mapper replaces with a roll of the crate's table.
 * - An Item Filters stack (`itemfilters:or`, `itemfilters:tag`, …), the 1.20 way to say "any of
 *   these", becomes the 1.21 `ftbfiltersystem:smart_filter` stack with the same question in
 *   its expression, so the filter mapper reads both eras alike. Item Filters compares a plain
 *   stack inside a filter by item alone (`ItemFiltersAPI.areItemStacksEqual` checks NBT only
 *   for items tagged `itemfilters:check_nbt`), so an inner stack's NBT is not a loss there.
 *   Filters Tenet cannot answer (NBT, damage, count, regex, custom) keep their name in the
 *   expression, so the task mapper names them as manual work.
 *
 * Only compounds holding a capital `Count` beside a string `id` are stacks to this pass;
 * quests, tasks and rewards carry hex `id`s and never `Count`, so nothing else is touched.
 */

import { Report } from "./report";
import { SnbtNode, snbtGet, snbtToJson } from "./snbt";

const CUSTOM_ICON = "ftbquests:custom_icon";
const TEXTURE_COMPONENT = "ftbquests:icon";
const LOOT_CRATE = "ftbquests:lootcrate";
const CRATE_COMPONENT = "ftbquests:loot_crate";
const ITEM_FILTERS = "itemfilters:";
const SMART_FILTER = "ftbfiltersystem:smart_filter";
const FILTER_COMPONENT = "ftbfiltersystem:filter";

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
    const filterId = snbtGet(node, "id");
    if (
      filterId !== undefined &&
      filterId.kind === "string" &&
      filterId.value.startsWith(ITEM_FILTERS) &&
      snbtGet(node, "Count") !== undefined
    ) {
      // Read whole, before the walk below drops the nested filters' own tags.
      upgraded++;
      return filterStack(node, report, path);
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
      const crate = snbtGet(tag, "type");
      if (id.value === LOOT_CRATE && crate !== undefined && crate.kind === "string" && crate.value !== "") {
        components = [[CRATE_COMPONENT, crate]];
      }
      const meaningful = rest.filter(
        ([key, child]) =>
          !(key === "Damage" && (child.kind === "int" || child.kind === "short" || child.kind === "byte") && child.value === 0n),
      );
      if (meaningful.length > 0 && id.value !== LOOT_CRATE) {
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
        {
          kind: "compound",
          entries: components,
          keyLines: new Map(components.map(([key]) => [key, [node.line]])),
          line: node.line,
        },
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

/**
 * An Item Filters stack as the 1.21 smart filter asking the same question: the expression is
 * FTB Filter System's vocabulary, the one Tenet's filter task reads. Count travels; the
 * filter's tag is spent on the expression.
 */
function filterStack(node: SnbtNode, report: Report, path: string): SnbtNode {
  const expression = legacyFilter(node);
  const count = snbtGet(node, "count") ?? snbtGet(node, "Count");
  const line = node.line;
  report.note({
    code: "legacy-filter",
    message: `a 1.20 Item Filters stack reads as the filter ${expression.slice(0, 120)}`,
    path,
    line,
    key: "item",
    value: JSON.stringify(snbtToJson(node)).slice(0, 240),
  });
  const entries: Array<readonly [string, SnbtNode]> = [
    ["id", { kind: "string", value: SMART_FILTER, raw: JSON.stringify(SMART_FILTER), line }],
  ];
  if (count !== undefined) {
    entries.push(["count", count]);
  }
  entries.push([
    "components",
    {
      kind: "compound",
      entries: [[FILTER_COMPONENT, { kind: "string", value: expression, raw: JSON.stringify(expression), line }]],
      keyLines: new Map([[FILTER_COMPONENT, [line]]]),
      line,
    },
  ]);
  return { kind: "compound", entries, keyLines: new Map(entries.map(([key]) => [key, [line]])), line };
}

/** One stack inside or as a filter, in FTB Filter System's expression vocabulary. */
function legacyFilter(stack: SnbtNode): string {
  const id = snbtGet(stack, "id");
  const name = id !== undefined && id.kind === "string" ? id.value : "";
  if (!name.startsWith(ITEM_FILTERS)) {
    return `item(${name})`;
  }
  const kind = name.slice(ITEM_FILTERS.length);
  const tag = snbtGet(stack, "tag");
  const value = tag !== undefined ? snbtGet(tag, "value") : undefined;
  const text = value !== undefined && value.kind === "string" ? value.value.replace(/^#/, "") : "";
  const items = tag !== undefined ? snbtGet(tag, "items") : undefined;
  // An empty slot in an inventory filter holds nothing to compare, so it says nothing.
  const children =
    items !== undefined && items.kind === "list" ? items.items.filter(holdsItem).map(legacyFilter) : [];
  switch (kind) {
    case "tag":
      if (text !== "") {
        return `item_tag(${text})`;
      }
      break;
    case "mod":
      if (text !== "") {
        return `mod(${text})`;
      }
      break;
    case "block":
      return "block()";
    case "or":
    case "and":
      if (children.length === 1) {
        return children[0] as string;
      }
      if (children.length > 1) {
        return `${kind}(${children.join("")})`;
      }
      break;
    case "not":
      if (children.length === 1) {
        return `not(${children[0] as string})`;
      }
      if (children.length > 1) {
        return `not(or(${children.join("")}))`;
      }
      break;
  }
  // Kept by name, so the filter mapper sees a function Tenet cannot answer and says which;
  // what the filter carried rides in the legacy-filter note beside it.
  return `itemfilters_${kind}()`;
}

function holdsItem(stack: SnbtNode): boolean {
  const id = snbtGet(stack, "id");
  return id !== undefined && id.kind === "string" && id.value !== "" && id.value !== "minecraft:air";
}
