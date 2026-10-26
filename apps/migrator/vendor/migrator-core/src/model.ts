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
import { upgradeLegacyStacks } from "./legacy";
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

/** One string a book carries outside its language files, under the flat key FTB files it as. */
export interface InlineText {
  /** The flat FTB key the text would carry in a language file (`quest.<HEX>.title`). */
  readonly key: string;
  readonly node: SnbtNode;
  readonly path: string;
}

export interface QuestBookInput {
  readonly data: ParsedFile;
  readonly groups: ParsedFile | null;
  readonly chapters: ReadonlyArray<ChapterInput>;
  readonly tables: ReadonlyArray<ParsedFile>;
  /** Locale id (`en_us`) to its language file. `*_merged` build artefacts never arrive. */
  readonly lang: ReadonlyMap<string, ParsedFile>;
  /**
   * Split translation files, per locale, sorted by path: `lang/<locale>/**.snbt`, the layout
   * the FTB Quests Lang Splitter mod reads (its merged-away copies end `.snbt_merged` and never
   * arrive). The splitter puts every key over the locale file's table, so these win.
   */
  readonly langParts?: ReadonlyMap<string, ReadonlyArray<ParsedFile>>;
  /**
   * Text written into the objects themselves, the 1.20-era layout (`title`, `subtitle`,
   * `description` beside the ids). FTB moves it into `inlineLocale`'s table on first load,
   * under any string the language file already holds, so it is the lowest rung of that locale.
   */
  readonly inlineText?: ReadonlyArray<InlineText>;
  readonly inlineLocale?: string;
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
  // The toast for a finished book (BaseQuestFile.onCompleted), which Tenet never raises.
  "disable_toast",
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
  // Legacy 1.20-era inline text: the book's title, read as `file.0000000000000001.title`.
  "title",
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
  // Legacy 1.20-era inline text, read as `chapter.<HEX>.title` / `.chapter_subtitle`.
  "title",
  "subtitle",
]);

/** Every key a quest may carry (census + jar-real quest fields). */
export const QUEST_KEYS: ReadonlySet<string> = new Set([
  // questsadditions (MixinQuest): hidden until done, any N of the tasks, and one-way locks.
  "secret",
  "min_required_tasks",
  "incompatible",
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
  // Legacy 1.20-era inline text, read as `quest.<HEX>.title` / `.quest_subtitle` / `.quest_desc`.
  "title",
  "subtitle",
  "description",
]);

/** Every key a task may carry, across all task types (census + jar-real task fields). */
export const TASK_KEYS: ReadonlySet<string> = new Set([
  // questsadditions (MixinTask): the task is hidden until done.
  "secret",
  "id",
  "type",
  "item",
  "count",
  "components",
  "consume_items",
  "only_from_crafting",
  "match_components",
  "match_nbt",
  "weak_nbt_match",
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
  // NOTE: parameters of pack-custom temperature tasks (a threshold plus a direction flag).
  // The custom-task placeholder carries the task itself; these ride along unmapped, read
  // by the handler the placeholder's warning sends the author to write.
  "comparison",
  "target_temperature",
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
  // Legacy 1.20-era spelling of permission level 2, still read by the 1.21 jar.
  "elevate_perms",
  "player_command",
  // ExtraQuests (CommandRewardMixin): run from the server console instead of the player.
  "console",
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

/**
 * Add-on task and reward types the converter reads, each with the keys its own mod adds.
 * Any other namespaced type (`mod:name`) belongs to a mod this converter does not read: it
 * becomes a placeholder (tasks) or manual work (rewards) as a whole, its own settings named in
 * that warning, so they are not unmapped fields one by one.
 */
const ADDON_KEYS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["questsadditions:killnbt", new Set([...TASK_KEYS, "nbt", "checkItem"])],
  ["questsadditions:break", new Set([...TASK_KEYS, "block", "block_type", "checkItem"])],
  ["eternalcurrencies:currency", new Set([...REWARD_KEYS, "currency"])],
]);

/** The keys to hold a task or reward to, by its type; null for an add-on type read whole. */
function keysFor(item: SnbtNode, native: ReadonlySet<string>): ReadonlySet<string> | null {
  const type = snbtGet(item, "type");
  const name = type !== undefined && type.kind === "string" ? type.value : "";
  if (!name.includes(":") || name.startsWith("ftbquests:")) {
    return native;
  }
  return ADDON_KEYS.get(name) ?? null;
}

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
  // Legacy 1.20-era inline text, read as `reward_table.<HEX>.title`.
  "title",
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
  // NOTE: the legacy press spelling — a bare URL, `#quest`, `custom:` or `command:` string.
  // canvas reads it through the same rules as `click_action`; without this entry the book
  // fails before the mapper ever runs.
  "click",
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
// `title` is legacy 1.20-era inline text (`chapter_group.<HEX>.title`); `icon` is the row's picture.
const GROUP_ENTRY_KEYS: ReadonlySet<string> = new Set(["id", "title", "icon"]);
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
      // Language files hold no stacks; everything else reads 1.20-shaped stacks as 1.21 ones.
      const upgraded = file.path.startsWith("lang/") ? root : upgradeLegacyStacks(root, file.path, report);
      parsed.push({ path: file.path, root: upgraded });
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

  const chapterFiles: Array<ParsedFile> = [];
  const tableFiles: Array<ParsedFile> = [];
  const lang = new Map<string, ParsedFile>();
  const langParts = new Map<string, Array<ParsedFile>>();
  for (const file of parsed) {
    if (file === data || file === groups) {
      continue;
    }
    // Classified by place under the book root, the way FTB opens them: `chapters/` and
    // `reward_tables/` one level deep, never a namesake folder deeper down (a split
    // translation folder holds its own `chapters/`, which is text, not quests).
    const segments = file.path.split("/");
    const top = segments[0];
    const base = basename(file.path);
    if (segments.length === 2 && top === "chapters") {
      chapterFiles.push(file);
    } else if (segments.length === 2 && top === "reward_tables") {
      tableFiles.push(file);
    } else if (segments.length === 2 && top === "lang") {
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
    } else if (segments.length > 2 && top === "lang") {
      const locale = segments[1] as string;
      const list = langParts.get(locale) ?? [];
      list.push(file);
      langParts.set(locale, list);
    } else {
      // FTB never opens a file here, so nothing in it can be quest content: it travels with
      // the rest of the tree untouched, and the warning names it in case it was meant to.
      report.warn({
        code: "ignored-file",
        message: "sits outside data.snbt, chapters/, reward_tables/ and lang/, where FTB Quests never reads; it passes through unconverted",
        path: file.path,
        line: file.root.line,
      });
    }
  }
  const byPath = (a: { path: string }, b: { path: string }): number =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  chapterFiles.sort(byPath);
  tableFiles.sort(byPath);
  for (const list of langParts.values()) {
    list.sort(byPath);
    for (const part of list) {
      reportDuplicates(part.root, part.path, report);
    }
  }

  const chapters: Array<ChapterInput> = [];
  for (const file of dedupeById(chapterFiles, "chapter", report)) {
    chapters.push(readChapter(file, report, options));
  }
  const tables: Array<ParsedFile> = [];
  for (const file of dedupeById(tableFiles, "reward table", report)) {
    checkKeys(file.root, TABLE_KEYS, `the table file ${file.path}`, file.path, report, options);
    checkTypedList(file.root, "rewards", REWARD_KEYS, `the table file ${file.path}`, file.path, report, options);
    reportDuplicates(file.root, file.path, report);
    tables.push(file);
  }

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
  const inlineText = collectInlineText(data, groups, chapters, tables);
  const fallback = stringKey(data.root, "fallback_locale");
  return {
    data,
    groups,
    chapters,
    tables,
    lang,
    langParts,
    inlineText,
    inlineLocale: fallback !== null && fallback !== "" ? fallback : "en_us",
  };
}

/**
 * Two files claiming one id: a pack update that renamed a file leaves the old copy behind
 * (`Tier1_Seed Bag.snbt` beside `tier1_seed_bag.snbt`), and FTB loads both into one id slot,
 * the later reading winning. Identical copies collapse to the first with a note; copies that
 * differ keep the last by path and warn, naming both, since only one of them can be the book.
 */
function dedupeById(files: ReadonlyArray<ParsedFile>, what: string, report: Report): Array<ParsedFile> {
  const byId = new Map<string, Array<ParsedFile>>();
  const order: Array<string> = [];
  const loose: Array<ParsedFile> = [];
  for (const file of files) {
    const id = stringKey(file.root, "id");
    if (id === null) {
      // No id to share: ids.ts reports the malformed file itself.
      loose.push(file);
      continue;
    }
    const key = id.toLowerCase();
    const list = byId.get(key);
    if (list === undefined) {
      byId.set(key, [file]);
      order.push(key);
    } else {
      list.push(file);
    }
  }
  const out: Array<ParsedFile> = [...loose];
  for (const key of order) {
    const list = byId.get(key) as Array<ParsedFile>;
    const first = list[0] as ParsedFile;
    if (list.length === 1) {
      out.push(first);
      continue;
    }
    const reading = JSON.stringify(snbtToJson(first.root));
    const identical = list.every((file) => JSON.stringify(snbtToJson(file.root)) === reading);
    const kept = identical ? first : (list[list.length - 1] as ParsedFile);
    const others = list.filter((file) => file !== kept).map((file) => file.path);
    if (identical) {
      report.note({
        code: "duplicate-file",
        message: `holds the same ${what} as ${others.join(", ")}, a copy left by an earlier build of the pack; it converts once`,
        path: kept.path,
        line: kept.root.line,
      });
    } else {
      report.warn({
        code: "duplicate-file",
        message: `claims the ${what} id ${key} that ${others.join(", ")} also claims, with different content; only this one converts`,
        path: kept.path,
        line: kept.root.line,
      });
    }
    out.push(kept);
  }
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** Prose written into the objects, under the flat keys a language file would file it as. */
function collectInlineText(
  data: ParsedFile,
  groups: ParsedFile | null,
  chapters: ReadonlyArray<ChapterInput>,
  tables: ReadonlyArray<ParsedFile>,
): Array<InlineText> {
  const out: Array<InlineText> = [];
  const take = (node: SnbtNode, field: string, key: string, path: string): void => {
    const child = snbtGet(node, field);
    if (child !== undefined) {
      out.push({ key, node: child, path });
    }
  };
  take(data.root, "title", "file.0000000000000001.title", data.path);
  if (groups !== null) {
    const list = snbtGet(groups.root, "chapter_groups");
    if (list !== undefined && list.kind === "list") {
      for (const entry of list.items) {
        const id = stringKey(entry, "id");
        if (id !== null) {
          take(entry, "title", `chapter_group.${id}.title`, groups.path);
        }
      }
    }
  }
  for (const chapter of chapters) {
    if (chapter.id !== null) {
      take(chapter.node, "title", `chapter.${chapter.id}.title`, chapter.path);
      take(chapter.node, "subtitle", `chapter.${chapter.id}.chapter_subtitle`, chapter.path);
    }
    for (const quest of chapter.quests) {
      const id = stringKey(quest, "id");
      if (id !== null) {
        take(quest, "title", `quest.${id}.title`, chapter.path);
        take(quest, "subtitle", `quest.${id}.quest_subtitle`, chapter.path);
        take(quest, "description", `quest.${id}.quest_desc`, chapter.path);
      }
      const tasks = snbtGet(quest, "tasks");
      if (tasks !== undefined && tasks.kind === "list") {
        for (const task of tasks.items) {
          const taskId = stringKey(task, "id");
          if (taskId !== null) {
            take(task, "title", `task.${taskId}.title`, chapter.path);
          }
        }
      }
    }
  }
  for (const table of tables) {
    const id = stringKey(table.root, "id");
    if (id !== null) {
      take(table.root, "title", `reward_table.${id}.title`, table.path);
    }
  }
  return out;
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
    checkTypedList(quest, "tasks", TASK_KEYS, `a task in ${file.path}`, file.path, report, options);
    checkTypedList(quest, "rewards", REWARD_KEYS, `a reward in ${file.path}`, file.path, report, options);
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

/** {@link checkList} for tasks and rewards, whose allowed keys follow their type. */
function checkTypedList(
  node: SnbtNode,
  listKey: string,
  native: ReadonlySet<string>,
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
    const allowed = item.kind === "compound" ? keysFor(item, native) : null;
    if (allowed !== null) {
      checkKeys(item, allowed, what, path, report, options);
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
