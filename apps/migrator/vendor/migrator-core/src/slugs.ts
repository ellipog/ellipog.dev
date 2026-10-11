/**
 * Slugs: assumed names from titles, everywhere an id shows.
 *
 * <h2>Why slugs at all</h2>
 *
 * FTB ids are 16-hex numbers: unique, stable, and unreadable. A converted tree that keeps
 * them has chapter folders, quest files and table files no human can tell apart without
 * opening each one. Tenet ids are author words (`getting_started`, `first_steps`), so the
 * converter assumes names from the pack's own titles: the chapter called "Welcome" lives in
 * `welcome/`, the quest called "Village" is `village.json`.
 *
 * <h2>What makes a slug</h2>
 *
 * The title chain is the same one the display title uses (lang title, then first-task
 * title, then the first task's readable content — item, fluid, kill, biome, structure,
 * dimension, inline title — then the quest icon's item, then the first reward's item,
 * then `Quest <short-id>`), so an id reads like the words beside it. Table files prefer their filename stem — the author's own word for the file —
 * over the lang title. Formatting codes strip, case folds, anything outside `a-z0-9`
 * becomes `_`, runs collapse, edges trim, over-long bases shorten with room for the
 * counter. Nothing may start with `_` (the loader skips such names) or exceed 64
 * characters, and a fixed reserve (`index`, `lang`, `reward_tables`, `_migrator`, `group`,
 * `chapter`) keeps slugs off filesystem names the tree already uses.
 *
 * Collisions — two chapters called "Tools", a quest called "Welcome" in the welcome
 * chapter — resolve with `_2`, `_3`, … in authored order, inside one taken-set shared by
 * every kind: Tenet looks quest, chapter and group ids up together, so uniqueness has to
 * hold together too. The hex id stays the fallback when a title yields nothing, and the
 * audit map records every hex-to-slug pair, so no rename is ever untraceable.
 */

import { IdMap } from "./ids";
import { LangPool } from "./lang";
import { QuestBookInput } from "./model";
import { SnbtNode, snbtGet } from "./snbt";

export interface SlugMaps {
  readonly groups: Map<string, string>;
  readonly chapters: Map<string, string>;
  readonly quests: Map<string, string>;
  readonly tables: Map<string, string>;
  readonly images: Map<string, string>;
  readonly links: Map<string, string>;
  /**
   * Stand-in slugs for images with no id, keyed by node identity: FTB draws id-less
   * images, Tenet elements require ids, so the planner claims `img_<chapter>_<n>` in
   * authored order from the same taken-set. Read at use in canvas, never serialised.
   */
  readonly imageNodes: Map<SnbtNode, string>;
}

const MAX_ID = 64;
const RESERVED: ReadonlySet<string> = new Set([
  "index",
  "lang",
  "reward_tables",
  "_migrator",
  "group",
  "chapter",
]);

/** A title into its slug base: codes stripped, folded, underscored, or "" when unusable. */
export function slugifyTitle(title: string): string {
  const stripped = title
    .replace(/&[0-9a-fk-or]/gi, "")
    .replace(/§[0-9a-fk-or]/gi, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/__+/g, "_");
  return stripped;
}

/** Where a synthesised quest title came from, for the warning that names it. */
export type TitleOrigin =
  | "quest-lang"
  | "task-lang"
  | "task-content:item"
  | "task-content:fluid"
  | "task-content:kill"
  | "task-content:biome"
  | "task-content:structure"
  | "task-content:dimension"
  | "task-content:title"
  | "icon"
  | "reward"
  | "fallback";

export interface TitleCandidate {
  readonly title: string;
  readonly origin: TitleOrigin;
}

/**
 * The display-title chain with its provenance: lang title, task title, task content,
 * icon, reward, short id.
 *
 * The content walk is per task in authored order — the first task with anything nameable
 * wins — because the alternative (one rung across all tasks) would let a later task's
 * item outrank an earlier task's kill. Anything without a name (xp, stat, advancement,
 * stage, custom, observation, a title-less checkmark, a filter stack, a missing id)
 * is skipped, never failed: synthesis must never fail a quest.
 */
export function questTitleCandidate(
  node: SnbtNode,
  pool: LangPool,
  sourceHex: string,
  questId: string,
): TitleCandidate {
  const direct = pool.questTitle(sourceHex);
  if (direct !== null) {
    return { title: direct, origin: "quest-lang" };
  }
  const tasks = snbtGet(node, "tasks");
  if (tasks !== undefined && tasks.kind === "list") {
    for (const task of tasks.items) {
      if (task.kind !== "compound") {
        continue;
      }
      const id = snbtGet(task, "id");
      if (id !== undefined && id.kind === "string") {
        const taskTitle = pool.taskTitle(id.value);
        if (taskTitle !== null) {
          return { title: taskTitle, origin: "task-lang" };
        }
      }
    }
    for (const task of tasks.items) {
      if (task.kind !== "compound") {
        continue;
      }
      const named = taskContentTitle(task);
      if (named !== null) {
        return named;
      }
    }
  }
  const icon = snbtGet(node, "icon");
  if (icon !== undefined && icon.kind === "compound") {
    const id = snbtGet(icon, "id");
    if (id !== undefined && id.kind === "string" && id.value !== "" && id.value !== "ftbquests:custom_icon") {
      return { title: readableItem(id.value), origin: "icon" };
    }
  }
  const rewards = snbtGet(node, "rewards");
  if (rewards !== undefined && rewards.kind === "list") {
    for (const reward of rewards.items) {
      if (reward.kind !== "compound") {
        continue;
      }
      const item = snbtGet(reward, "item");
      if (item !== undefined && item.kind === "compound") {
        const id = snbtGet(item, "id");
        if (id !== undefined && id.kind === "string" && id.value !== "" && !id.value.startsWith("ftbquests:")) {
          return { title: readableItem(id.value), origin: "reward" };
        }
      }
    }
  }
  return { title: `Quest ${questId.slice(0, 8)}`, origin: "fallback" };
}

/** One task's nameable content, if it has any. Field order follows the task's own shape. */
function taskContentTitle(task: SnbtNode): TitleCandidate | null {
  const item = snbtGet(task, "item");
  if (item !== undefined && item.kind === "compound") {
    const id = snbtGet(item, "id");
    if (id !== undefined && id.kind === "string" && id.value !== "" && !id.value.startsWith("ftbquests:")) {
      if (id.value !== "ftbfiltersystem:smart_filter") {
        return { title: readableItem(id.value), origin: "task-content:item" };
      }
      // A filter names no stack of its own, but its expression usually names items:
      // the first one stands in. Tag/mod-only expressions name nothing here.
      const expression = filterString(item);
      if (expression !== null) {
        const first = firstExpressionItem(expression);
        if (first !== null) {
          return { title: readableItem(first), origin: "task-content:item" };
        }
      }
    }
  }
  const fluid = textField(task, "fluid");
  if (fluid !== null) {
    return { title: readableItem(fluid), origin: "task-content:fluid" };
  }
  const entity = textField(task, "entity") ?? textField(task, "entity_type_tag");
  if (entity !== null) {
    return { title: readableItem(entity), origin: "task-content:kill" };
  }
  const biome = textField(task, "biome");
  if (biome !== null) {
    return { title: readableItem(biome), origin: "task-content:biome" };
  }
  const structure = textField(task, "structure");
  if (structure !== null) {
    return { title: readableItem(structure), origin: "task-content:structure" };
  }
  const kind = textField(task, "type");
  if (kind === "dimension" || kind === "location") {
    const dimension = textField(task, "dimension");
    if (dimension !== null) {
      return { title: readableItem(dimension), origin: "task-content:dimension" };
    }
  }
  const inline = textField(task, "title");
  if (inline !== null && inline.trim() !== "") {
    return { title: inline, origin: "task-content:title" };
  }
  return null;
}

function textField(node: SnbtNode, key: string): string | null {
  const child = snbtGet(node, key);
  return child !== undefined && child.kind === "string" && child.value !== "" ? child.value : null;
}

function filterString(item: SnbtNode): string | null {
  const components = snbtGet(item, "components");
  const filter =
    components !== undefined && components.kind === "compound"
      ? snbtGet(components, "ftbfiltersystem:filter")
      : undefined;
  return filter !== undefined && filter.kind === "string" && filter.value !== "" ? filter.value : null;
}

function firstExpressionItem(expression: string): string | null {
  for (const match of expression.matchAll(/\bitem\(\s*([^()\s]+)\s*\)/g)) {
    const id = match[1] as string;
    if (id.includes(":")) {
      return id;
    }
  }
  return null;
}

export function readableItem(id: string): string {
  const last = id.split(":").pop() ?? id;
  return last
    .split(/[_/-]/)
    .filter((word) => word.length > 0)
    .map((word) => (word[0] ?? "").toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Claim one slug from a taken-set shared by every kind: the stem slugified (or the
 * fallback hex when the stem yields nothing), suffixed `_2`, `_3`, … until free.
 * The set must already hold every slug the book owns — buildSlugs fills it in authored
 * order, and later claimants (synthesised quests) extend the same set, so a synthesis
 * can never steal a name an author already holds.
 */
export function claimSlug(taken: Set<string>, base: string, fallback: string): string {
  const stem = slugifyTitle(base);
  const root = (stem !== "" ? stem : fallback).slice(0, MAX_ID - 8);
  let candidate = root.slice(0, MAX_ID);
  let counter = 2;
  while (taken.has(candidate) || RESERVED.has(candidate)) {
    const suffix = `_${counter++}`;
    candidate = `${root.slice(0, MAX_ID - suffix.length)}${suffix}`;
  }
  taken.add(candidate);
  return candidate;
}

/** Every id in the book, slugged in authored order: groups, chapters, quests, tables. */
export function buildSlugs(book: QuestBookInput, ids: IdMap, pool: LangPool): SlugMaps {
  const taken = new Set<string>();
  const groups = new Map<string, string>();
  const chapters = new Map<string, string>();
  const quests = new Map<string, string>();
  const tables = new Map<string, string>();
  const images = new Map<string, string>();
  const links = new Map<string, string>();
  const imageNodes = new Map<SnbtNode, string>();

  if (book.groups !== null && book.groups.root.kind === "compound") {
    const list = snbtGet(book.groups.root, "chapter_groups");
    if (list !== undefined && list.kind === "list") {
      for (const item of list.items) {
        if (item.kind !== "compound") {
          continue;
        }
        const id = snbtGet(item, "id");
        if (id === undefined || id.kind !== "string") {
          continue;
        }
        const hex = id.value.toLowerCase();
        if (groups.has(hex)) {
          continue;
        }
        const entry = ids.groups.get(hex);
        const title = entry !== undefined ? pool.groupTitle(entry.source) : null;
        groups.set(hex, claimSlug(taken, title ?? "", hex));
      }
    }
  }
  for (const chapter of book.chapters) {
    const hex = (chapter.id ?? "").toLowerCase();
    if (hex === "" || chapters.has(hex)) {
      continue;
    }
    const entry = ids.chapters.get(hex);
    const title = entry !== undefined ? pool.chapterTitle(entry.source) : null;
    chapters.set(hex, claimSlug(taken, title ?? "", hex));
    if (chapter.node.kind !== "compound") {
      continue;
    }
    for (const quest of chapter.quests) {
      if (quest.kind !== "compound") {
        continue;
      }
      const raw = snbtGet(quest, "id");
      const source = raw !== undefined && raw.kind === "string" ? raw.value : "";
      const qhex = source.toLowerCase();
      if (qhex === "" || quests.has(qhex)) {
        continue;
      }
      quests.set(qhex, claimSlug(taken, questTitleCandidate(quest, pool, source, qhex).title, qhex));
    }
    const imageList = snbtGet(chapter.node, "images");
    if (imageList !== undefined && imageList.kind === "list") {
      let nameless = 0;
      for (const image of imageList.items) {
        if (image.kind !== "compound") {
          continue;
        }
        const raw = snbtGet(image, "id");
        if (raw === undefined || (raw.kind === "string" && raw.value === "")) {
          // FTB draws images with no id; Tenet elements require one, so claim a
          // deterministic stand-in in authored order. A non-string id is malformed
          // rather than missing: it stays for imageId to refuse downstream.
          nameless += 1;
          const chapterSlug = chapters.get(hex) ?? hex;
          imageNodes.set(
            image,
            claimSlug(taken, `img_${chapterSlug}_${nameless}`, `img_${hex.slice(0, 8)}_${nameless}`),
          );
          continue;
        }
        if (raw.kind !== "string") {
          continue;
        }
        const source = raw.value;
        const ihex = source.toLowerCase();
        if (ihex === "" || images.has(ihex)) {
          continue;
        }
        const title = pool.imageTitle(source);
        images.set(ihex, claimSlug(taken, title ?? "", ihex));
      }
    }
    const linkList = snbtGet(chapter.node, "quest_links");
    if (linkList !== undefined && linkList.kind === "list") {
      for (const link of linkList.items) {
        if (link.kind !== "compound") {
          continue;
        }
        const raw = snbtGet(link, "id");
        const source = raw !== undefined && raw.kind === "string" ? raw.value : "";
        const lhex = source.toLowerCase();
        if (lhex === "" || links.has(lhex)) {
          continue;
        }
        const rawTarget = snbtGet(link, "linked_quest");
        const target = rawTarget !== undefined && rawTarget.kind === "string" ? rawTarget.value.toLowerCase() : "";
        const targetSlug = quests.get(target);
        links.set(lhex, claimSlug(taken, targetSlug !== undefined ? `link_${targetSlug}` : "", lhex));
      }
    }
  }
  for (const table of book.tables) {
    if (table.root.kind !== "compound") {
      continue;
    }
    const raw = snbtGet(table.root, "id");
    const source = raw !== undefined && raw.kind === "string" ? raw.value : "";
    const thex = source.toLowerCase();
    if (thex === "" || tables.has(thex)) {
      continue;
    }
    const stem = table.path.split("/").pop()?.replace(/\.snbt$/, "") ?? "";
    const entry = ids.tables.get(thex);
    const title = entry !== undefined ? pool.tableTitle(entry.source) : null;
    tables.set(thex, claimSlug(taken, slugifyTitle(stem) !== "" ? stem : (title ?? ""), thex));
  }
  return { groups, chapters, quests, tables, images, links, imageNodes };
}
