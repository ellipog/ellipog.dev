/**
 * Writers: the Tenet folder format, emitted deterministically.
 *
 * <h2>Layout (exactly Tenet's own)</h2>
 *
 * ```
 * <book root>/
 * ├── index.json                  settings + entries (loose chapters first, then groups)
 * ├── reward_tables/<name>.json   one file per table, named by its lowercase hex id
 * ├── <groupid>/group.json        a chapter group; folder name is the id
 * ├── <groupid>/<chapterid>/chapter.json
 * ├── <chapterid>/chapter.json    a loose chapter, at the root
 * ├── <dir>/<questid>.json        one quest file per quest
 * ├── lang/<locale>.json          overlays in Tenet keys
 * └── _migrator/ids.json          old spellings beside new (the report lands beside it,
 *                                 appended by the caller once conversion returns)
 * ```
 *
 * Folders carry ids: a group lives at `<groupid>/group.json`, a chapter at
 * `<groupid>/<chapterid>/chapter.json` (or `<chapterid>/chapter.json` loose at the root),
 * quests at `<chapterid>.json`... precisely: `<dir>/<questid>.json`. Language overlays at
 * `lang/<locale>.json`, the audit map at `_migrator/ids.json` (the report itself is appended
 * by the caller once conversion returns, since only then is it final).
 *
 * <h2>Settings honesty</h2>
 *
 * Most settings emit only when off-default. Four always emit because their absent readings
 * diverge: `defaultAutoClaim` (FTB's absent read is ambiguous; Tenet defaults `disabled`),
 * `emergencyItemsCooldown` (FTB absent reads `0`; Tenet defaults `300`), `showLockIcons`
 * (FTB absent draws; Tenet hides), and `disableCanvasLod` (FTB has no zoom tiers at all;
 * Tenet tiers unless asked out). `drop_loot_crates`, `loot_crate_no_drop` and
 * `verify_on_load` have no Tenet home and report instead — a warning when set (real loss),
 * a note when inert.
 *
 * <h2>Determinism</h2>
 *
 * Files sort by path. JSON is two-space indented with a trailing newline, keys in the fixed
 * order each builder writes. Same book in, same bytes out.
 */

import { IdMap, idsJson, resolveQuestSlug } from "./ids";
import { mapIcon, mapItemRef } from "./icons";
import { LangPool, collectImageIds } from "./lang";
import { ChapterInput, QuestBookInput } from "./model";
import { Report } from "./report";
import { readTagItems } from "./tags";
import { FileDefaults, readChapterDefaults, readFileDefaults } from "./resolve";
import type { ChapterDefaults } from "./resolve";
import { SnbtNode, snbtGet } from "./snbt";
import { VfsFile } from "./vfs";
import { DEFAULT_GEOM, GeomOptions } from "./geometry";
import { emitChapterQuests } from "./quests";
import { checkGateCycles, planChapterGates } from "./gates";
import { mapTableFile } from "./rewards";
import { SlugMaps, buildSlugs } from "./slugs";
import { emitChapterCanvas } from "./canvas";

export interface ConvertOptions {
  readonly canonicalLocale: string;
  readonly fallbackLocale: string;
  readonly geom?: GeomOptions;
}

export interface OutputFile {
  readonly path: string;
  readonly text: string;
}

const SCHEMA = {
  index: "https://ellipog.dev/tenet/_schema/index.schema.json",
  group: "https://ellipog.dev/tenet/_schema/group.schema.json",
  chapter: "https://ellipog.dev/tenet/_schema/chapter.schema.json",
  rewardTable: "https://ellipog.dev/tenet/_schema/reward_table.schema.json",
  quest: "https://ellipog.dev/tenet/_schema/quest.schema.json",
};


/**
 * Convert a loaded, identity-built book into output files. Quest files carry their P8 content
 * in a later round; this round emits index, groups, chapters (with quest filename lists),
 * language overlays and the audit map. Quest and table bodies arrive with the field mappings.
 */
export function convertBook(
  book: QuestBookInput,
  ids: IdMap,
  options: ConvertOptions,
  report: Report,
): Array<OutputFile> {
  const files: Array<OutputFile> = [];
  const file = readFileDefaults(book, report);
  const pool = new LangPool(
    book.lang,
    { canonicalLocale: options.canonicalLocale, fallbackLocale: options.fallbackLocale },
    report,
    { parts: book.langParts, inline: book.inlineText, inlineLocale: book.inlineLocale },
  );
  const slugs = buildSlugs(book, ids, pool);
  pool.checkOrphans(ids, collectImageIds(book));
  // Chapter gates before any quest maps: retargets read the plan, and emission places
  // the gates. A book with no chapter edges plans nothing and reports nothing.
  const gates = planChapterGates(book, ids, slugs, pool, report);

  const groups = orderedGroups(book, ids, slugs);
  const chaptersByGroup = new Map<string, Array<ChapterInput>>();
  const loose: Array<ChapterInput> = [];
  for (const chapter of book.chapters) {
    const entry = ids.chapters.get((chapter.id ?? "").toLowerCase());
    if (entry === undefined) {
      continue;
    }
    const group = chapter.group !== null && chapter.group !== "" ? chapter.group.toLowerCase() : null;
    if (group !== null && ids.groups.has(group)) {
      const list = chaptersByGroup.get(group) ?? [];
      list.push(chapter);
      chaptersByGroup.set(group, list);
    } else {
      loose.push(chapter);
    }
  }
  const byOrder = (a: ChapterInput, b: ChapterInput): number =>
    orderOf(a) - orderOf(b) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  for (const list of chaptersByGroup.values()) {
    list.sort(byOrder);
  }
  loose.sort(byOrder);

  files.push({
    path: "index.json",
    text: emitJson(writeIndex(book, file, pool, groups, loose, slugs, report)),
  });
  for (const group of groups) {
    files.push({
      path: `${group.slug}/group.json`,
      text: emitJson(writeGroup(pool, group, chaptersByGroup.get(group.id) ?? [], slugs, report, book.groups?.path ?? "chapter_groups.snbt")),
    });
  }
  // Emitted slug graph for the gate-cycle check: quest and gate `dependsOn` alike,
  // accumulated across chapters as each chapter emits.
  const questGraph = new Map<string, { deps: ReadonlyArray<string>; path: string }>();
  for (const chapter of book.chapters) {
    const entry = ids.chapters.get((chapter.id ?? "").toLowerCase());
    if (entry === undefined) {
      continue;
    }
    const dir = chapterDir(ids, slugs, chapter);
    const defaults = readChapterDefaults(chapter, report);
    const geom = options.geom ?? DEFAULT_GEOM;
    const emitted = emitChapterQuests(chapter, {
      chapter,
      ids,
      slugs,
      lang: pool,
      file,
      chapterDefaults: defaults,
      geom,
      report,
      gates,
    }, ids);
    for (const quest of emitted) {
      const id = quest.json["id"];
      const rawDeps = quest.json["dependsOn"];
      const deps = Array.isArray(rawDeps)
        ? rawDeps.filter((dep): dep is string => typeof dep === "string")
        : [];
      if (typeof id === "string") {
        questGraph.set(id, { deps, path: `${dir}/${quest.filename}` });
      }
    }
    const canvas = emitChapterCanvas(chapter, {
      chapterPath: chapter.path,
      ids,
      slugs,
      lang: pool,
      chapter: defaults,
      file,
      geom,
      report,
    });
    files.push({
      path: `${dir}/chapter.json`,
      text: emitJson(writeChapter(ids, slugs, pool, chapter, file, report, {
        quests: emitted.map((quest) => quest.filename),
        elements: canvas.elements,
        links: canvas.links,
      })),
    });
    for (const quest of emitted) {
      files.push({ path: `${dir}/${quest.filename}`, text: emitJson(quest.json) });
    }
  }
  // A cycle through a gate deadlocks in FTB too (it expands chapter references the
  // same way when verifying), so it fails here naming the chain rather than emitting
  // a tree Tenet would refuse. Quest-only cycles stay Tenet's to report at load.
  checkGateCycles(questGraph, new Set(gates.gates.map((gate) => gate.slug)), report);
  for (const table of book.tables) {
    const emitted = emitRewardTable(table.path, table.root, book, ids, slugs, pool, report);
    if (emitted !== null) {
      files.push(emitted);
    }
  }
  for (const locale of pool.localeIds()) {
    // Tenet lang files are flat string maps: paragraph lists join with "\n", the exact
    // inverse of the client's split, so translations round-trip paragraph for paragraph.
    const overlay: Record<string, string> = {};
    for (const { key, value } of pool.overlay(locale)) {
      overlay[renameOverlayKey(key, slugs)] = typeof value === "string" ? value : value.join("\n");
    }
    files.push({ path: `lang/${locale}.json`, text: emitJson(overlay) });
  }
  files.push({ path: "_migrator/ids.json", text: emitJson(idsJson(ids, slugs) as Record<string, unknown>) });
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return files;
}

export function emitJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * An overlay key with its hex id swapped for the assumed name: translations address the
 * ids the files carry, so `quest.3bc0….title` becomes `quest.welcome_diamond.title`.
 * Task keys stay on task hex (tasks carry no output ids); anything unparseable passes
 * through untouched rather than dropping a translation.
 */
function renameOverlayKey(key: string, slugs: SlugMaps): string {
  const dot = key.indexOf(".");
  const last = key.lastIndexOf(".");
  if (dot < 0 || dot === last) {
    return key;
  }
  const kind = key.slice(0, dot);
  const id = key.slice(dot + 1, last);
  const rest = key.slice(last + 1);
  const map =
    kind === "quest"
      ? slugs.quests
      : kind === "chapter"
        ? slugs.chapters
        : kind === "group"
          ? slugs.groups
          : kind === "rewardTable"
            ? slugs.tables
            : kind === "element"
              ? slugs.images
              : null;
  if (map === null) {
    return key;
  }
  const slug = map.get(id);
  return slug === undefined ? key : `${kind}.${slug}.${rest}`;
}

function emitRewardTable(
  path: string,
  root: SnbtNode,
  book: QuestBookInput,
  ids: IdMap,
  slugs: SlugMaps,
  pool: LangPool,
  report: Report,
): OutputFile | null {
  void book;
  if (root.kind !== "compound") {
    return null;
  }
  const rawId = snbtGet(root, "id");
  if (rawId === undefined || rawId.kind !== "string" || rawId.value === "") {
    return null;
  }
  const name = rawId.value.toLowerCase();
  if (!ids.tables.has(name)) {
    return null;
  }
  const slug = slugs.tables.get(name) ?? name;
  const mapped = mapTableFile(slug, root, {
    questId: `table ${name}`,
    chapter: path,
    lang: pool,
    ids,
    slugs,
    report,
  });
  if (mapped === null) {
    return null;
  }
  return { path: `reward_tables/${slug}.json`, text: emitJson(mapped.json) };
}

function orderedGroups(
  book: QuestBookInput,
  ids: IdMap,
  slugs: SlugMaps,
): Array<{ id: string; source: string; slug: string; node: SnbtNode }> {
  const out: Array<{ id: string; source: string; slug: string; node: SnbtNode }> = [];
  if (book.groups !== null) {
    const list = snbtGet(book.groups.root, "chapter_groups");
    if (list !== undefined && list.kind === "list") {
      for (const item of list.items) {
        if (item.kind !== "compound") {
          continue;
        }
        const id = snbtGet(item, "id");
        if (id !== undefined && id.kind === "string") {
          const entry = ids.groups.get(id.value.toLowerCase());
          if (entry !== undefined && !out.some((group) => group.id === entry.id)) {
            out.push({ id: entry.id, source: entry.source, slug: slugs.groups.get(entry.id) ?? entry.id, node: item });
          }
        }
      }
    }
  }
  return out;
}

function orderOf(chapter: ChapterInput): number {
  return chapter.order ?? 0;
}

function chapterDir(ids: IdMap, slugs: SlugMaps, chapter: ChapterInput): string {
  const id = (chapter.id ?? "").toLowerCase();
  const slug = slugs.chapters.get(id) ?? id;
  const group = chapter.group !== null && chapter.group !== "" ? chapter.group.toLowerCase() : null;
  if (group !== null && ids.groups.has(group)) {
    return `${slugs.groups.get(group) ?? group}/${slug}`;
  }
  return slug;
}

function writeIndex(
  book: QuestBookInput,
  file: FileDefaults,
  pool: LangPool,
  groups: Array<{ id: string; source: string; slug: string }>,
  loose: Array<ChapterInput>,
  slugs: SlugMaps,
  report: Report,
): Record<string, unknown> {
  const settings: Record<string, unknown> = {};
  // File and Tenet spell every mode the same way; readFileDefaults already validated it.
  settings["defaultAutoClaim"] = file.autoClaim;
  if (file.teamReward) {
    settings["defaultTeamReward"] = true;
  }
  writeBoolSetting(book, "suppress_all_autoclaiming", "suppressAllAutoclaiming", settings, report);
  const delay = readInt(book.data.root, "detection_delay", 20);
  if (delay !== 20) {
    settings["detectionDelay"] = delay;
  }
  const title = pool.fileTitle();
  if (title !== null && title !== "") {
    settings["bookTitle"] = title;
  }
  const icon = mapIcon(snbtGet(book.data.root, "icon"), report, book.data.path, "the book icon");
  if (icon !== null) {
    settings["bookIcon"] = icon;
  }
  const fallback = readString(book.data.root, "fallback_locale");
  if (fallback !== null && fallback !== "" && fallback !== "en_us") {
    settings["fallbackLocale"] = fallback;
  }
  if (file.consumeItems) {
    settings["defaultConsumeItems"] = true;
  }
  if (file.disableRecipeMod) {
    settings["defaultDisableRecipeMod"] = true;
  }
  const showLocks = readOptBool(book.data.root, "show_lock_icons");
  if (showLocks !== false) {
    settings["showLockIcons"] = true;
  }
  // FTB Quests draws every icon at every zoom — it has no LOD tiers, no icon culling, no
  // shrinking detail — and Tenet's absent reads tiered. Unconditional: there is no per-pack
  // variation to configure, exactly like the dependencyStyle below. A chapter opts back
  // into tiers with its own explicit `false`; deleting the key opts the whole book in.
  settings["disableCanvasLod"] = true;
  report.note({
    code: "lod-off",
    message:
      "the book draws without Tenet's zoom tiers (disableCanvasLod), as FTB Quests did; delete the key to opt into tiers",
    path: book.data.path,
    line: book.data.root.line,
  });
  writeBoolSetting(book, "hide_excluded_quests", "hideExcludedQuests", settings, report);
  writeBoolSetting(book, "pause_game", "pauseGame", settings, report);
  writeBoolSetting(book, "disable_gui", "disableGui", settings, report);
  writeBoolSetting(book, "drop_book_on_death", "dropBookOnDeath", settings, report);
  const bookToast = snbtGet(book.data.root, "disable_toast");
  if (bookToast !== undefined && readOptBool(book.data.root, "disable_toast") !== false) {
    // FTB toasts a book whose every quest is done (BaseQuestFile.onCompleted); Tenet never
    // announces a whole book, so the flag silences nothing there.
    report.note({
      code: "no-book-toast",
      message: "the book silences the toast FTB raises once every quest is done; Tenet raises none, so nothing changes",
      path: book.data.path,
      line: bookToast.line,
      key: "disable_toast",
    });
  }
  const grid = readNumber(book.data.root, "grid_scale", 0.5);
  if (grid !== 0.5) {
    settings["gridScale"] = grid;
  }
  const lockMessage = readString(book.data.root, "lock_message");
  if (lockMessage !== null && lockMessage !== "") {
    settings["lockMessage"] = lockMessage;
  }
  const cooldown = readInt(book.data.root, "emergency_items_cooldown", 0);
  if (cooldown > 86400) {
    // Tenet waits at most a day between grants; a longer wait reads as that day.
    report.warn({
      code: "clamped-cooldown",
      message: `emergency_items_cooldown is ${cooldown}; Tenet waits at most 86400 seconds (a day), so it waits that long`,
      path: book.data.path,
      key: "emergency_items_cooldown",
      value: cooldown,
    });
  }
  settings["emergencyItemsCooldown"] = Math.min(cooldown, 86400);
  const emergency = snbtGet(book.data.root, "emergency_items");
  if (emergency !== undefined && emergency.kind === "list" && emergency.items.length > 0) {
    const items: Array<unknown> = [];
    for (const item of emergency.items) {
      const ref = mapItemRef(item, report, book.data.path, "an emergency item");
      if (ref !== null) {
        items.push(ref);
      }
    }
    if (items.length > 0) {
      settings["emergencyItems"] = items;
    }
  }
  reportNoHomeSettings(book, report);

  const entries: Array<unknown> = [];
  // FTB's default group first: chapters with no group sort before every named group, in
  // order_index order like every group chapter list. The loose list arrives already sorted.
  for (const chapter of loose) {
    const id = (chapter.id ?? "").toLowerCase();
    entries.push({ chapter: slugs.chapters.get(id) ?? id });
  }
  for (const group of groups) {
    entries.push({ group: group.slug });
  }
  return { $schema: SCHEMA.index, settings, entries };
}

function writeBoolSetting(
  book: QuestBookInput,
  key: string,
  tenet: string,
  settings: Record<string, unknown>,
  report: Report,
): void {
  void report;
  const value = readOptBool(book.data.root, key);
  if (value === true) {
    settings[tenet] = true;
  }
}

function reportNoHomeSettings(book: QuestBookInput, report: Report): void {
  const drop = snbtGet(book.data.root, "drop_loot_crates");
  const dropTrue =
    drop !== undefined &&
    ((drop.kind === "boolean" && drop.value) || (drop.kind === "byte" && drop.value === 1n));
  const noDrop = snbtGet(book.data.root, "loot_crate_no_drop");
  if (dropTrue) {
    report.warn({
      code: "no-loot-crates",
      message: "drop_loot_crates is on, but Tenet has no loot crates: crate drops need manual work",
      path: book.data.path,
      line: drop?.line ?? book.data.root.line,
      key: "drop_loot_crates",
    });
  } else if (drop !== undefined || noDrop !== undefined) {
    report.note({
      code: "unused-loot-settings",
      message: "loot-crate settings with dropping off change nothing; they are not emitted",
      path: book.data.path,
      line: book.data.root.line,
    });
  }
  if (snbtGet(book.data.root, "verify_on_load") !== undefined) {
    report.note({
      code: "loader-flag",
      message: "verify_on_load is a loader flag with no quest-file meaning here",
      path: book.data.path,
      line: book.data.root.line,
      key: "verify_on_load",
    });
  }
  report.note({
    code: "format-version",
    message: "source format version 13 (Tenet versions its own files separately)",
    path: book.data.path,
    line: book.data.root.line,
    key: "version",
  });
}

function writeGroup(
  pool: LangPool,
  group: { id: string; source: string; slug: string; node: SnbtNode },
  chapters: Array<ChapterInput>,
  slugs: SlugMaps,
  report: Report,
  path: string,
): Record<string, unknown> {
  const doc: Record<string, unknown> = { $schema: SCHEMA.group, id: group.slug };
  const title = pool.groupTitle(group.source);
  if (title === null) {
    report.warn({
      code: "missing-text",
      message: `the chapter group ${group.source} has no title; it reads empty`,
      key: group.source,
    });
    doc["title"] = "";
  } else {
    doc["title"] = title;
  }
  const icon = mapIcon(snbtGet(group.node, "icon"), report, path, `the chapter group ${group.source}'s icon`);
  if (icon !== null) {
    doc["icon"] = icon;
  }
  doc["chapters"] = chapters.map((chapter) => {
    const hex = (chapter.id ?? "").toLowerCase();
    return slugs.chapters.get(hex) ?? hex;
  });
  return doc;
}

function writeChapter(
  ids: IdMap,
  slugs: SlugMaps,
  pool: LangPool,
  chapter: ChapterInput,
  file: FileDefaults,
  report: Report,
  content: { quests: Array<string>; elements: Array<Record<string, unknown>>; links: Array<Record<string, unknown>> },
): Record<string, unknown> {
  const id = (chapter.id ?? "").toLowerCase();
  const source = chapter.id ?? "";
  const doc: Record<string, unknown> = { $schema: SCHEMA.chapter, id: slugs.chapters.get(id) ?? id };
  const title = pool.chapterTitle(source);
  if (title === null) {
    report.warn({
      code: "missing-text",
      message: `the chapter ${source} has no title; it reads empty`,
      path: chapter.path,
      line: chapter.node.line,
    });
    doc["title"] = "";
  } else {
    doc["title"] = title;
  }
  const subtitle = pool.chapterSubtitle(source);
  if (subtitle !== null) {
    doc["subtitle"] = subtitle;
  }
  const icon = mapIcon(snbtGet(chapter.node, "icon"), report, chapter.path, `the chapter ${source}'s icon`);
  if (icon !== null) {
    doc["icon"] = icon;
  }
  const defaults = readChapterDefaults(chapter, report);
  if (defaults.defaultMinWidth > 0) {
    doc["defaultMinWidth"] = defaults.defaultMinWidth;
  }
  // FTB draws every dependency line straight with no arrowheads; Tenet's built-in default
  // is chamfered with a chevron. Unconditional: there is no per-pack variation to configure.
  doc["dependencyStyle"] = { form: "straight", arrowHead: "none" };
  const autofocus = readAutofocus(chapter, ids, slugs, report);
  if (autofocus !== null) {
    doc["autofocus"] = autofocus;
  }
  if (defaults.sequential) {
    doc["defaultSequentialTasks"] = true;
  }
  if (defaults.alwaysInvisible) {
    doc["alwaysInvisible"] = true;
  }
  if (defaults.hideUntilDepsComplete) {
    doc["defaultHideUntilDependenciesComplete"] = true;
  }
  if (defaults.hideUntilDepsVisible) {
    doc["defaultHideUntilDependenciesVisible"] = true;
  }
  if (defaults.consumeItems === true) {
    doc["defaultConsumeItems"] = true;
  }
  const flexible = (defaults.progression ?? file.progression) === "flexible";
  if (flexible) {
    doc["defaultFlexibleProgress"] = true;
  }
  const tags = readTags(chapter, report);
  if (tags !== null && tags.length > 0) {
    doc["tags"] = tags;
  }
  const completesWhen = chapterMilestones(chapter, defaults, slugs);
  if (completesWhen.length > 0) {
    doc["completesWhen"] = completesWhen;
  }
  const disableToast = snbtGet(chapter.node, "disable_toast");
  if (disableToast !== undefined && readOptBool(chapter.node, "disable_toast") !== false) {
    // FTB reads it for the chapter's own completion toast only (Chapter.onCompleted). Tenet
    // announces every finished chapter and has no switch to quiet one, so the toast returns.
    report.note({
      code: "no-chapter-toast",
      message: "the chapter silences its own completion toast; Tenet announces every finished chapter and has no switch for it, so this one is announced",
      path: chapter.path,
      line: disableToast.line,
      key: "disable_toast",
    });
  }
  doc["quests"] = content.quests;
  if (content.elements.length > 0) {
    doc["elements"] = content.elements;
  }
  if (content.links.length > 0) {
    doc["links"] = content.links;
  }
  return doc;
}

/**
 * The quests finishing this chapter, in authored order: every quest that is neither
 * optional nor repeatable.
 *
 * FTB completes a chapter once its required quests are done — optional quests never
 * count, and repeatable ones are never done-for-good (`isOptionalForProgression`) — so
 * Tenet's explicit milestone list is that same set written out. A chapter of nothing
 * but side quests and dailies declares no milestones and never reports completed, which
 * is a real state, not a missing one. Malformed flags are resolveQuest's to refuse;
 * reading them as unset here only matters on a run that already fails.
 */
function chapterMilestones(
  chapter: ChapterInput,
  defaults: ChapterDefaults,
  slugs: SlugMaps,
): Array<string> {
  const out: Array<string> = [];
  for (const quest of chapter.quests) {
    if (quest.kind !== "compound") {
      continue;
    }
    const raw = snbtGet(quest, "id");
    const hex = raw !== undefined && raw.kind === "string" ? raw.value.toLowerCase() : "";
    const slug = slugs.quests.get(hex);
    if (slug === undefined) {
      continue;
    }
    if (questFlag(quest, "optional")) {
      continue;
    }
    const repeat = snbtGet(quest, "can_repeat");
    const repeatable =
      repeat === undefined
        ? defaults.repeatable
        : repeat.kind === "boolean"
          ? repeat.value
          : repeat.kind === "byte" && (repeat.value === 0n || repeat.value === 1n)
            ? repeat.value === 1n
            : defaults.repeatable;
    if (repeatable) {
      continue;
    }
    out.push(slug);
  }
  return out;
}

function questFlag(node: SnbtNode, key: string): boolean {
  const child = snbtGet(node, key);
  if (child === undefined) {
    return false;
  }
  if (child.kind === "boolean") {
    return child.value;
  }
  if (child.kind === "byte" && (child.value === 0n || child.value === 1n)) {
    return child.value === 1n;
  }
  return false;
}

function readAutofocus(chapter: ChapterInput, ids: IdMap, slugs: SlugMaps, report: Report): string | null {  const raw = snbtGet(chapter.node, "autofocus_id");
  if (raw === undefined) {
    return null;
  }
  if (raw.kind !== "string" || raw.value === "") {
    return null;
  }
  const target = resolveQuestSlug(ids, slugs, raw.value);
  if (target === null) {
    // FTB centres on nothing in particular when the named quest is gone; Tenet refuses
    // a focus that resolves nowhere (and says to remove the field), so the chapter
    // centres on its bounding box on both sides. Warned: the author's pointer is broken.
    report.warn({
      code: "bad-autofocus",
      message: `autofocus names ${JSON.stringify(raw.value)}, which resolves to no quest; the chapter centres on its bounding box`,
      path: chapter.path,
      line: raw.line,
      key: "autofocus_id",
      value: raw.kind === "string" ? raw.value : null,
    });
    return null;
  }
  const entry = ids.quests.get(raw.value.toLowerCase());
  if (entry === undefined || entry.chapter !== chapter.path) {
    report.warn({
      code: "bad-autofocus",
      message: `autofocus names ${JSON.stringify(raw.value)}, which lives in another chapter; the canvas centres on its own chapter`,
      path: chapter.path,
      line: raw.line,
      key: "autofocus_id",
      value: raw.value,
    });
    return null;
  }
  return target;
}

function readTags(chapter: ChapterInput, report: Report): ReadonlyArray<string> | null {
  const tags = snbtGet(chapter.node, "tags");
  if (tags === undefined) {
    return null;
  }
  if (tags.kind !== "list") {
    report.error({
      code: "malformed-field",
      message: "tags is not a list",
      path: chapter.path,
      line: tags.line,
      key: "tags",
    });
    return null;
  }
  return readTagItems(tags.items, report, chapter.path, `the chapter ${chapter.id ?? "?"}`);
}

function readOptBool(node: SnbtNode, key: string): boolean | null {
  const child = snbtGet(node, key);
  if (child === undefined) {
    return null;
  }
  // FTB writes flags as true/false and as 1b/0b.
  if (child.kind === "boolean") {
    return child.value;
  }
  if (child.kind === "byte" && (child.value === 0n || child.value === 1n)) {
    return child.value === 1n;
  }
  return null;
}

function readString(node: SnbtNode, key: string): string | null {
  const child = snbtGet(node, key);
  return child !== undefined && child.kind === "string" ? child.value : null;
}

function readInt(node: SnbtNode, key: string, fallback: number): number {
  const child = snbtGet(node, key);
  if (child === undefined) {
    return fallback;
  }
  if (
    child.kind === "byte" ||
    child.kind === "short" ||
    child.kind === "int" ||
    child.kind === "long"
  ) {
    return Number(child.value);
  }
  if ((child.kind === "float" || child.kind === "double") && Number.isInteger(child.value)) {
    return child.value;
  }
  return fallback;
}

function readNumber(node: SnbtNode, key: string, fallback: number): number {
  const child = snbtGet(node, key);
  if (child === undefined) {
    return fallback;
  }
  if (child.kind === "float" || child.kind === "double") {
    return child.value;
  }
  if (
    child.kind === "byte" ||
    child.kind === "short" ||
    child.kind === "int" ||
    child.kind === "long"
  ) {
    return Number(child.value);
  }
  return fallback;
}
