/**
 * Identities: lowercase ids, no aliases, and references that all resolve.
 *
 * <h2>Why lowercase, and why no aliases</h2>
 *
 * FTB ids are uppercase 16-hex parsed as int64, so FTB's own lookups never cared about case.
 * Tenet normalises lookup keys the same way (T1), which makes the lowercase id answer to the
 * original uppercase spelling already — and an alias carrying that spelling would normalise
 * onto the quest's own id and fail the load. The rule that survives review: if
 * `lowercase(source)` equals the target, emit no alias. With the id rule below, that is every
 * quest. `_migrator/ids.json` keeps the original spelling for audits and manual KubeJS fixes.
 *
 * <h2>Why collisions and dangling references always fail</h2>
 *
 * A normalised id shared by two objects has no faithful reading — emitting either target
 * invents an edge the pack never had. A reference naming nothing has no reading at all. Both
 * fail naming both sides, with or without `allowLoss`: a loss can be downgraded, a guess
 * cannot. Malformed ids (not 16-hex) fail the same way: never guess.
 *
 * <h2>Why task and reward ids in dependencies do not fail here</h2>
 *
 * A quest may gate on a task or reward id, and FTB resolves it: Quest.dependencies holds
 * any QuestObject, and readData keeps whatever file.get(id) finds. Task completion does
 * enter the completion map (Task.onCompleted writes the task id through
 * TeamData.setCompleted), so the edge can satisfy in FTB when that task completes. Tenet
 * gates quests on quests only, so no Tenet edge can carry a task gate directly. The
 * converter lifts each such gate onto the quest owning the task or reward — the
 * progression-safe reading, keeping the gate a gate — and the quest mapper reports every
 * lift naming both sides. They collect here as DeadEdges - recorded, never failed -
 * because failing the whole book over nine pack quirks FTB itself loads would be the
 * converter refusing real packs. A dependency on a chapter id is different: chapters do
 * complete, so the edge may satisfy in FTB and no Tenet quest edge can carry it - that
 * one fails, for an author to rewire.

 *
 * <h2>What this module does not scan</h2>
 *
 * Quest dependencies, group refs and table refs are structural — they gate loading — so they
 * validate here. Image gates, quest links and click data validate where those fields map
 * (later phases), through the same {@link resolveQuestRef}; reporting them twice would train
 * packs to skim the report.
 */

import { Report } from "./report";
import { QuestBookInput } from "./model";
import { SnbtNode, snbtGet } from "./snbt";

const HEX_ID = /^[0-9A-Fa-f]{16}$/;

export interface IdEntry {
  /** Original spelling, exactly as the pack wrote it. */
  readonly source: string;
  /** Canonical id: the source lowercased. */
  readonly id: string;
}

export interface QuestIdEntry extends IdEntry {
  readonly chapter: string;
}

export interface FileIdEntry extends IdEntry {
  readonly file: string;
}

export interface TaskIdEntry extends IdEntry {
  /** The lowercase id of the quest owning the task or reward. */
  readonly owner: string;
  readonly chapter: string;
}

/** A dependency edge FTB resolves but can never satisfy: a quest naming a task or reward. */
export interface DeadEdge {
  /** Lowercase id of the quest carrying the edge. */
  readonly quest: string;
  /** The reference exactly as the pack wrote it. */
  readonly ref: string;
  readonly kind: "task" | "reward";
  /** Lowercase id of the quest owning the referenced task or reward. */
  readonly owner: string;
  readonly chapter: string;
  readonly line: number;
}

export interface IdMap {
  /** Lowercase quest id to its entry. */
  readonly quests: ReadonlyMap<string, QuestIdEntry>;
  readonly chapters: ReadonlyMap<string, FileIdEntry>;
  readonly groups: ReadonlyMap<string, IdEntry>;
  /** Lowercase table inner id to its entry. */
  readonly tables: ReadonlyMap<string, FileIdEntry>;
  /** Lowercase task id to its owning quest. Classification only, never an edge target. */
  readonly tasks: ReadonlyMap<string, TaskIdEntry>;
  readonly rewards: ReadonlyMap<string, TaskIdEntry>;
  /** Edges for the quest mapper to drop and report, in file order. */
  readonly deadEdges: ReadonlyArray<DeadEdge>;
}

/**
 * Build every identity in the book and prove every structural reference resolves. Returns the
 * map, or null when the report holds errors. Quest ids, chapter ids, group ids and table ids
 * each live in their own namespace: Tenet resolves kinds separately, so a quest sharing a
 * chapter's id is two objects, not a collision — sharing within one kind is the error.
 */
export function buildIds(book: QuestBookInput, report: Report): IdMap | null {
  // Phase-local verdict like loadQuestBook: judge only the errors added here, so phases
  // sharing one report never fail each other.
  const errorsBefore = report.errorCount;
  const builder = new IdBuilder(report);
  builder.readGroups(book);
  builder.readChapters(book);
  builder.readTables(book);
  builder.readQuests(book);
  builder.indexTaskRewardIds();
  builder.validateQuestEdges();
  if (report.errorCount > errorsBefore) {
    return null;
  }
  return builder.finish();
}

/** A Tenet id for a quest reference in any letter case, or null when it names nothing. */
export function resolveQuestRef(ids: IdMap, ref: string): string | null {
  return ids.quests.has(ref.toLowerCase()) ? ref.toLowerCase() : null;
}

export interface QuestSlugs {
  readonly quests: Map<string, string>;
}

/** The same reference as its assumed name, or null when it names nothing. */
export function resolveQuestSlug(ids: IdMap, slugs: QuestSlugs, ref: string): string | null {
  const hex = ref.toLowerCase();
  if (!ids.quests.has(hex)) {
    return null;
  }
  return slugs.quests.get(hex) ?? hex;
}

/**
 * A decimal `table_id` to its lowercase-hex table id: unsigned 64-bit, zero-padded to 16.
 * The mask is the rule, not a convenience — FTB parses the value signed and formats it
 * unsigned (`format(value & 0xFFFFFFFFFFFFFFFF, '016x')`), so `-1L` names `ffffffffffffffff`.
 */
export function remapTableId(value: bigint): string {
  return BigInt.asUintN(64, value).toString(16).padStart(16, "0");
}

/** The `_migrator/ids.json` shape: old spelling beside new, every list sorted by id. */
export function idsJson(ids: IdMap, slugs?: {
  readonly quests: Map<string, string>;
  readonly chapters: Map<string, string>;
  readonly groups: Map<string, string>;
  readonly tables: Map<string, string>;
}): unknown {
  const byId = (a: IdEntry, b: IdEntry): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const slugOf = (map: Map<string, string> | undefined, id: string): string | undefined =>
    map?.get(id);
  return {
    quests: [...ids.quests.values()].sort(byId).map((entry) => ({
      source: entry.source,
      id: entry.id,
      slug: slugOf(slugs?.quests, entry.id) ?? entry.id,
      chapter: entry.chapter,
    })),
    chapters: [...ids.chapters.values()].sort(byId).map((entry) => ({
      source: entry.source,
      id: entry.id,
      slug: slugOf(slugs?.chapters, entry.id) ?? entry.id,
      file: entry.file,
    })),
    groups: [...ids.groups.values()].sort(byId).map((entry) => ({
      source: entry.source,
      id: entry.id,
      slug: slugOf(slugs?.groups, entry.id) ?? entry.id,
    })),
    tables: [...ids.tables.values()].sort(byId).map((entry) => ({
      source: entry.source,
      id: entry.id,
      slug: slugOf(slugs?.tables, entry.id) ?? entry.id,
      file: entry.file,
    })),
  };
}

class IdBuilder {
  private readonly report: Report;
  private readonly quests = new Map<string, QuestIdEntry>();
  private readonly chapters = new Map<string, FileIdEntry>();
  private readonly groups = new Map<string, IdEntry>();
  private readonly tables = new Map<string, FileIdEntry>();
  private readonly tasks = new Map<string, TaskIdEntry>();
  private readonly rewards = new Map<string, TaskIdEntry>();
  private readonly deadEdges: Array<DeadEdge> = [];
  private readonly questOrder: Array<{ chapter: string; quest: SnbtNode; id: string }> = [];

  constructor(report: Report) {
    this.report = report;
  }

  finish(): IdMap {
    return {
      quests: this.quests,
      chapters: this.chapters,
      groups: this.groups,
      tables: this.tables,
      tasks: this.tasks,
      rewards: this.rewards,
      deadEdges: this.deadEdges,
    };
  }

  readGroups(book: QuestBookInput): void {
    if (book.groups === null) {
      return;
    }
    const list = snbtGet(book.groups.root, "chapter_groups");
    if (list === undefined || list.kind !== "list") {
      return;
    }
    for (const item of list.items) {
      if (item.kind !== "compound") {
        continue;
      }
      const raw = stringField(item, "id");
      if (raw === null || !HEX_ID.test(raw)) {
        this.report.error({
          code: "malformed-id",
          message: `a chapter group names ${describeRaw(raw)}, which is not a 16-hex id`,
          path: book.groups.path,
          line: item.line,
          key: "id",
          value: raw,
        });
        continue;
      }
      const id = raw.toLowerCase();
      const clash = this.groups.get(id);
      if (clash !== undefined && clash.source !== raw) {
        this.report.error({
          code: "id-collision",
          message: `two chapter groups claim ${id} (${clash.source} and ${raw})`,
          path: book.groups.path,
          line: item.line,
          key: "id",
        });
        continue;
      }
      this.groups.set(id, { source: raw, id });
    }
  }

  readChapters(book: QuestBookInput): void {
    for (const chapter of book.chapters) {
      const raw = chapter.id;
      if (raw === null || !HEX_ID.test(raw)) {
        this.report.error({
          code: "malformed-id",
          message: `the chapter file carries id ${describeRaw(raw)}, which is not a 16-hex id`,
          path: chapter.path,
          line: chapter.node.line,
          key: "id",
          value: raw,
        });
        continue;
      }
      const id = raw.toLowerCase();
      const clash = this.chapters.get(id);
      if (clash !== undefined) {
        this.report.error({
          code: "id-collision",
          message: `two chapters claim ${id} (${clash.file} and ${chapter.path})`,
          path: chapter.path,
          line: chapter.node.line,
          key: "id",
        });
        continue;
      }
      this.chapters.set(id, { source: raw, id, file: chapter.path });
      const group = chapter.group;
      if (group !== null && group !== "") {
        if (!this.groups.has(group.toLowerCase())) {
          this.report.error({
            code: "dangling-group",
            message: `the chapter belongs to group ${group}, which no chapter group declares`,
            path: chapter.path,
            line: chapter.node.line,
            key: "group",
            value: group,
          });
        }
      }
    }
  }

  readTables(book: QuestBookInput): void {
    for (const table of book.tables) {
      const raw = stringField(table.root, "id");
      if (raw === null || !HEX_ID.test(raw)) {
        this.report.error({
          code: "malformed-id",
          message: `the table file carries id ${describeRaw(raw)}, which is not a 16-hex id`,
          path: table.path,
          line: table.root.line,
          key: "id",
          value: raw,
        });
        continue;
      }
      const id = raw.toLowerCase();
      const clash = this.tables.get(id);
      if (clash !== undefined) {
        this.report.error({
          code: "id-collision",
          message: `two reward tables claim ${id} (${clash.file} and ${table.path})`,
          path: table.path,
          line: table.root.line,
          key: "id",
        });
        continue;
      }
      this.tables.set(id, { source: raw, id, file: table.path });
    }
  }

  readQuests(book: QuestBookInput): void {
    // Two passes: edges may point forward (a quest depending on one defined later in the
    // book), so every id must exist before any edge is judged. Judging during insertion
    // would fail forward references that resolve perfectly well.
    for (const chapter of book.chapters) {
      for (const quest of chapter.quests) {
        if (quest.kind !== "compound") {
          continue;
        }
        const raw = stringField(quest, "id");
        if (raw === null || !HEX_ID.test(raw)) {
          this.report.error({
            code: "malformed-id",
            message: `a quest in ${chapter.path} names id ${describeRaw(raw)}, which is not a 16-hex id`,
            path: chapter.path,
            line: quest.line,
            key: "id",
            value: raw,
          });
          continue;
        }
        const id = raw.toLowerCase();
        const clash = this.quests.get(id);
        if (clash !== undefined) {
          this.report.error({
            code: "id-collision",
            message: `two quests claim ${id} (${clash.chapter} and ${chapter.path})`,
            path: chapter.path,
            line: quest.line,
            key: "id",
          });
          continue;
        }
        this.quests.set(id, { source: raw, id, chapter: chapter.path });
        this.questOrder.push({ chapter: chapter.path, quest, id });
      }
    }
  }

  /**
   * Every task and reward id, mapped to its owning quest. First writing wins: these maps only
   * classify dependency edges (task or reward, whose owner), and a collision here is the quest
   * mapper's to untangle, not an identity of its own. Collisions warn naming both owners
   * rather than resolving silently.
   */
  indexTaskRewardIds(): void {
    for (const edge of this.questOrder) {
      this.indexOwnedIds(edge, "tasks", this.tasks);
      this.indexOwnedIds(edge, "rewards", this.rewards);
    }
  }

  private indexOwnedIds(
    edge: { chapter: string; quest: SnbtNode; id: string },
    listKey: string,
    into: Map<string, TaskIdEntry>,
  ): void {
    const list = snbtGet(edge.quest, listKey);
    if (list === undefined || list.kind !== "list") {
      return;
    }
    for (const item of list.items) {
      if (item.kind !== "compound") {
        continue;
      }
      const raw = stringField(item, "id");
      if (raw === null) {
        continue;
      }
      const clash = into.get(raw.toLowerCase());
      if (clash !== undefined) {
        this.report.warn({
          code: "duplicate-task-id",
          message: `two ${listKey === "tasks" ? "tasks" : "rewards"} claim ${raw.toLowerCase()} (quests ${clash.owner} and ${edge.id}); gates on it read the first`,
          path: edge.chapter,
          line: item.line,
          key: "id",
          value: raw,
        });
        continue;
      }
      into.set(raw.toLowerCase(), {
        source: raw,
        id: raw.toLowerCase(),
        owner: edge.id,
        chapter: edge.chapter,
      });
    }
  }

  validateQuestEdges(): void {
    for (const edge of this.questOrder) {
      this.dependencies(edge.chapter, edge.quest, edge.id);
      this.rewardTables(edge.chapter, edge.quest, edge.id);
    }
  }

  private dependencies(chapter: string, quest: SnbtNode, id: string): void {
    const deps = snbtGet(quest, "dependencies");
    if (deps === undefined || deps.kind !== "list") {
      return;
    }
    // Edges may point at quests indexed from any chapter, so resolve against the finished
    // map; building it once per quest rather than once per edge.
    const snapshot = this.finish();
    for (const dep of deps.items) {
      if (dep.kind !== "string") {
        this.report.error({
          code: "malformed-reference",
          message: `the quest ${id} depends on something that is not a quest id`,
          path: chapter,
          line: dep.line,
          key: "dependencies",
        });
        continue;
      }
      if (resolveQuestRef(snapshot, dep.value) !== null) {
        continue;
      }
      const lowered = dep.value.toLowerCase();
      const task = this.tasks.get(lowered);
      if (task !== undefined) {
        this.deadEdges.push({
          quest: id,
          ref: dep.value,
          kind: "task",
          owner: task.owner,
          chapter,
          line: dep.line,
        });
        continue;
      }
      const reward = this.rewards.get(lowered);
      if (reward !== undefined) {
        this.deadEdges.push({
          quest: id,
          ref: dep.value,
          kind: "reward",
          owner: reward.owner,
          chapter,
          line: dep.line,
        });
        continue;
      }
      // A dependency on a chapter id fails outright: chapters do complete, so the edge may
      // satisfy in FTB, and no Tenet quest edge can carry it. An author rewires it by hand.
      const chapterHit = this.chapters.get(lowered);
      if (chapterHit !== undefined) {
        this.report.error({
          code: "chapter-reference",
          message: `the quest ${id} depends on ${dep.value}, which is the chapter id of ${chapterHit.file}: quests cannot depend on chapters, so this edge needs an author to rewire it`,
          path: chapter,
          line: dep.line,
          key: "dependencies",
          value: dep.value,
        });
        continue;
      }
      this.report.error({
        code: "dangling-reference",
        message: `the quest ${id} depends on ${dep.value}, which resolves to no quest`,
        path: chapter,
        line: dep.line,
        key: "dependencies",
        value: dep.value,
      });
    }
  }

  private rewardTables(chapter: string, quest: SnbtNode, id: string): void {
    const rewards = snbtGet(quest, "rewards");
    if (rewards === undefined || rewards.kind !== "list") {
      return;
    }
    for (const reward of rewards.items) {
      if (reward.kind !== "compound") {
        continue;
      }
      const table = snbtGet(reward, "table_id");
      if (table === undefined) {
        continue;
      }
      const numeric = tableIdValue(table);
      if (numeric === null) {
        this.report.error({
          code: "malformed-reference",
          message: `a reward of the quest ${id} names a table_id that is not a number`,
          path: chapter,
          line: table.line,
          key: "table_id",
        });
        continue;
      }
      const hex = remapTableId(numeric);
      const hit = this.tables.get(hex);
      if (hit === undefined) {
        this.report.error({
          code: "dangling-reference",
          message: `a reward of the quest ${id} names table_id ${numeric} (table ${hex}), which matches no reward-table file`,
          path: chapter,
          line: table.line,
          key: "table_id",
          value: table.kind === "string" ? table.value : numeric.toString(),
        });
      }
    }
  }
}

function stringField(node: SnbtNode, key: string): string | null {
  const child = snbtGet(node, key);
  return child !== undefined && child.kind === "string" ? child.value : null;
}

function describeRaw(raw: string | null): string {
  return raw === null ? "nothing" : JSON.stringify(raw);
}

/**
 * A `table_id` as its number: a long or int straight, or the uppercase-`L` string FTB writes
 * (`2217624173230631680L`) read for its digits. Anything else is not a table reference.
 */
function tableIdValue(node: SnbtNode): bigint | null {
  if (node.kind === "long" || node.kind === "int" || node.kind === "short" || node.kind === "byte") {
    return node.value;
  }
  if (node.kind === "string" && /^\d+[lL]$/.test(node.value)) {
    return BigInt(node.value.slice(0, -1));
  }
  return null;
}
