/**
 * Tasks: every FTB task type into its Tenet shape, with nothing silently changed.
 *
 * <h2>Readings pinned against FTB-Quests 1.21.1 sources (not recalled)</h2>
 *
 * - Goal counts live on the task, not the stack: `ItemTask` reads `count` with a floor of 1
 *   and writes its display stack at count 1, so `item.count` is display size and never the
 *   goal. Tenet's `count` is the goal: task-level `count`, default 1, clamped to 1–6400.
 * - `match_components` absent reads `none`: `ItemTask` starts at `NONE`, writes the key only
 *   when it is not `NONE` and reads it through `NameMap.of(NONE, …)` (every 2101 build from
 *   1.0 to 1.36 alike), so an unmarked task takes any stack of its item. Tenet's default is
 *   strict, so `none` and `fuzzy` travel and `strict` goes as the default; anything else
 *   fails naming it. A 1.19 or 1.20 book says the same with `match_nbt` and `weak_nbt_match`:
 *   `match_nbt: true` compares the whole tag (strict), adding `weak_nbt_match` compares only
 *   what the task names (fuzzy), and `false` or absent compares the item alone (none). Absent
 *   is FTB's `DEFAULT`, which checks the tag only for items tagged `ftbquests:check_nbt`; a
 *   book cannot say which items a pack tags, so it reads none.
 * - `task_screen_only` is `manualOnly` under Tenet's name; the piped task-screen path is a
 *   documented loss, the manual half is kept.
 * - `observation_type` is legacy when `observe_type` is present (FTB prefers the ordinal):
 *   ordinals map `0–6` onto block, block_tag, block_state, block_entity, block_entity_type,
 *   entity_type, entity_type_tag — the source order, also Tenet's own vocabulary.
 * - `timer` defaults `0` in FTB against Tenet's `20`, and `points` defaults levels in FTB
 *   against points in Tenet: both emit always, because omitting either would change the task.
 * - `criterion: ""` means the whole advancement on both sides: emitted as absent, never as
 *   an empty string (which would name a criterion that does not exist).
 * - `custom` types have no Tenet task to become: they convert to `tenet:custom`
 *   placeholders keyed by the task's own id, so the quest waits for a handler instead
 *   of completing free, while the quest and its siblings still convert.
 * - Quest-unanswerable filter functions (`component` and friends) become `tenet:custom`
 *   placeholders keyed by the task's own id: dropping one would silently finish quests whose
 *   only task it was, while a handler-less custom task reads zero and holds the quest for an
 *   author port. Filter matches otherwise cycle live on every surface, so mapped filters
 *   carry no still icon.
 *
 * - An item task naming no item tests every stack as a match (`ItemTask.test` returns true for
 *   an empty template, in 2001 and 2101 alike), so FTB finishes it on the first stack carried.
 *   It is left out with a warning: Tenet completes what remains, and a quest left taskless
 *   completes when it unlocks, the same moment to within a tick.
 * - Filter expressions are checked against Tenet's whole vocabulary (`item`, `item_tag`,
 *   `mod`, `block` under `and`, `or`, `not`), not only `component`: any other function is
 *   one Tenet refuses at load, so the task becomes a placeholder naming it.
 * - Add-on task types read through their own mod's bytecode where Tenet has the same task:
 *   questsadditions `killnbt` (an empty `nbt` is a subset every mob passes, and `checkItem`
 *   off means any weapon) is a kill task, and `break` (`block_type` 0 a block, 1 a tag) with
 *   `checkItem` off is a break task. The rest stay placeholders, their own settings named.
 * - questsadditions' `secret` on a task hides it until done; Tenet shows every task, so it
 *   shows early, with a warning.
 *
 * Titles inline the canonical lang text (checkmark buttons require it); translations ride
 * the overlay beside them. Icons, toasts, tags, optionality and toast switches travel on
 * every type; task order is preserved exactly, because Tenet progress is index-keyed.
 */

import { componentsToJson, mapIcon } from "./icons";
import { LangPool } from "./lang";
import { Report } from "./report";
import { readTagItems, tenetStage } from "./tags";
import { SnbtNode, snbtGet, snbtToJson } from "./snbt";

export interface TaskContext {
  /** Lowercase id of the quest owning the task, for messages. */
  readonly questId: string;
  /** Chapter file path, for messages. */
  readonly chapter: string;
  readonly lang: LangPool;
  readonly report: Report;
}

const MAX_COUNT = 6400;
const OBSERVE_ORDER: ReadonlyArray<string> = [
  "block",
  "block_tag",
  "block_state",
  "block_entity",
  "block_entity_type",
  "entity_type",
  "entity_type_tag",
];
const OBSERVE_NAMES: ReadonlySet<string> = new Set(OBSERVE_ORDER);
const MATCH_WORDS: ReadonlySet<string> = new Set(["none", "fuzzy", "strict"]);
const SMART_FILTER = "ftbfiltersystem:smart_filter";
/** The functions Tenet's filter task evaluates (FilterParser.node); any other is refused. */
const TENET_FILTERS: ReadonlySet<string> = new Set(["and", "or", "not", "item", "item_tag", "mod", "block"]);
/** Keys every task may carry whatever its type: the rest of a custom type's keys are its own. */
const COMMON_TASK_KEYS: ReadonlySet<string> = new Set([
  "id",
  "type",
  "title",
  "icon",
  "tags",
  "disable_toast",
  "optional_task",
  "secret",
]);
const MISSING_ITEM = "ftbquests:missing_item";

/**
 * One FTB task into its Tenet JSON, or null when the task has no Tenet shape (reported as
 * manual work). Order is the caller's to keep: survivors stay in authored order.
 */
export function mapTask(node: SnbtNode, ctx: TaskContext): Record<string, unknown> | null {
  if (node.kind !== "compound") {
    return null;
  }
  const kind = stringField(node, "type");
  if (kind === null) {
    fail(ctx, node, "type", "a task names no type");
    return null;
  }
  switch (kind) {
    case "item":
      return mapItemTask(node, ctx);
    case "checkmark":
      return mapCheckmarkTask(node, ctx);
    case "xp":
      return mapXpTask(node, ctx);
    case "dimension":
      return mapDimensionTask(node, ctx);
    case "stat":
      return mapStatTask(node, ctx);
    case "kill":
      return mapKillTask(node, ctx);
    case "location":
      return mapLocationTask(node, ctx);
    case "advancement":
      return mapAdvancementTask(node, ctx);
    case "observation":
      return mapObservationTask(node, ctx);
    case "biome":
      return mapSimpleTargetTask(node, ctx, "biome");
    case "structure":
      return mapSimpleTargetTask(node, ctx, "structure");
    case "fluid":
      return mapFluidTask(node, ctx);
    case "forge_energy":
      return mapEnergyTask(node, ctx);
    case "gamestage":
      return mapStageTask(node, ctx);
    case "questsadditions:killnbt":
      return addonKill(node) ? mapKillTask(node, ctx) : mapCustomTask(node, ctx, kind);
    case "questsadditions:break": {
      const mapped = mapAddonBreak(node, ctx);
      return mapped === undefined ? mapCustomTask(node, ctx, kind) : mapped;
    }
    default:
      return mapCustomTask(node, ctx, kind);
  }
}

/**
 * A task no Tenet type covers (third-party `custom` types): a `tenet:custom`
 * placeholder keyed by the task's own id, so the quest waits for a handler instead
 * of completing free. Dropping it would silently finish quests whose only task it
 * was; a custom task with no handler reads zero progress and holds the quest, and
 * the validator names the missing handler as author work.
 */
function mapCustomTask(
  node: SnbtNode,
  ctx: TaskContext,
  kind: string,
): Record<string, unknown> | null {
  const out = placeholder(node, ctx, "migrator:task/");
  if (out === null) {
    return null;
  }
  const own = node.kind === "compound" ? node.entries.map(([key]) => key).filter((key) => !COMMON_TASK_KEYS.has(key)) : [];
  ctx.report.warn({
    code: "custom-task",
    message: `the ${kind} task of quest ${ctx.questId} has no Tenet task to become; it waits on a tenet:custom handler for ${out["id"]} as manual work${own.length > 0 ? ` (its own settings: ${own.join(", ")})` : ""}`,
    path: ctx.chapter,
    line: node.line,
    key: "type",
    value: kind,
  });
  return finishTask(node, ctx, out);
}

/**
 * The shared placeholder core: this task's hex id under a migrator namespace, count as
 * goal. A handler-less custom task reads zero progress and holds the quest; the exact
 * digits an id carries are what a KubeJS handler registers for.
 */
function placeholder(
  node: SnbtNode,
  ctx: TaskContext,
  namespace: string,
): Record<string, unknown> | null {
  const raw = snbtGet(node, "id");
  const taskHex = raw !== undefined && raw.kind === "string" ? raw.value.toLowerCase() : ctx.questId;
  const count = taskCount(node, ctx);
  if (count === null) {
    return null;
  }
  return {
    type: "tenet:custom",
    id: `${namespace}${taskHex}`,
    value: count,
  };
}

function mapItemTask(node: SnbtNode, ctx: TaskContext): Record<string, unknown> | null {
  const item = snbtGet(node, "item");
  if (item === undefined || (item.kind === "string" && item.value.length === 0)) {
    // FTB tests every stack against an empty template as a match, so the task finishes on the
    // first stack carried: nothing a player does differs once it is gone (see the header).
    ctx.report.warn({
      code: "empty-item-task",
      message: `an item task of quest ${ctx.questId} names no item, which FTB counts any stack toward; it is left out`,
      path: ctx.chapter,
      line: node.line,
      key: "item",
    });
    return null;
  }
  if (item.kind === "string") {
    // FTB's shorthand: a bare id names one of the item (`item: "minecraft:torch"`).
    const out: Record<string, unknown> = { type: "tenet:item", item: item.value };
    const count = taskCount(node, ctx);
    if (count === null) {
      return null;
    }
    if (count !== 1) {
      out["count"] = count;
    }
    if (!mapMatch(node, ctx, out)) {
      return null;
    }
    mapConsume(node, ctx, out, true);
    if (!mapCrafting(node, ctx, out, true)) {
      return null;
    }
    mapManual(node, ctx, out, true);
    return finishTask(node, ctx, out);
  }
  if (item.kind !== "compound") {
    fail(ctx, node, "item", "an item task names no item object");
    return null;
  }
  const itemId = stringField(item, "id");
  if (itemId !== null && itemId === SMART_FILTER) {
    return mapFilterTask(node, item, ctx);
  }
  const out: Record<string, unknown> = { type: "tenet:item" };
  const resolved = recoverItemId(item, ctx, node, "an item task");
  if (resolved === null) {
    return null;
  }
  out["item"] = resolved;
  const count = taskCount(node, ctx);
  if (count === null) {
    return null;
  }
  if (count !== 1) {
    out["count"] = count;
  }
  const components = snbtGet(item, "components");
  if (components !== undefined) {
    if (components.kind !== "compound") {
      fail(ctx, components, "components", "an item task carries components that are not an object");
      return null;
    }
    const droppedTop: Array<string> = [];
    out["components"] = componentsToJson(components, ctx.report, ctx.chapter, "an item task", (gone) => {
      droppedTop.push(...gone);
    });
    if (!mapMatch(node, ctx, out)) {
      return null;
    }
    if (droppedTop.length > 0) {
      // Strict is unachievable without the digits: no JSON number holds them, so a strict
      // template could never equal a carried stack and the quest would sit incompletable.
      // Fuzzy over the surviving components is the closest achievable reading — for a
      // definitionally-fixed value like infinite energy it decides exactly the same gates.
      // Fuzzy or none (FTB's default) stands as written; the drop itself is still reported.
      // Strict only ever arrives explicitly, so forcing always overrides the author.
      const forced = out["match"] !== "fuzzy" && out["match"] !== "none";
      if (forced) {
        out["match"] = "fuzzy";
      }
      ctx.report.warn({
        code: "huge-long-component",
        message: `an item task of quest ${ctx.questId} gates on integers JSON cannot hold exactly; ${droppedTop.join(", ")} goes without them${forced ? " and the task reads fuzzy so it can still match" : ""}${forced ? ", overriding an explicit strict" : ""}`,
        path: ctx.chapter,
        line: node.line,
        key: "components",
        value: droppedTop,
      });
    }
    mapConsume(node, ctx, out, true);
    if (!mapCrafting(node, ctx, out, true)) {
      return null;
    }
    mapManual(node, ctx, out, true);
    return finishTask(node, ctx, out);
  }
  if (!mapMatch(node, ctx, out)) {
    return null;
  }
  mapConsume(node, ctx, out, true);
  if (!mapCrafting(node, ctx, out, true)) {
    return null;
  }
  mapManual(node, ctx, out, true);
  return finishTask(node, ctx, out);
}

/**
 * questsadditions' killnbt is FTB's kill task with two more questions: `checkItem` (the
 * killer's weapon passes an item filter) and `nbt` (every key of it sits in the mob's
 * NBT, `TasksUtils.Compoundequals(task, mob)`). Unasked, both pass every kill.
 */
function addonKill(node: SnbtNode): boolean {
  const nbt = snbtGet(node, "nbt");
  return !flagSet(node, "checkItem") && (nbt === undefined || (nbt.kind === "compound" && nbt.entries.length === 0));
}

/**
 * questsadditions' break task, when it asks only which block: `block_type` 0 names a block
 * id, 1 a block tag (`BlockInteractionTask.checkBlock`); `checkItem` asks for the tool,
 * which tenet:break cannot. Undefined means the placeholder.
 */
function mapAddonBreak(node: SnbtNode, ctx: TaskContext): Record<string, unknown> | null | undefined {
  const block = stringField(node, "block");
  const type = snbtGet(node, "block_type");
  const whole = (n: SnbtNode | undefined, want: bigint): boolean =>
    n !== undefined && (n.kind === "int" || n.kind === "byte" || n.kind === "short" || n.kind === "long") && n.value === want;
  const tagged = whole(type, 1n);
  const plain = type === undefined || whole(type, 0n);
  if (block === null || flagSet(node, "checkItem") || (!tagged && !plain)) {
    return undefined;
  }
  const out: Record<string, unknown> = { type: "tenet:break" };
  out[tagged ? "blockTag" : "block"] = block.replace(/^#/, "");
  const raw = snbtGet(node, "value");
  const value = raw === undefined ? 1 : integerField(raw, "value", ctx);
  if (value === null) {
    return null;
  }
  if (value > 1000000) {
    ctx.report.warn({
      code: "clamped-count",
      message: `a break task of quest ${ctx.questId} asks for ${value}, over Tenet's cap of 1000000`,
      path: ctx.chapter,
      line: (raw ?? node).line,
      key: "value",
      value: 1000000,
    });
  }
  const clamped = Math.min(1000000, Math.max(1, value));
  if (clamped !== 1) {
    out["value"] = clamped;
  }
  return finishTask(node, ctx, out);
}

/** A flag that is set: true or 1b. */
function flagSet(node: SnbtNode, key: string): boolean {
  const child = snbtGet(node, key);
  return child !== undefined && ((child.kind === "boolean" && child.value) || (child.kind === "byte" && child.value === 1n));
}

function mapFilterTask(
  node: SnbtNode,
  item: SnbtNode,
  ctx: TaskContext,
): Record<string, unknown> | null {
  const expression = filterExpression(item, ctx, node);
  if (expression === null) {
    return null;
  }
  const refused = unanswerableFilter(expression);
  if (refused !== null) {
    return mapUnmappableFilter(node, expression, refused, ctx);
  }
  const out: Record<string, unknown> = { type: "tenet:filter" };
  out["filter"] = expression;
  const count = taskCount(node, ctx);
  if (count === null) {
    return null;
  }
  if (count !== 1) {
    out["count"] = count;
  }
  mapConsume(node, ctx, out, true);
  mapManual(node, ctx, out, true);
  const crafting = snbtGet(node, "only_from_crafting");
  const craftingOn =
    crafting !== undefined &&
    ((crafting.kind === "boolean" && crafting.value) ||
      (crafting.kind === "byte" && crafting.value === 1n));
  if (craftingOn) {
    ctx.report.warn({
      code: "unsupported-flag",
      message: `the filter task of quest ${ctx.questId} is crafting-only, which tenet:filter cannot say; it counts any source`,
      path: ctx.chapter,
      line: crafting.line,
      key: "only_from_crafting",
    });
  }
  // No still icon: the client cycles filter matches live at FTB's cadence on every
  // surface (rows, nodes, adoption, HUD), so a frozen first item would only disagree.
  return finishTask(node, ctx, out);
}

/**
 * A filter Tenet cannot evaluate (`component()` and friends answer about one stack, which
 * no quest progress can): a `tenet:custom` placeholder carrying the task's own id, so the
 * quest waits for a handler instead of completing free. Dropping it would silently finish
 * quests whose only task this was; a custom task with no handler reads zero progress and
 * holds the quest, and the validator names the missing handler as author work.
 */
function mapUnmappableFilter(
  node: SnbtNode,
  expression: string,
  refused: string,
  ctx: TaskContext,
): Record<string, unknown> | null {
  // The placeholder id names the filter kind for handlers to find; the expression rides
  // in the report beside it, since no Tenet field can carry it.
  const out = placeholder(node, ctx, "migrator:filter/");
  if (out === null) {
    return null;
  }
  ctx.report.warn({
    code: "unmappable-filter",
    message: `the filter task of quest ${ctx.questId} asks ${refused}(), which a quest cannot answer; it waits on a tenet:custom handler for ${out["id"]} as manual work`,
    path: ctx.chapter,
    line: node.line,
    key: "filter",
    value: expression.slice(0, 120),
  });
  return finishTask(node, ctx, out);
}

/** The first function in a filter expression Tenet's filter task refuses, or null when none. */
function unanswerableFilter(expression: string): string | null {
  for (const match of expression.matchAll(/([A-Za-z0-9_.:-]+)\s*\(/g)) {
    const full = match[1] as string;
    const name = full.slice(full.lastIndexOf(":") + 1);
    if (!TENET_FILTERS.has(name)) {
      return name;
    }
  }
  return null;
}

function filterExpression(item: SnbtNode, ctx: TaskContext, task: SnbtNode): string | null {
  const components = snbtGet(item, "components");
  const filter =
    components !== undefined && components.kind === "compound"
      ? snbtGet(components, "ftbfiltersystem:filter")
      : undefined;
  if (filter === undefined || filter.kind !== "string" || filter.value === "") {
    fail(ctx, task, "filter", "a filter task names no filter expression");
    return null;
  }
  return filter.value;
}

function mapCheckmarkTask(node: SnbtNode, ctx: TaskContext): Record<string, unknown> | null {
  const out: Record<string, unknown> = { type: "tenet:checkmark" };
  const title = taskTitle(node, ctx);
  if (title === null) {
    // Tenet draws a bare button for a title-less checkmark (FTB shows no sentence either),
    // so the quest converts and plays — but a button with no words is an author sentence
    // missing, and the report names each one as manual work.
    const id = snbtGet(node, "id");
    ctx.report.warn({
      code: "checkmark-without-title",
      message: `the checkmark task ${id !== undefined && id.kind === "string" ? id.value : "?"} of quest ${ctx.questId} has no title; it draws a bare button`,
      path: ctx.chapter,
      line: node.line,
      key: "title",
    });
  } else {
    out["title"] = title;
  }
  return finishTask(node, ctx, out);
}

function mapXpTask(node: SnbtNode, ctx: TaskContext): Record<string, unknown> | null {
  const out: Record<string, unknown> = { type: "tenet:xp" };
  const value = longField(node, "value", ctx);
  if (value === null) {
    return null;
  }
  out["value"] = value;
  // FTB absent reads levels; Tenet absent reads points: always explicit, never inherited.
  out["points"] = readBool(node, "points", false, ctx);
  return finishTask(node, ctx, out);
}

function mapDimensionTask(node: SnbtNode, ctx: TaskContext): Record<string, unknown> | null {
  const out: Record<string, unknown> = { type: "tenet:dimension" };
  const dimension = stringField(node, "dimension");
  if (dimension === null) {
    ctx.report.note({
      code: "location-no-dimension",
      message: `the dimension task of quest ${ctx.questId} names no dimension; it counts anywhere`,
      path: ctx.chapter,
      line: node.line,
      key: "dimension",
    });
  } else {
    out["dimension"] = dimension;
  }
  return finishTask(node, ctx, out);
}

function mapStatTask(node: SnbtNode, ctx: TaskContext): Record<string, unknown> | null {
  const out: Record<string, unknown> = { type: "tenet:stat" };
  const stat = stringField(node, "stat");
  if (stat === null) {
    fail(ctx, node, "stat", "a stat task names no statistic");
    return null;
  }
  out["stat"] = stat;
  const value = longField(node, "value", ctx);
  if (value === null) {
    return null;
  }
  out["value"] = value;
  return finishTask(node, ctx, out);
}

function mapKillTask(node: SnbtNode, ctx: TaskContext): Record<string, unknown> | null {
  const out: Record<string, unknown> = { type: "tenet:kill" };
  const entity = stringField(node, "entity");
  const tag = stringField(node, "entity_type_tag");
  if (entity === null && tag === null) {
    fail(ctx, node, "entity", "a kill task names neither an entity nor an entity tag");
    return null;
  }
  if (entity !== null) {
    out["entity"] = entity;
  }
  if (tag !== null) {
    out["entityTypeTag"] = tag;
  }
  const value = longField(node, "value", ctx);
  if (value === null) {
    return null;
  }
  out["value"] = value;
  const customName = stringField(node, "custom_name");
  if (customName !== null && customName !== "") {
    out["customName"] = customName;
  }
  const nbt = stringField(node, "nbt_filter");
  if (nbt !== null && nbt !== "") {
    out["nbtFilter"] = nbt;
  }
  return finishTask(node, ctx, out);
}

function mapLocationTask(node: SnbtNode, ctx: TaskContext): Record<string, unknown> | null {
  const out: Record<string, unknown> = { type: "tenet:location" };
  const dimension = stringField(node, "dimension");
  if (dimension === null) {
    ctx.report.note({
      code: "location-no-dimension",
      message: `the location task of quest ${ctx.questId} names no dimension; it counts anywhere`,
      path: ctx.chapter,
      line: node.line,
      key: "dimension",
    });
  } else {
    out["dimension"] = dimension;
  }
  if (readBool(node, "ignore_dimension", false, ctx)) {
    out["ignoreDimension"] = true;
  }
  const position = intTriple(node, "position", ctx);
  if (position === null) {
    return null;
  }
  out["position"] = position;
  const size = intTriple(node, "size", ctx);
  if (size === null) {
    return null;
  }
  out["size"] = size;
  return finishTask(node, ctx, out);
}

function mapAdvancementTask(node: SnbtNode, ctx: TaskContext): Record<string, unknown> | null {
  const out: Record<string, unknown> = { type: "tenet:advancement" };
  const advancement = stringField(node, "advancement");
  if (advancement === null) {
    fail(ctx, node, "advancement", "an advancement task names no advancement");
    return null;
  }
  out["advancement"] = advancement;
  const criterion = stringField(node, "criterion");
  if (criterion !== null && criterion !== "") {
    out["criterion"] = criterion;
  }
  return finishTask(node, ctx, out);
}

function mapObservationTask(node: SnbtNode, ctx: TaskContext): Record<string, unknown> | null {
  const out: Record<string, unknown> = { type: "tenet:observation" };
  const kind = snbtGet(node, "observe_type");
  let observe: string | null = null;
  if (kind !== undefined && (kind.kind === "int" || kind.kind === "long" || kind.kind === "byte" || kind.kind === "short")) {
    const ordinal = Number(kind.value);
    if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= OBSERVE_ORDER.length) {
      fail(ctx, kind, "observe_type", `observe_type ${ordinal} names no observation kind`);
      return null;
    }
    observe = OBSERVE_ORDER[ordinal] as string;
  } else {
    const named = stringField(node, "observation_type");
    if (named === null) {
      observe = "block";
    } else if (!OBSERVE_NAMES.has(named)) {
      fail(ctx, node, "observation_type", `observation_type ${JSON.stringify(named)} names no observation kind`);
      return null;
    } else {
      observe = named;
    }
  }
  out["observeType"] = observe;
  const target = stringField(node, "to_observe");
  if (target === null || target === "") {
    // FTB's ObservationTask.observe returns false on an empty to_observe (1.19 through 1.21),
    // so the task never completes and the quest stays held. A placeholder holds it the same way.
    const held = placeholder(node, ctx, "migrator:task/");
    if (held === null) {
      return null;
    }
    ctx.report.warn({
      code: "empty-observation",
      message: `an observation task of quest ${ctx.questId} names nothing to observe, so FTB never completed it; it waits on a tenet:custom handler for ${held["id"]}, holding the quest as FTB did`,
      path: ctx.chapter,
      line: node.line,
      key: "to_observe",
    });
    return finishTask(node, ctx, held);
  }
  out["toObserve"] = target;
  const timer = snbtGet(node, "timer");
  const ticks = timer === undefined ? 0 : integerField(timer, "timer", ctx);
  if (ticks === null) {
    return null;
  }
  if (ticks < 0 || ticks > 1200) {
    fail(ctx, timer ?? node, "timer", `timer ${ticks} stands outside Tenet's 0–1200 ticks`);
    return null;
  }
  out["timer"] = ticks;
  return finishTask(node, ctx, out);
}

function mapSimpleTargetTask(
  node: SnbtNode,
  ctx: TaskContext,
  kind: "biome" | "structure",
): Record<string, unknown> | null {
  const out: Record<string, unknown> = { type: `tenet:${kind}` };
  const target = stringField(node, kind);
  if (target === null) {
    fail(ctx, node, kind, `a ${kind} task names no ${kind}`);
    return null;
  }
  out[kind] = target;
  return finishTask(node, ctx, out);
}

function mapFluidTask(node: SnbtNode, ctx: TaskContext): Record<string, unknown> | null {
  const out: Record<string, unknown> = { type: "tenet:fluid" };
  const stack = snbtGet(node, "fluid");
  let fluid = stringField(node, "fluid");
  let stackAmount: number | null = null;
  if (fluid === null && stack !== undefined && stack.kind === "compound") {
    // Newer packs write the fluid as a stack object ({id, amount}) rather than a bare
    // id string beside a top-level amount: the id reads the same either way.
    const stacked = snbtGet(stack, "id");
    if (stacked !== undefined && stacked.kind === "string" && stacked.value !== "") {
      fluid = stacked.value;
    }
    const stackedAmount = snbtGet(stack, "amount");
    if (stackedAmount !== undefined) {
      const parsed = integerField(stackedAmount, "amount", ctx);
      if (parsed === null) {
        return null;
      }
      stackAmount = parsed;
    }
  }
  if (fluid === null) {
    fail(ctx, node, "fluid", "a fluid task names no fluid");
    return null;
  }
  out["fluid"] = fluid;
  if (snbtGet(node, "amount") !== undefined) {
    const amount = longField(node, "amount", ctx);
    if (amount === null) {
      return null;
    }
    out["amount"] = amount;
  } else if (stackAmount !== null) {
    // The stack carries the only amount stated: it is the task's amount, named aloud.
    ctx.report.note({
      code: "fluid-stack-amount",
      message: `a ${ctx.questId} task sets no amount; the fluid stack's ${stackAmount} carries it`,
      path: ctx.chapter,
      line: node.line,
      key: "amount",
      value: stackAmount,
    });
    out["amount"] = stackAmount;
  } else {
    fail(ctx, node, "amount", `a ${ctx.questId} task names no amount`);
    return null;
  }
  mapManual(node, ctx, out, true);
  return finishTask(node, ctx, out);
}

function mapEnergyTask(node: SnbtNode, ctx: TaskContext): Record<string, unknown> | null {
  const out: Record<string, unknown> = { type: "tenet:energy" };
  const value = longField(node, "value", ctx);
  if (value === null) {
    return null;
  }
  out["value"] = value;
  // Absent reads unlimited here, which is FTB's migrated reading too: only a set cap travels.
  const cap = snbtGet(node, "max_input");
  if (cap !== undefined) {
    const max = integerField(cap, "max_input", ctx);
    if (max === null) {
      return null;
    }
    if (max !== 0) {
      out["maxInput"] = max;
    }
  }
  mapManual(node, ctx, out, true);
  return finishTask(node, ctx, out);
}

function mapStageTask(node: SnbtNode, ctx: TaskContext): Record<string, unknown> | null {
  const out: Record<string, unknown> = { type: "tenet:stage" };
  const stage = stringField(node, "stage");
  if (stage === null) {
    fail(ctx, node, "stage", "a stage task names no stage");
    return null;
  }
  const spelled = tenetStage(stage);
  if (spelled === null) {
    fail(ctx, node, "stage", `a stage task of quest ${ctx.questId} names the stage ${JSON.stringify(stage)}, which has nothing an id can keep`);
    return null;
  }
  if (spelled !== stage) {
    ctx.report.warn({
      code: "renamed-stage",
      message: `a stage task of quest ${ctx.questId} names the stage ${JSON.stringify(stage)}; Tenet stages are ids, so it reads ${JSON.stringify(spelled)} (scripts granting or checking the old name must follow)`,
      path: ctx.chapter,
      line: node.line,
      key: "stage",
      value: spelled,
    });
  }
  out["stage"] = spelled;
  if (readBool(node, "team_stage", false, ctx)) {
    out["teamStage"] = true;
  }
  return finishTask(node, ctx, out);
}

function finishTask(
  node: SnbtNode,
  ctx: TaskContext,
  out: Record<string, unknown>,
): Record<string, unknown> | null {
  const inline = taskTitle(node, ctx);
  if (inline !== null) {
    out["title"] = inline;
  }
  const icon = mapIcon(snbtGet(node, "icon"), ctx.report, ctx.chapter, `a task of quest ${ctx.questId}'s icon`);
  if (icon !== null) {
    out["icon"] = icon;
  }
  if (readBool(node, "disable_toast", false, ctx)) {
    out["disableToast"] = true;
  }
  const tags = readTags(node, ctx);
  if (tags === null) {
    return null;
  }
  if (tags.length > 0) {
    out["tags"] = tags;
  }
  if (readBool(node, "optional_task", false, ctx)) {
    out["optional"] = true;
  }
  if (readBool(node, "secret", false, ctx)) {
    ctx.report.warn({
      code: "secret-task",
      message: `a task of quest ${ctx.questId} is secret (questsadditions), hidden until done; Tenet shows every task, so it shows from the start`,
      path: ctx.chapter,
      line: (snbtGet(node, "secret") ?? node).line,
      key: "secret",
    });
  }
  return out;
}

function taskTitle(node: SnbtNode, ctx: TaskContext): string | null {
  const id = snbtGet(node, "id");
  const raw = id !== undefined && id.kind === "string" ? id.value : null;
  const title = raw === null ? null : ctx.lang.taskTitle(raw);
  if (title === null) {
    return null;
  }
  if (title.trim().length === 0) {
    ctx.report.warn({
      code: "blank-text",
      message: `the task ${raw ?? "?"} of quest ${ctx.questId} is titled blank`,
      path: ctx.chapter,
      line: node.line,
      key: "title",
    });
  }
  return title;
}

function taskCount(node: SnbtNode, ctx: TaskContext): number | null {
  // The goal lives on the task (`count`, floor 1 like FTB reads it); the stack's own count
  // is display size — FTB's own writer pins it at 1 — and never the goal.
  const count = snbtGet(node, "count");
  if (count === undefined) {
    return 1;
  }
  const value = integerField(count, "count", ctx);
  if (value === null) {
    return null;
  }
  const floored = Math.max(1, value);
  if (floored > MAX_COUNT) {
    ctx.report.warn({
      code: "clamped-count",
      message: `a task of quest ${ctx.questId} asks for ${floored}, over Tenet's cap of ${MAX_COUNT}`,
      path: ctx.chapter,
      line: count.line,
      key: "count",
      value: floored,
    });
    return MAX_COUNT;
  }
  return floored;
}

function mapMatch(node: SnbtNode, ctx: TaskContext, out: Record<string, unknown>): boolean {
  const match = snbtGet(node, "match_components");
  if (match === undefined) {
    const legacy = legacyMatch(node, ctx);
    if (legacy === null) {
      return false;
    }
    if (legacy !== "strict") {
      out["match"] = legacy;
    }
    return true;
  }
  if (match.kind !== "string" || !MATCH_WORDS.has(match.value)) {
    fail(ctx, match.kind === "string" ? match : node, "match_components", "match_components names no match mode");
    return false;
  }
  if (match.value !== "strict") {
    out["match"] = match.value;
  }
  return true;
}

/** A task without `match_components`: the 1.19/1.20 flags, or FTB's item-only default. */
function legacyMatch(node: SnbtNode, ctx: TaskContext): string | null {
  const matchNbt = snbtGet(node, "match_nbt");
  if (matchNbt === undefined) {
    return "none";
  }
  const on = flagValue(matchNbt);
  if (on === null) {
    fail(ctx, matchNbt, "match_nbt", "match_nbt is not true or false");
    return null;
  }
  if (!on) {
    return "none";
  }
  const weak = snbtGet(node, "weak_nbt_match");
  if (weak === undefined) {
    return "strict";
  }
  const partial = flagValue(weak);
  if (partial === null) {
    fail(ctx, weak, "weak_nbt_match", "weak_nbt_match is not true or false");
    return null;
  }
  return partial ? "fuzzy" : "strict";
}

/** FTB writes flags as true/false and as 1b/0b; anything else is null. */
function flagValue(node: SnbtNode): boolean | null {
  if (node.kind === "boolean") {
    return node.value;
  }
  if (node.kind === "byte" && (node.value === 0n || node.value === 1n)) {
    return node.value === 1n;
  }
  return null;
}

function mapConsume(
  node: SnbtNode,
  ctx: TaskContext,
  out: Record<string, unknown>,
  supported: boolean,
): void {
  const consume = snbtGet(node, "consume_items");
  if (consume === undefined) {
    return;
  }
  // FTB writes flags as true/false and as 1b/0b; anything else is malformed.
  if (
    consume.kind !== "boolean" &&
    !(consume.kind === "byte" && (consume.value === 0n || consume.value === 1n))
  ) {
    fail(ctx, consume, "consume_items", "consume_items is not true or false");
    return;
  }
  const value = consume.kind === "boolean" ? consume.value : consume.value === 1n;
  if (!supported) {
    if (!value) {
      return;
    }
    ctx.report.warn({
      code: "unsupported-flag",
      message: `a task of quest ${ctx.questId} sets consume_items, which its Tenet type cannot say`,
      path: ctx.chapter,
      line: consume.line,
      key: "consume_items",
    });
    return;
  }
  out["consumeItems"] = value;
}

function mapCrafting(
  node: SnbtNode,
  ctx: TaskContext,
  out: Record<string, unknown>,
  supported: boolean,
): boolean {
  const crafting = snbtGet(node, "only_from_crafting");
  if (crafting === undefined) {
    return true;
  }
  // FTB writes flags as true/false and as 1b/0b; anything else is malformed.
  if (
    crafting.kind !== "boolean" &&
    !(crafting.kind === "byte" && (crafting.value === 0n || crafting.value === 1n))
  ) {
    fail(ctx, crafting, "only_from_crafting", "only_from_crafting is not true or false");
    return false;
  }
  const value = crafting.kind === "boolean" ? crafting.value : crafting.value === 1n;
  if (value && !supported) {
    ctx.report.warn({
      code: "unsupported-flag",
      message: `a task of quest ${ctx.questId} is crafting-only, which its Tenet type cannot say; it counts any source`,
      path: ctx.chapter,
      line: crafting.line,
      key: "only_from_crafting",
    });
    return true;
  }
  if (value) {
    out["onlyFromCrafting"] = true;
  }
  return true;
}

function mapManual(node: SnbtNode, ctx: TaskContext, out: Record<string, unknown>, supported: boolean): void {
  const manual = snbtGet(node, "task_screen_only");
  if (manual === undefined) {
    return;
  }
  // FTB writes flags as true/false and as 1b/0b; anything else is malformed.
  if (
    manual.kind !== "boolean" &&
    !(manual.kind === "byte" && (manual.value === 0n || manual.value === 1n))
  ) {
    fail(ctx, manual, "task_screen_only", "task_screen_only is not true or false");
    return;
  }
  const value = manual.kind === "boolean" ? manual.value : manual.value === 1n;
  if (value && !supported) {
    ctx.report.warn({
      code: "unsupported-flag",
      message: `a task of quest ${ctx.questId} is manual-only, which its Tenet type cannot say`,
      path: ctx.chapter,
      line: manual.line,
      key: "task_screen_only",
    });
    return;
  }
  if (value) {
    out["manualOnly"] = true;
  }
}

function recoverItemId(item: SnbtNode, ctx: TaskContext, task: SnbtNode, what: string): string | null {
  const id = snbtGet(item, "id");
  if (id === undefined || id.kind !== "string" || id.value.length === 0) {
    fail(ctx, task, "item", `${what} names no item`);
    return null;
  }
  if (id.value === MISSING_ITEM) {
    const components = snbtGet(item, "components");
    const inner =
      components !== undefined && components.kind === "compound" ? snbtGet(components, MISSING_ITEM) : undefined;
    if (inner !== undefined && inner.kind === "string") {
      ctx.report.note({
        code: "recovered-item",
        message: `${what} was FTB's missing_item tombstone; the item it stood for (${inner.value}) is used instead`,
        path: ctx.chapter,
        line: id.line,
        key: "item",
        value: inner.value,
      });
      return inner.value;
    }
    fail(ctx, task, "item", `${what} is FTB's missing_item tombstone with no id recorded in it`);
    return null;
  }
  return id.value;
}

function readTags(node: SnbtNode, ctx: TaskContext): ReadonlyArray<string> | null {
  const tags = snbtGet(node, "tags");
  if (tags === undefined) {
    return [];
  }
  if (tags.kind !== "list") {
    fail(ctx, tags, "tags", "tags is not a list");
    return null;
  }
  return readTagItems(tags.items, ctx.report, ctx.chapter, `a task of quest ${ctx.questId}`);
}

function intTriple(node: SnbtNode, key: string, ctx: TaskContext): ReadonlyArray<number> | null {
  const list = snbtGet(node, key);
  if (list === undefined || list.kind !== "list") {
    fail(ctx, list ?? node, key, `a location task names no ${key} box`);
    return null;
  }
  if (list.items.length !== 3) {
    fail(ctx, list, key, `${key} is not three numbers`);
    return null;
  }
  const out: Array<number> = [];
  for (const item of list.items) {
    const value = integerField(item, key, ctx);
    if (value === null) {
      return null;
    }
    out.push(value);
  }
  return out;
}

function longField(node: SnbtNode, key: string, ctx: TaskContext): number | null {
  const child = snbtGet(node, key);
  if (child === undefined) {
    fail(ctx, node, key, `a ${ctx.questId} task names no ${key}`);
    return null;
  }
  return integerField(child, key, ctx);
}

function integerField(node: SnbtNode, key: string, ctx: TaskContext): number | null {
  const value =
    node.kind === "byte" || node.kind === "short" || node.kind === "int" || node.kind === "long"
      ? Number(node.value)
      : node.kind === "float" || node.kind === "double"
        ? Math.floor(node.value)
        : null;
  if (value === null || !Number.isFinite(value)) {
    fail(ctx, node, key, `${key} is not a number`);
    return null;
  }
  return value;
}

function stringField(node: SnbtNode, key: string): string | null {
  const child = snbtGet(node, key);
  return child !== undefined && child.kind === "string" && child.value !== "" ? child.value : null;
}

function readBool(node: SnbtNode, key: string, fallback: boolean, ctx: TaskContext): boolean {
  const child = snbtGet(node, key);
  if (child === undefined) {
    return fallback;
  }
  // FTB writes flags as true/false and as 1b/0b; anything else is malformed.
  if (child.kind === "boolean") {
    return child.value;
  }
  if (child.kind === "byte" && (child.value === 0n || child.value === 1n)) {
    return child.value === 1n;
  }
  fail(ctx, child, key, `${key} is not true or false`);
  return fallback;
}

function fail(ctx: TaskContext, node: SnbtNode, key: string, message: string): void {
  ctx.report.error({ code: "malformed-task", message, path: ctx.chapter, line: node.line, key });
}
