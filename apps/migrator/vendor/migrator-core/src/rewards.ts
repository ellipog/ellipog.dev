/**
 * Rewards: every FTB payout into its Tenet shape, plus the tables they roll.
 *
 * <h2>What maps 1:1, and what does not</h2>
 *
 * Item, xp, xp-levels, advancement, command, toast, stage, currency and the four table
 * modes (`random`, `loot`, `choice`, `all_table`) all have Tenet homes with the same words:
 * `team_reward` becomes `team`, `auto` keeps its five words, `exclude_from_claim_all` and
 * `ignore_reward_blocking` rename to camelCase. Grant counts follow FTB's own fallback —
 * `ItemReward.readData` reads the reward-level `count`, falling back to the stack's own
 * count when it is absent or zero — and `random_bonus` rolls on top as its own field on
 * both sides, never folded in.
 *
 * `custom` rewards have no Tenet reward to become: skipped and reported as manual work.
 * `loot_crate` sub-objects report the same way while their entries still load — the crate,
 * its opener and its drops are manual work, the loot itself converts.
 *
 * <h2>Commands</h2>
 *
 * `/ftbquests` verbs rewrite to `/tenet` spellings with quest ids remapped to lowercase;
 * any 16-hex token in a rewritten command remaps too, and a hex token naming nothing warns
 * and stays verbatim (FTB would fail it at runtime as well). Other mods' commands pass
 * through untouched — they run where those mods exist, on both sides. One leading `/` is
 * stripped: Tenet's dispatcher tolerates it, the docs write without, so the file does too.
 */

import { IdMap, remapTableId } from "./ids";
import { componentsToJson, mapIcon } from "./icons";
import { LangPool } from "./lang";
import { Report } from "./report";
import { readTagItems, tenetStage } from "./tags";
import { SnbtNode, snbtGet, snbtToJson } from "./snbt";
import { rewriteCommand } from "./commands";
import { SlugMaps } from "./slugs";

export interface RewardContext {
  readonly questId: string;
  readonly chapter: string;
  readonly lang: LangPool;
  readonly ids: IdMap;
  readonly slugs: SlugMaps;
  readonly report: Report;
}

const MAX_COUNT = 6400;
const AUTO_WORDS: ReadonlySet<string> = new Set([
  "default",
  "disabled",
  "enabled",
  "no_toast",
  "invisible",
]);

/**
 * One FTB reward into its Tenet JSON, or null when it has no Tenet shape (reported as
 * manual work). Order is the caller's to keep.
 */
export function mapReward(node: SnbtNode, ctx: RewardContext): Record<string, unknown> | null {
  if (node.kind !== "compound") {
    return null;
  }
  const kind = rewardKind(node);
  if (kind === null) {
    fail(ctx, node, "type", "a reward names no type");
    return null;
  }
  switch (kind) {
    case "item":
      return mapItemReward(node, ctx);
    case "xp":
      return mapXpReward(node, ctx, false);
    case "xp_levels":
      return mapXpReward(node, ctx, true);
    case "advancement":
      return mapAdvancementReward(node, ctx);
    case "command":
      return mapCommandReward(node, ctx);
    case "toast":
      return mapToastReward(node, ctx);
    case "gamestage":
      return mapStageReward(node, ctx);
    case "currency":
      return mapCurrencyReward(node, ctx);
    case "random":
    case "loot":
    case "choice":
    case "all_table":
      return mapTableReward(node, ctx, kind);
    default:
      ctx.report.warn({
        code: "custom-reward",
        message: `the ${kind} reward of quest ${ctx.questId} has no Tenet reward to become; it is left out as manual work`,
        path: ctx.chapter,
        line: node.line,
        key: "type",
        value: kind,
      });
      return null;
  }
}

function rewardKind(node: SnbtNode): string | null {
  const type = snbtGet(node, "type");
  if (type === undefined || type.kind !== "string" || type.value === "") {
    return null;
  }
  return type.value;
}

function mapItemReward(node: SnbtNode, ctx: RewardContext): Record<string, unknown> | null {
  const item = snbtGet(node, "item");
  if (item !== undefined && item.kind === "string") {
    // FTB's shorthand: a bare id grants one of the item (`item: "minecraft:torch"`).
    // An empty string grants nothing, like an absent stack below.
    if (item.value.length !== 0) {
      const out: Record<string, unknown> = { type: "tenet:item", item: item.value };
      const grant = grantCount(node, 0, ctx);
      if (grant === null) {
        return null;
      }
      if (grant !== 1) {
        out["count"] = grant;
      }
      if (readBool(node, "only_one", false, ctx)) {
        out["onlyOne"] = true;
      }
      return out;
    }
  }
  if (item === undefined || item.kind !== "compound") {
    // An item reward with no stack grants nothing in FTB (empty hands stay empty), so
    // there is nothing to carry: it drops with a note naming the count it orphaned, if
    // any. A guess at the intended item would be exactly that — a guess — so the run
    // keeps going and the author reads the note. A present-but-malformed count rides
    // along unjudged: with no item it means nothing here or in FTB.
    const count = snbtGet(node, "count");
    const orphaned =
      count !== undefined &&
      (count.kind === "byte" || count.kind === "short" || count.kind === "int" || count.kind === "long")
        ? ` (count ${count.value} with nothing to count)`
        : "";
    ctx.report.note({
      code: "empty-item-reward",
      message: `an item reward of the quest ${ctx.questId} names no item object${orphaned}; it grants nothing here or in FTB`,
      path: ctx.chapter,
      line: node.line,
      key: "item",
    });
    return null;
  }
  const ref = mapItemStack(item, ctx, `a reward of quest ${ctx.questId}`);
  if (ref === null) {
    return null;
  }
  const out: Record<string, unknown> = { type: "tenet:item", item: ref.item };
  if (ref.components !== undefined) {
    out["components"] = ref.components;
  }
  // FTB's own fallback: the reward-level count, else the stack's own count, else one.
  const grant = grantCount(node, ref.stackCount, ctx);
  if (grant === null) {
    return null;
  }
  if (grant !== 1) {
    out["count"] = grant;
  }
  const bonus = snbtGet(node, "random_bonus");
  if (bonus !== undefined) {
    const value = integerField(bonus, ctx, "random_bonus");
    if (value === null) {
      return null;
    }
    if (value < 0 || value > MAX_COUNT) {
      fail(ctx, bonus, "random_bonus", `random bonus ${value} stands outside 0–${MAX_COUNT}`);
      return null;
    }
    if (value !== 0) {
      out["randomBonus"] = value;
    }
  }
  if (readBool(node, "only_one", false, ctx)) {
    out["onlyOne"] = true;
  }
  return finishReward(node, ctx, out);
}

function mapXpReward(
  node: SnbtNode,
  ctx: RewardContext,
  levels: boolean,
): Record<string, unknown> | null {
  const out: Record<string, unknown> = { type: "tenet:xp" };
  const key = levels ? "xp_levels" : "xp";
  const amount = snbtGet(node, key);
  if (amount === undefined) {
    fail(ctx, node, key, `an xp reward names no ${key}`);
    return null;
  }
  const raw = integerField(amount, ctx, key);
  if (raw === null) {
    return null;
  }
  const value = xpAmount(raw, amount, key, ctx);
  if (value === null) {
    return null;
  }
  out["amount"] = value;
  if (levels) {
    out["levels"] = true;
  }
  return finishReward(node, ctx, out);
}

function mapAdvancementReward(node: SnbtNode, ctx: RewardContext): Record<string, unknown> | null {
  const out: Record<string, unknown> = { type: "tenet:advancement" };
  const advancement = stringField(node, "advancement");
  if (advancement === null) {
    fail(ctx, node, "advancement", "an advancement reward names no advancement");
    return null;
  }
  out["advancement"] = advancement;
  const criterion = stringField(node, "criterion");
  if (criterion !== null && criterion !== "") {
    out["criterion"] = criterion;
  }
  return finishReward(node, ctx, out);
}

function mapCommandReward(node: SnbtNode, ctx: RewardContext): Record<string, unknown> | null {
  const out: Record<string, unknown> = { type: "tenet:command" };
  const command = stringField(node, "command");
  if (command === null || command === "") {
    // FTB runs the empty command, which does nothing: a placeholder row, left out.
    return emptyReward(node, ctx, "command", `a command reward of quest ${ctx.questId} names no command, which runs nothing in FTB either; it is left out`);
  }
  out["command"] = rewriteCommand(command, ctx.ids, ctx.slugs, ctx.report, ctx.chapter, node.line, `a command of quest ${ctx.questId}`);
  // FTB 1.20 and 1.21 run every reward command from the collecting player's own source
  // (the jar never reads `player_command`), exactly as Tenet does, so there is nothing to
  // say — except to a book written for FTB 1.19, whose `player_command: false` ran from
  // the console. That one names whose hands changed, because a console ponder and a
  // player ponder open for different people.
  if (snbtGet(node, "player_command") !== undefined && !readBool(node, "player_command", false, ctx)) {
    ctx.report.note({
      code: "player-command-console",
      message: `a command reward of quest ${ctx.questId} says player_command: false, which ran from the console in FTB 1.19; FTB 1.21 and Tenet run it as the collecting player`,
      path: ctx.chapter,
      line: node.line,
      key: "player_command",
    });
  }
  // FTB reads the 1.20-era `elevate_perms` first: true runs at level 2 (Tenet's default,
  // so nothing to write) and the newer field is never consulted.
  const elevated = readBool(node, "elevate_perms", false, ctx);
  const level = elevated ? undefined : snbtGet(node, "permission_level");
  if (level !== undefined) {
    const value = integerField(level, ctx, "permission_level");
    if (value === null) {
      return null;
    }
    if (value < 0 || value > 4) {
      fail(ctx, level, "permission_level", `permission level ${value} stands outside 0–4`);
      return null;
    }
    if (value !== 2) {
      out["permissionLevel"] = value;
    }
  }
  if (readBool(node, "silent", false, ctx)) {
    out["silent"] = true;
  }
  const feedback = stringField(node, "feedback_message");
  if (feedback !== null && feedback !== "") {
    out["feedbackMessage"] = feedback;
  }
  return finishReward(node, ctx, out);
}

function mapToastReward(node: SnbtNode, ctx: RewardContext): Record<string, unknown> | null {
  const out: Record<string, unknown> = { type: "tenet:toast" };
  const description = stringField(node, "description");
  if (description !== null && description !== "") {
    out["description"] = description;
  }
  return finishReward(node, ctx, out);
}

function mapStageReward(node: SnbtNode, ctx: RewardContext): Record<string, unknown> | null {
  const out: Record<string, unknown> = { type: "tenet:stage" };
  const stage = stringField(node, "stage");
  if (stage === null) {
    // FTB grants the empty stage name, which nothing ever checks: the reward does nothing
    // there (packs use it as a titled placeholder row), so it is left out, not failed.
    ctx.report.warn({
      code: "empty-reward",
      message: `a stage reward of quest ${ctx.questId} names no stage, which grants nothing in FTB either; it is left out`,
      path: ctx.chapter,
      line: node.line,
      key: "stage",
    });
    return null;
  }
  const spelled = tenetStage(stage);
  if (spelled === null) {
    fail(ctx, node, "stage", `a stage reward of quest ${ctx.questId} names the stage ${JSON.stringify(stage)}, which has nothing an id can keep`);
    return null;
  }
  if (spelled !== stage) {
    ctx.report.warn({
      code: "renamed-stage",
      message: `a stage reward of quest ${ctx.questId} names the stage ${JSON.stringify(stage)}; Tenet stages are ids, so it reads ${JSON.stringify(spelled)} (scripts granting or checking the old name must follow)`,
      path: ctx.chapter,
      line: node.line,
      key: "stage",
      value: spelled,
    });
  }
  out["stage"] = spelled;
  if (readBool(node, "remove", false, ctx)) {
    out["remove"] = true;
  }
  if (readBool(node, "team_stage", false, ctx)) {
    out["teamStage"] = true;
  }
  const silent = snbtGet(node, "silent");
  if (silent !== undefined) {
    // Not compiled into FTB 1.21.1 either: a leftover key with no reader on either side.
    ctx.report.note({
      code: "no-op-field",
      message: `a stage reward of quest ${ctx.questId} sets silent, which neither side reads`,
      path: ctx.chapter,
      line: silent.line,
      key: "silent",
    });
  }
  return finishReward(node, ctx, out);
}

function mapCurrencyReward(node: SnbtNode, ctx: RewardContext): Record<string, unknown> | null {
  const out: Record<string, unknown> = { type: "tenet:currency" };
  const amount = snbtGet(node, "amount");
  if (amount === undefined) {
    fail(ctx, node, "amount", "a currency reward names no amount");
    return null;
  }
  const value = integerField(amount, ctx, "amount");
  if (value === null) {
    return null;
  }
  if (value < 1 || value > 1000000) {
    fail(ctx, amount, "amount", `amount ${value} stands outside 1–1000000`);
    return null;
  }
  out["amount"] = value;
  return finishReward(node, ctx, out);
}

function mapTableReward(
  node: SnbtNode,
  ctx: RewardContext,
  kind: string,
): Record<string, unknown> | null {
  const out: Record<string, unknown> = {
    type:
      kind === "all_table"
        ? "tenet:all_table"
        : kind === "choice"
          ? "tenet:choice"
          : kind === "loot"
            ? "tenet:loot"
            : "tenet:random",
  };
  const table = snbtGet(node, "table_id");
  const inline = snbtGet(node, "table_data");
  if (table !== undefined && inline !== undefined) {
    fail(ctx, node, "table_id", "a table reward names both a table and inline data");
    return null;
  }
  if (table !== undefined) {
    const numeric = tableIdNumber(table);
    if (numeric === null) {
      fail(ctx, table, "table_id", "a table reward names a table_id that is not a number");
      return null;
    }
    const name = remapTableId(numeric);
    if (!ctx.ids.tables.has(name)) {
      fail(
        ctx,
        table,
        "table_id",
        `a reward of quest ${ctx.questId} names table_id ${numeric} (table ${name}), which matches no reward-table file`,
      );
      return null;
    }
    out["table"] = ctx.slugs.tables.get(name) ?? name;
  } else if (inline !== undefined) {
    if (inline.kind !== "compound") {
      fail(ctx, inline, "table_data", "inline table data is not an object");
      return null;
    }
    const tableJson = mapTableBody(inline, ctx);
    if (tableJson === null) {
      return null;
    }
    out["inline"] = tableJson;
  } else {
    // FTB rolls nothing from a table it cannot find: a placeholder row, left out.
    return emptyReward(node, ctx, "table_id", `a ${kind} reward of quest ${ctx.questId} names no table, which rolls nothing in FTB either; it is left out`);
  }
  return finishReward(node, ctx, out);
}

export interface TableFile {
  readonly name: string;
  readonly json: Record<string, unknown>;
}

/**
 * One reward-table file into its Tenet JSON, or null when it cannot convert. Entries keep
 * their weights (relative on both sides; omitted reads 100.0 in FTB and 1.0 here, same
 * shares) while grant counts follow the stack rules rewards use.
 */
export function mapTableFile(
  name: string,
  root: SnbtNode,
  ctx: RewardContext,
): TableFile | null {
  if (root.kind !== "compound") {
    return null;
  }
  const body = mapTableBody(root, ctx);
  if (body === null) {
    return null;
  }
  const title = ctx.lang.tableTitle(ctxTitleSource(root));
  if (title !== null && title !== "") {
    body["title"] = title;
  }
  const icon = snbtGet(root, "icon");
  if (icon !== undefined) {
    const mapped = mapIcon(icon, ctx.report, ctx.chapter, "a reward table's icon");
    if (mapped === null) {
      return null;
    }
    if ("item" in mapped) {
      body["icon"] = mapped;
    } else {
      ctx.report.warn({
        code: "icon-table-custom",
        message:
          "a reward table wears a custom picture, which a table row cannot draw; it keeps its entries' pictures",
        path: ctx.chapter,
        line: icon.line,
        key: "icon",
      });
    }
  }
  return { name, json: body };
}

function ctxTitleSource(root: SnbtNode): string {
  const id = snbtGet(root, "id");
  return id !== undefined && id.kind === "string" ? id.value : "";
}

function mapTableBody(root: SnbtNode, ctx: RewardContext): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  const size = snbtGet(root, "loot_size");
  if (size !== undefined) {
    const read = integerField(size, ctx, "loot_size");
    if (read === null) {
      return null;
    }
    let value = read;
    if (value < 1 || value > 1000) {
      // FTB rolls whatever the editor saved; Tenet rolls 1–1000, so the size clamps there.
      const clamped = Math.min(1000, Math.max(1, value));
      ctx.report.warn({
        code: "clamped-loot-size",
        message: `a table rolls ${value} times; Tenet rolls 1–1000, so it rolls ${clamped}`,
        path: ctx.chapter,
        line: size.line,
        key: "loot_size",
        value,
      });
      value = clamped;
    }
    if (value !== 1) {
      out["lootSize"] = value;
    }
  }
  const empty = snbtGet(root, "empty_weight");
  if (empty !== undefined) {
    const value = decimalField(empty, ctx, "empty_weight");
    if (value === null) {
      return null;
    }
    if (value < 0) {
      fail(ctx, empty, "empty_weight", "empty weight below zero means nothing");
      return null;
    }
    if (value !== 0) {
      out["emptyWeight"] = value;
    }
  }
  if (readBool(root, "use_title", false, ctx)) {
    out["useTitle"] = true;
  }
  if (readBool(root, "hide_tooltip", false, ctx)) {
    out["hideTooltip"] = true;
  }
  const crate = snbtGet(root, "loot_crate");
  if (crate !== undefined) {
    ctx.report.warn({
      code: "loot-crate",
      message:
        "a reward table carries a loot crate; the entries convert, the crate, its opener and its drops are manual work",
      path: ctx.chapter,
      line: crate.line,
      key: "loot_crate",
      value: snbtToJson(crate),
    });
  }
  const rewards = snbtGet(root, "rewards");
  if (rewards === undefined || rewards.kind !== "list") {
    fail(ctx, root, "rewards", "a reward table lists no rewards");
    return null;
  }
  const entries: Array<unknown> = [];
  let blankWeight = 0;
  for (const item of rewards.items) {
    if (isBlankEntry(item)) {
      // An entry with no reward payload grants nothing when rolled: its weight folds
      // into the table's empty mass rather than failing the table (or shifting the
      // odds by vanishing). Named per entry: a synthesis, never silent.
      const weight = blankEntryWeight(item, ctx);
      if (weight === null) {
        return null;
      }
      blankWeight += weight;
      ctx.report.note({
        code: "blank-table-entry",
        message: `a table entry names no reward; its ${weight} weight rolls empty with the table's empty mass`,
        path: ctx.chapter,
        line: item.line,
        key: "rewards",
      });
      continue;
    }
    // A null with no new error is a skip with its own report (a custom kind left out
    // as manual work); only a new error stops the table.
    const errorsBefore = ctx.report.errorCount;
    const mark = ctx.report.mark();
    const entry = mapTableEntry(item, ctx);
    if (entry === null) {
      if (ctx.report.errorCount > errorsBefore) {
        if (!ctx.report.lossy) {
          return null;
        }
        ctx.report.soften(mark, "with loss allowed, this table entry is left out");
      }
      continue;
    }
    entries.push(entry);
  }
  if (blankWeight > 0) {
    const base = out["emptyWeight"];
    out["emptyWeight"] = (typeof base === "number" ? base : 0) + blankWeight;
  }
  out["entries"] = entries;
  return out;
}

/** A table entry with no reward payload: nothing but an id and a weight, if that. */
function isBlankEntry(item: SnbtNode): boolean {
  if (item.kind !== "compound") {
    return false;
  }
  for (const [key] of item.entries) {
    if (key !== "id" && key !== "weight") {
      return false;
    }
  }
  return true;
}

/** A blank entry's weight: the stated one, else the single roll it costs by default. */
function blankEntryWeight(item: SnbtNode, ctx: RewardContext): number | null {
  const raw = snbtGet(item, "weight");
  if (raw === undefined) {
    return 1;
  }
  const value = decimalField(raw, ctx, "weight");
  if (value === null) {
    return null;
  }
  if (value < 0) {
    fail(ctx, raw, "weight", "a negative weight means nothing");
    return null;
  }
  return value;
}

function mapTableEntry(item: SnbtNode, ctx: RewardContext): Record<string, unknown> | null {
  if (item.kind !== "compound") {
    fail(ctx, item, "rewards", "a reward table entry is not an object");
    return null;
  }
  const kind = rewardKind(item);
  if (kind === "choice") {
    fail(
      ctx,
      item,
      "type",
      "a table entry offers a choice: rolls hand entries out rather than offering them",
    );
    return null;
  }
  const entry: Record<string, unknown> = {};
  const weight = snbtGet(item, "weight");
  if (weight !== undefined) {
    const value = decimalField(weight, ctx, "weight");
    if (value === null) {
      return null;
    }
    if (value < 0) {
      fail(ctx, weight, "weight", "a negative weight means nothing");
      return null;
    }
    if (value !== 1) {
      entry["weight"] = value;
    }
  }
  const reward = mapTableEntryReward(item, ctx);
  if (reward === null) {
    return null;
  }
  entry["reward"] = reward;
  return entry;
}

function mapTableEntryReward(item: SnbtNode, ctx: RewardContext): Record<string, unknown> | null {
  const kind = rewardKind(item);
  if (kind === null || kind === "item") {
    return mapTableItemReward(item, ctx);
  }
  if (kind === "xp_levels") {
    return mapTableLevelsReward(item, ctx);
  }
  // Weighted entries of other kinds roll through the shared reward mapping.
  return mapReward(item, ctx);
}

function mapTableItemReward(item: SnbtNode, ctx: RewardContext): Record<string, unknown> | null {
  const stack = snbtGet(item, "item");
  // FTB's shorthand, as on quest rewards: a bare id is a stack of one of the item.
  const shorthand = stack !== undefined && stack.kind === "string" && stack.value.length > 0;
  if (!shorthand && (stack === undefined || stack.kind !== "compound")) {
    fail(ctx, item, "item", "a table entry names no item object");
    return null;
  }
  const ref =
    stack !== undefined && stack.kind === "string"
      ? { item: stack.value, stackCount: 1, components: undefined }
      : mapItemStack(stack as SnbtNode, ctx, "a table entry");
  if (ref === null) {
    return null;
  }
  const out: Record<string, unknown> = { type: "tenet:item", item: ref.item };
  if (ref.components !== undefined) {
    out["components"] = ref.components;
  }
  // The entry-level count is the grant; the stack's own count is display size.
  const grant = snbtGet(item, "count");
  const stackCount = ref.stackCount;
  let count = 1;
  if (grant !== undefined) {
    const value = integerField(grant, ctx, "count");
    if (value === null) {
      return null;
    }
    if (value < 1) {
      fail(ctx, grant, "count", "a grant of nothing means nothing");
      return null;
    }
    count = value;
  } else if (stackCount > 1) {
    count = stackCount;
  }
  if (count > MAX_COUNT) {
    ctx.report.warn({
      code: "clamped-count",
      message: `a table entry grants ${count}, over Tenet's cap of ${MAX_COUNT}`,
      path: ctx.chapter,
      line: grant?.line ?? item.line,
      key: "count",
      value: count,
    });
    count = MAX_COUNT;
  }
  if (count !== 1) {
    out["count"] = count;
  }
  const bonus = snbtGet(item, "random_bonus");
  if (bonus !== undefined) {
    const value = integerField(bonus, ctx, "random_bonus");
    if (value === null) {
      return null;
    }
    if (value < 0 || value > MAX_COUNT) {
      fail(ctx, bonus, "random_bonus", `random bonus ${value} stands outside 0–${MAX_COUNT}`);
      return null;
    }
    if (value !== 0) {
      out["randomBonus"] = value;
    }
  }
  return out;
}

function mapTableLevelsReward(item: SnbtNode, ctx: RewardContext): Record<string, unknown> | null {
  const levels = snbtGet(item, "xp_levels");
  if (levels === undefined) {
    fail(ctx, item, "xp_levels", "a table entry names no levels");
    return null;
  }
  const raw = integerField(levels, ctx, "xp_levels");
  if (raw === null) {
    return null;
  }
  const value = xpAmount(raw, levels, "xp_levels", ctx);
  if (value === null) {
    return null;
  }
  return { type: "tenet:xp", amount: value, levels: true };
}

/** A reward that grants nothing on either side: warned and left out, never failed. */
function emptyReward(node: SnbtNode, ctx: RewardContext, key: string, message: string): null {
  ctx.report.warn({ code: "empty-reward", message, path: ctx.chapter, line: node.line, key });
  return null;
}

/**
 * An xp grant inside Tenet's 1–100000. FTB stores what the editor saved: zero or less grants
 * nothing there, so the reward is left out (warned, never failed); more than Tenet's cap
 * clamps to it, warned with the pack's own number.
 */
function xpAmount(value: number, node: SnbtNode, key: string, ctx: RewardContext): number | null {
  if (value < 1) {
    ctx.report.warn({
      code: "empty-reward",
      message: `an xp reward of quest ${ctx.questId} grants ${key} ${value}, which gives nothing in FTB either; it is left out`,
      path: ctx.chapter,
      line: node.line,
      key,
      value,
    });
    return null;
  }
  if (value > 100000) {
    ctx.report.warn({
      code: "clamped-xp",
      message: `an xp reward of quest ${ctx.questId} grants ${key} ${value}, over Tenet's cap of 100000; it grants 100000`,
      path: ctx.chapter,
      line: node.line,
      key,
      value,
    });
    return 100000;
  }
  return value;
}

function finishReward(
  node: SnbtNode,
  ctx: RewardContext,
  out: Record<string, unknown>,
): Record<string, unknown> | null {
  const title = rewardTitle(node, ctx);
  if (title === null) {
    const titleNode = snbtGet(node, "title");
    if (titleNode !== undefined) {
      return null;
    }
  } else {
    out["title"] = title;
  }
  const icon = mapIcon(
    snbtGet(node, "icon"),
    ctx.report,
    ctx.chapter,
    `a reward of quest ${ctx.questId}'s icon`,
  );
  if (icon !== null) {
    out["icon"] = icon;
  }
  // Explicit either way: a false over a true file default must travel, or the reader
  // inherits the default it was opting out of. FTB writes flags as true/false and as
  // 1b/0b; anything else is malformed.
  const team = snbtGet(node, "team_reward");
  if (team !== undefined) {
    if (
      team.kind !== "boolean" &&
      !(team.kind === "byte" && (team.value === 0n || team.value === 1n))
    ) {
      fail(ctx, team, "team_reward", "team_reward is not true or false");
      return null;
    }
    out["team"] = team.kind === "boolean" ? team.value : team.value === 1n;
  }
  const auto = rewardAuto(node, ctx);
  if (auto === null) {
    return null;
  }
  if (auto !== "default") {
    out["auto"] = auto;
  }
  if (readBool(node, "exclude_from_claim_all", false, ctx)) {
    out["excludeFromClaimAll"] = true;
  }
  if (readBool(node, "ignore_reward_blocking", false, ctx)) {
    out["ignoreRewardBlocking"] = true;
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
  return out;
}

function rewardTitle(node: SnbtNode, ctx: RewardContext): string | null {
  const title = snbtGet(node, "title");
  if (title === undefined) {
    // 1.21 books keep a reward's words in the language files, `reward.<HEX>.title`.
    const id = snbtGet(node, "id");
    return id !== undefined && id.kind === "string" ? ctx.lang.rewardTitle(id.value) : null;
  }
  if (title.kind !== "string") {
    fail(ctx, title, "title", "a reward title is not text");
    return null;
  }
  if (title.value.trim().length === 0) {
    ctx.report.warn({
      code: "blank-text",
      message: `a reward of quest ${ctx.questId} is titled blank`,
      path: ctx.chapter,
      line: title.line,
      key: "title",
    });
  }
  return title.value;
}

function rewardAuto(node: SnbtNode, ctx: RewardContext): string | null {
  const auto = snbtGet(node, "auto");
  if (auto === undefined) {
    return "default";
  }
  if (auto.kind !== "string") {
    fail(ctx, auto, "auto", "auto is not text");
    return null;
  }
  if (!AUTO_WORDS.has(auto.value)) {
    fail(ctx, auto, "auto", `auto names ${JSON.stringify(auto.value)}, which is no autoclaim mode`);
    return null;
  }
  return auto.value;
}

function readTags(node: SnbtNode, ctx: RewardContext): ReadonlyArray<string> | null {
  const tags = snbtGet(node, "tags");
  if (tags === undefined) {
    return [];
  }
  if (tags.kind !== "list") {
    fail(ctx, tags, "tags", "tags is not a list");
    return null;
  }
  return readTagItems(tags.items, ctx.report, ctx.chapter, `a reward of quest ${ctx.questId}`);
}

interface StackRef {
  readonly item: string;
  readonly stackCount: number;
  readonly components: unknown;
}

function mapItemStack(
  stack: SnbtNode,
  ctx: RewardContext,
  what: string,
): (StackRef & { components?: unknown }) | null {
  if (stack.kind !== "compound") {
    fail(ctx, stack, "item", `${what} is not an item object`);
    return null;
  }
  const id = snbtGet(stack, "id");
  if (id === undefined || id.kind !== "string" || id.value.length === 0) {
    fail(ctx, stack, "item", `${what} names no item`);
    return null;
  }
  if (id.value === "ftbquests:missing_item") {
    const recovered = recoverTombstone(stack, ctx, what);
    if (recovered === null) {
      return null;
    }
    return { item: recovered, stackCount: stackCountOf(stack), components: undefined };
  }
  const components = snbtGet(stack, "components");
  if (components !== undefined && components.kind !== "compound") {
    fail(ctx, components, "components", `${what} carries components that are not an object`);
    return null;
  }
  return {
    item: id.value,
    stackCount: stackCountOf(stack),
    components:
      components !== undefined && components.kind === "compound"
        ? componentsToJson(components, ctx.report, ctx.chapter, what)
        : undefined,
  };
}

function stackCountOf(stack: SnbtNode): number {
  const count = snbtGet(stack, "count");
  if (count === undefined) {
    return 1;
  }
  if (
    count.kind === "byte" ||
    count.kind === "short" ||
    count.kind === "int" ||
    count.kind === "long"
  ) {
    const value = Number(count.value);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
  }
  if (count.kind === "float" || count.kind === "double") {
    return Number.isFinite(count.value) && count.value > 0 ? Math.floor(count.value) : 1;
  }
  return 1;
}

function recoverTombstone(stack: SnbtNode, ctx: RewardContext, what: string): string | null {
  const components = snbtGet(stack, "components");
  const inner =
    components !== undefined && components.kind === "compound"
      ? snbtGet(components, "ftbquests:missing_item")
      : undefined;
  if (inner === undefined || inner.kind !== "string") {
    fail(ctx, stack, "item", `${what} is FTB's missing_item tombstone with no id recorded in it`);
    return null;
  }
  ctx.report.note({
    code: "recovered-item",
    message: `${what} was FTB's missing_item tombstone; the item it stood for (${inner.value}) is used instead`,
    path: ctx.chapter,
    line: stack.line,
    key: "item",
    value: inner.value,
  });
  return inner.value;
}

function grantCount(reward: SnbtNode, stackCount: number, ctx: RewardContext): number | null {
  const count = snbtGet(reward, "count");
  if (count === undefined) {
    return stackCount > 0 ? stackCount : 1;
  }
  const value = integerField(count, ctx, "count");
  if (value === null) {
    return null;
  }
  if (value < 1) {
    fail(ctx, count, "count", "a grant of nothing means nothing");
    return null;
  }
  if (value > MAX_COUNT) {
    ctx.report.warn({
      code: "clamped-count",
      message: `a reward of quest ${ctx.questId} grants ${value}, over Tenet's cap of ${MAX_COUNT}`,
      path: ctx.chapter,
      line: count.line,
      key: "count",
      value,
    });
    return MAX_COUNT;
  }
  return value;
}

function integerField(node: SnbtNode, ctx: RewardContext, key: string): number | null {
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

function decimalField(node: SnbtNode, ctx: RewardContext, key: string): number | null {
  if (node.kind === "float" || node.kind === "double") {
    return Number.isFinite(node.value) ? node.value : null;
  }
  return integerField(node, ctx, key);
}

function stringField(node: SnbtNode, key: string): string | null {
  const child = snbtGet(node, key);
  return child !== undefined && child.kind === "string" && child.value !== "" ? child.value : null;
}

function readBool(node: SnbtNode, key: string, fallback: boolean, ctx: RewardContext): boolean {
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

function tableIdNumber(node: SnbtNode): bigint | null {
  if (node.kind === "long" || node.kind === "int" || node.kind === "short" || node.kind === "byte") {
    return node.value;
  }
  if (node.kind === "string" && /^\d+[lL]$/.test(node.value)) {
    return BigInt(node.value.slice(0, -1));
  }
  return null;
}

function fail(ctx: RewardContext, node: SnbtNode, key: string, message: string): void {
  ctx.report.error({ code: "malformed-reward", message, path: ctx.chapter, line: node.line, key });
}
