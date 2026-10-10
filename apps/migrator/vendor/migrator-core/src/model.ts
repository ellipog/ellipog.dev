/**
 * The input model: a quest book as typed file handles, with the unknown-key policy.
 *
 * <h2>Why the vocabulary lives here, not in the mapping</h2>
 *
 * Every FTB key the census found (plus the jar-real ones the census cannot see, like
 * `emergency_items`) is listed below, per level. Anything outside these sets is not a field
 * with a pending mapping — it is a field no mapping will ever know — so it fails the run (or
 * warns with `allowLoss`) the moment the book loads. Mapping phases then read known keys
 * without re-checking: by the time they run, every key on the table is one the plan names.
 *
 * <h2>Why duplicates warn everywhere</h2>
 *
 * A repeated key loads as its last writing on both sides, so keeping it is faithful — but the
 * earlier writing still cost an author intent. Every duplicate, at every level, is one warning
 * naming both lines. ATM10 carries none, so the rule is free there and priceless elsewhere.
 */

import {
  SnbtError,
  SnbtNode,
  parseSnbt,
  snbtDuplicates,
  snbtGet,
  snbtToJson,
} from "./snbt";
import { Report } from "./report";
import { VfsFile, vfsText } from "./vfs";

export interface ModelOptions {
  /** Downgrade unknown keys from errors to warnings. Failing stays the safer default. */
  readonly allowLoss: boolean;
}

export interface ParsedFile {
  readonly path: string;
  readonly root: SnbtNode;
}

export interface ChapterInput {
  readonly path: string;
  readonly node: SnbtNode;
  readonly filename: string | null;
  readonly id: string | null;
  readonly group: string | null;
  readonly order: number | null;
  readonly quests: ReadonlyArray<SnbtNode>;
}

export interface QuestBookInput {
  readonly data: ParsedFile;
  readonly groups: ParsedFile | null;
  readonly chapters: ReadonlyArray<ChapterInput>;
  readonly tables: ReadonlyArray<ParsedFile>;
  /** Locale id (`en_us`) to its language file. `*_merged` build artefacts never arrive. */
  readonly lang: ReadonlyMap<string, ParsedFile>;
}

/** Every key `data.snbt` may carry (census + jar-real `emergency_items`). */
export const DATA_KEYS: ReadonlySet<string> = new Set([
  "version",
  "default_autoclaim_rewards",
  "default_consume_items",
  "default_quest_disable_jei",
  "default_quest_shape",
  "default_reward_team",
  "detection_delay",
  "disable_gui",
  "drop_book_on_death",
  "drop_loot_crates",
  "emergency_items",
  "emergency_items_cooldown",
  "fallback_locale",
  "grid_scale",
  "hide_excluded_quests",
  "icon",
  "lock_message",
  "loot_crate_no_drop",
  "pause_game",
  "preset",
  "presets",
  "progression_mode",
  "show_lock_icons",
  "suppress_all_autoclaiming",
  "verify_on_load",
]);

/** Every key a chapter file may carry at its root (census + jar-real chapter fields). */
export const CHAPTER_KEYS: ReadonlySet<string> = new Set([
  "filename",
  "group",
  "id",
  "order_index",
  "quests",
  "icon",
  "images",
  "quest_links",
  "default_quest_shape",
  "default_quest_size",
  "default_hide_dependency_lines",
  "hide_quest_details_until_startable",
  "hide_quest_until_deps_visible",
  "hide_quest_until_deps_complete",
  "hide_text_until_complete",
  "autofocus_id",
  // NOTE: the SNBT key carries `_quest` — `default_repeatable` alone is not a field.
  "default_repeatable_quest",
  "require_sequential_tasks",
  "default_min_width",
  "always_invisible",
  "consume_items",
  "disable_toast",
  "progression_mode",
  "preset",
  "tags",
]);

/** Every key a quest may carry (census + jar-real quest fields). */
export const QUEST_KEYS: ReadonlySet<string> = new Set([
  "id",
  "x",
  "y",
  "shape",
  "size",
  "icon",
  "icon_scale",
  "preset",
  "dependencies",
  "dependency_requirement",
  "min_required_dependencies",
  "max_completable_dependents",
  "tasks",
  "rewards",
  "optional",
  "can_repeat",
  "repeat_cooldown",
  "require_sequential_tasks",
  "progression_mode",
  "invisible",
  "invisible_until_tasks",
  "hide_until_deps_visible",
  "hide_until_deps_complete",
  "hide_dependency_lines",
  "hide_dependent_lines",
  // NOTE: no `quest_` infix at quest level — FTB's own field is `hide_details_until_startable`
  // (the `hide_quest_…` spellings live on the chapter, as defaults for its quests).
  "hide_details_until_startable",
  "hide_text_until_complete",
  "hide_lock_icon",
  "disable_recipe_mod",
  "disable_toast",
  "min_width",
  "tags",
  "guide_page",
  "ignore_reward_blocking",
  "dep_control_pts",
  // Legacy 1.20-era compat shim FTB still reads: `hide` behaves as hide_until_deps_visible.
  "hide",
]);

/** Every key a task may carry, across all task types (census + jar-real task fields). */
export const TASK_KEYS: ReadonlySet<string> = new Set([
  "id",
  "type",
  "item",
  "count",
  "components",
  "consume_items",
  "only_from_crafting",
  "match_components",
  "task_screen_only",
  "optional_task",
  "title",
  "icon",
  "tags",
  "disable_toast",
  "value",
  "points",
  "max_input",
  "fluid",
  "amount",
  "stat",
  "entity",
  "entity_type_tag",
  "custom_name",
  "nbt_filter",
  "dimension",
  "ignore_dimension",
  "ignore_dim",
  "position",
  "size",
  "advancement",
  "criterion",
  "observation_type",
  "observe_type",
  "timer",
  "to_observe",
  "biome",
  "structure",
  "stage",
  "team_stage",
]);

/** Every key a reward — or a table entry — may carry (census + jar-real reward fields). */
export const REWARD_KEYS: ReadonlySet<string> = new Set([
  "id",
  "type",
  "item",
  "count",
  "components",
  "advancement",
  "criterion",
  "team_reward",
  "auto",
  "exclude_from_claim_all",
  "ignore_reward_blocking",
  "random_bonus",
  "only_one",
  "title",
  "icon",
  "disable_toast",
  "silent",
  "permission_level",
  "command",
  "feedback_message",
  "table_id",
  "table_data",
  "stage",
  "team_stage",
  "remove",
  "xp",
  "xp_levels",
  "amount",
  "description",
  "weight",
  "empty_weight",
]);

/** Every key a reward-table file may carry at its root. */
export const TABLE_KEYS: ReadonlySet<string> = new Set([
  "id",
  "loot_size",
  "loot_crate",
  "order_index",
  "rewards",
  "use_title",
  "hide_tooltip",
  "empty_weight",
  "icon",
]);

/** Every key a chapter image may carry (census + jar-real image fields). */
export const IMAGE_KEYS: ReadonlySet<string> = new Set([
  "id",
  "image",
  "x",
  "y",
  "width",
  "height",
  "rotation",
  "color",
  "alpha",
  "order",
  "corner",
  "text_on_image",
  "text_shadow",
  "text_inset",
  "text_h_align",
  "text_v_align",
  "hover",
  "dependency",
  "position_locked",
  "dev",
  "click_action",
  "click_action_type",
  "click_action_data",
]);

/** Every key a quest link may carry. */
export const LINK_KEYS: ReadonlySet<string> = new Set([
  "id",
  "linked_quest",
  "x",
  "y",
  "shape",
  "size",
]);

const GROUP_FILE_KEYS: ReadonlySet<string> = new Set(["chapter_groups"]);
const GROUP_ENTRY_KEYS: ReadonlySet<string> = new Set(["id"]);
const PRESET_KEYS: ReadonlySet<string> = new Set(["shape", "size"]);

/**
 * Load a quest-book root: parse every `.snbt` file, classify it, and check every level against
 * the vocabulary. Parse failures and unknown keys accumulate in the report; the run fails at
 * the end (or warns with `allowLoss`). Files that are not `.snbt` pass through untouched —
 * structure preservation is the emitter's job, not the model's.
 */
export function loadQuestBook(
  files: ReadonlyArray<VfsFile>,
  options: ModelOptions,
  report: Report,
): QuestBookInput | null {
  // Phase-local verdict: a shared report accumulates across pipeline phases, so this phase
  // judges only the errors it adds — incoming failures belong to whoever added them.
  const errorsBefore = report.errorCount;
  const parsed: Array<ParsedFile> = [];
  for (const file of files) {
    if (!file.path.endsWith(".snbt")) {
      continue;
    }
    try {
      const root = parseSnbt(vfsText(file), file.path);
      if (root.kind !== "compound") {
        report.error({
          code: "parse-error",
          message: `reads as ${root.kind}, not the compound a quest file is`,
          path: file.path,
          line: root.line,
        });
        continue;
      }
      parsed.push({ path: file.path, root });
    } catch (error) {
      const message = error instanceof SnbtError ? error.message : String(error);
      report.error({ code: "parse-error", message, path: file.path });
    }
  }

  const data = onlyOne(
    parsed.filter((file) => basename(file.path) === "data.snbt"),
    "data.snbt",
    report,
  );
  const groups = onlyOne(
    parsed.filter((file) => basename(file.path) === "chapter_groups.snbt"),
    "chapter_groups.snbt",
    report,
  );
  if (data === null) {
    report.error({ code: "missing-book", message: "no data.snbt: nothing here is a quest book" });
    return null;
  }

  const chapters: Array<ChapterInput> = [];
  const tables: Array<ParsedFile> = [];
  const lang = new Map<string, ParsedFile>();
  for (const file of parsed) {
    const parent = parentDir(file.path);
    const base = basename(file.path);
    if (file === data || file === groups) {
      continue;
    }
    if (parent === "chapters") {
      chapters.push(readChapter(file, report, options));
    } else if (parent === "reward_tables") {
      checkKeys(file.root, TABLE_KEYS, `the table file ${file.path}`, file.path, report, options);
      checkList(file.root, "rewards", REWARD_KEYS, `the table file ${file.path}`, file.path, report, options);
      reportDuplicates(file.root, file.path, report);
      tables.push(file);
    } else if (parent === "lang") {
      if (base.endsWith("_merged.snbt")) {
        // Build artefacts beside the real locales — ignored, never converted.
        report.note({
          code: "ignored-build-artefact",
          message: "is a merged build artefact; only its locale file converts",
          path: file.path,
        });
        continue;
      }
      lang.set(base.slice(0, -".snbt".length), file);
    } else {
      report.error({
        code: "unknown-layout",
        message: `lives outside data.snbt, chapters/, reward_tables/ and lang/: not a quest book`,
        path: file.path,
        line: file.root.line,
      });
    }
  }
  chapters.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  checkKeys(data.root, DATA_KEYS, "data.snbt", data.path, report, options);
  checkPresets(data, report, options);
  reportDuplicates(data.root, data.path, report);
  if (groups !== null) {
    checkKeys(groups.root, GROUP_FILE_KEYS, "chapter_groups.snbt", groups.path, report, options);
    checkList(groups.root, "chapter_groups", GROUP_ENTRY_KEYS, "chapter_groups.snbt", groups.path, report, options);
    reportDuplicates(groups.root, groups.path, report);
  }
  if (report.errorCount > errorsBefore) {
    return null;
  }
  return { data, groups, chapters, tables, lang };
}

/** Exactly zero or one — two `data.snbt` files fail naming both, never picking a winner. */
function onlyOne(files: Array<ParsedFile>, what: string, report: Report): ParsedFile | null {
  if (files.length === 0) {
    return null;
  }
  const first = files[0] as ParsedFile;
  if (files.length === 1) {
    return first;
  }
  report.error({
    code: "duplicate-book",
    message: `two ${what} files (${files.map((file) => file.path).join(", ")})`,
    path: first.path,
    line: first.root.line,
  });
  return first;
}

function readChapter(file: ParsedFile, report: Report, options: ModelOptions): ChapterInput {
  const what = `the chapter file ${file.path}`;
  checkKeys(file.root, CHAPTER_KEYS, what, file.path, report, options);
  checkList(file.root, "quests", QUEST_KEYS, `a quest in ${file.path}`, file.path, report, options);
  for (const quest of questList(file.root)) {
    checkList(quest, "tasks", TASK_KEYS, `a task in ${file.path}`, file.path, report, options);
    checkList(quest, "rewards", REWARD_KEYS, `a reward in ${file.path}`, file.path, report, options);
  }
  checkList(file.root, "images", IMAGE_KEYS, `an image in ${file.path}`, file.path, report, options);
  checkList(file.root, "quest_links", LINK_KEYS, `a quest link in ${file.path}`, file.path, report, options);
  reportDuplicates(file.root, file.path, report);
  return {
    path: file.path,
    node: file.root,
    filename: stringKey(file.root, "filename"),
    id: stringKey(file.root, "id"),
    group: stringKey(file.root, "group"),
    order: intKey(file.root, "order_index"),
    quests: questList(file.root),
  };
}

function questList(chapter: SnbtNode): ReadonlyArray<SnbtNode> {
  const quests = snbtGet(chapter, "quests");
  if (quests === undefined || quests.kind !== "list") {
    return [];
  }
  return quests.items.filter((item) => item.kind === "compound");
}

function stringKey(node: SnbtNode, key: string): string | null {
  const child = snbtGet(node, key);
  return child !== undefined && child.kind === "string" ? child.value : null;
}

function intKey(node: SnbtNode, key: string): number | null {
  const child = snbtGet(node, key);
  if (
    child === undefined ||
    (child.kind !== "int" && child.kind !== "long" && child.kind !== "short" && child.kind !== "byte")
  ) {
    return null;
  }
  return child.value <= BigInt(Number.MAX_SAFE_INTEGER) &&
    child.value >= BigInt(Number.MIN_SAFE_INTEGER)
    ? Number(child.value)
    : null;
}

/**
 * Every key outside `allowed` is recorded — an error, or a warning with `allowLoss` — with the
 * file, the line, the key, and a truncated reading of the value it carried. Silent drops are
 * how converters lose fields; this is the line that stops that.
 */
export function checkKeys(
  node: SnbtNode,
  allowed: ReadonlySet<string>,
  what: string,
  path: string,
  report: Report,
  options: ModelOptions,
): void {
  if (node.kind !== "compound") {
    return;
  }
  for (const [key, child] of node.entries) {
    if (allowed.has(key)) {
      continue;
    }
    const lines = node.keyLines.get(key) ?? [node.line];
    const entry = {
      code: "unmapped-field",
      message: `${what} carries \`${key}\`, which this converter has no mapping for`,
      path,
      line: lines[lines.length - 1] as number,
      key,
      value: describeValue(child),
    };
    if (options.allowLoss) {
      report.warn(entry);
    } else {
      report.error(entry);
    }
  }
}

function checkList(
  node: SnbtNode,
  listKey: string,
  allowed: ReadonlySet<string>,
  what: string,
  path: string,
  report: Report,
  options: ModelOptions,
): void {
  const list = snbtGet(node, listKey);
  if (list === undefined || list.kind !== "list") {
    return;
  }
  for (const item of list.items) {
    if (item.kind === "compound") {
      checkKeys(item, allowed, what, path, report, options);
    }
  }
}

function checkPresets(data: ParsedFile, report: Report, options: ModelOptions): void {
  const presets = snbtGet(data.root, "presets");
  if (presets === undefined || presets.kind !== "compound") {
    return;
  }
  for (const [, preset] of presets.entries) {
    if (preset.kind === "compound") {
      checkKeys(preset, PRESET_KEYS, "a visual preset", data.path, report, options);
    }
  }
}

function reportDuplicates(node: SnbtNode, path: string, report: Report): void {
  const walk = (current: SnbtNode): void => {
    if (current.kind === "compound") {
      for (const key of snbtDuplicates(current)) {
        const lines = current.keyLines.get(key) ?? [];
        report.warn({
          code: "duplicate-key",
          message: `writes \`${key}\` ${lines.length} times; the last writing is the one that counts`,
          path,
          line: lines[lines.length - 1] as number,
          key,
        });
      }
      for (const [, child] of current.entries) {
        walk(child);
      }
    } else if (current.kind === "list") {
      for (const item of current.items) {
        walk(item);
      }
    }
  };
  walk(node);
}

/** A truncated reading of an unknown value, so the report names what it refused. */
export function describeValue(node: SnbtNode): unknown {
  const json = snbtToJson(node);
  if (typeof json === "object" && json !== null) {
    return JSON.stringify(json).slice(0, 120);
  }
  return json;
}

function basename(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut < 0 ? path : path.slice(cut + 1);
}

function parentDir(path: string): string {
  const cut = path.lastIndexOf("/");
  if (cut < 0) {
    return "";
  }
  const rest = path.slice(0, cut);
  const parent = rest.lastIndexOf("/");
  return parent < 0 ? rest : rest.slice(parent + 1);
}
