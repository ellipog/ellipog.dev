/**
 * Chapter gates: a quest depending on a whole chapter, rewritten without losing the gate.
 *
 * <h2>Why a synthesised quest, and why it is exact</h2>
 *
 * FTB lets a quest's `dependencies` name a chapter id, meaning "this unlocks when that
 * whole chapter is complete". Tenet gates quests on quests only, so no Tenet edge can
 * carry that directly — and the three cheap readings are all wrong. Dropping the edge
 * unlocks the quest from the start. Fanning out onto every quest in the chapter breaks
 * `one_completed` and `min_required_dependencies` counting (the chapter counts as one
 * entry in FTB; fan-out makes it N). Lifting the edge onto the containing chapter's own
 * `dependsOn` over-locks: it would gate every sibling quest, not just the one that asked.
 *
 * The fourth reading is exact. A chapter is complete in FTB once its required quests are
 * done — optional quests never count, repeatable ones are never done-for-good — which is
 * exactly the set this converter already writes to Tenet's `completesWhen`. So each
 * referenced chapter gains one taskless quest whose `dependsOn` is that same set, and
 * each chapter edge retargets onto it. Tenet blesses the shape explicitly: a taskless
 * quest with a dependant "completes on the tick its gate opens, with no press on it".
 * The retargeted quest keeps its own `prerequisiteMode` and `minRequired` untouched —
 * the gate is one entry, exactly as the chapter was — so counting survives in all four
 * modes.
 *
 * <h2>The started bar</h2>
 *
 * A referrer asking `all_started` or `one_started` waits on the chapter being *started*,
 * which FTB marks when any of its quests gets going — optionals included. That gate
 * waits `all_started` over *every* quest in the chapter instead of the milestone set,
 * and is only synthesised when a referrer actually asks for it (a second gate beside
 * the completed one, never instead of it).
 *
 * <h2>What stays an error</h2>
 *
 * A cycle running through a gate is broken input: FTB expands chapter references the
 * same way when it verifies dependencies, so such a pack deadlocks there too. It fails
 * naming the chain. Cycles nowhere near a gate are out of scope — Tenet reports those
 * at load exactly as it did before this module existed.
 */

import type { ChapterEdge, IdMap } from "./ids";
import type { LangPool } from "./lang";
import type { ChapterInput, QuestBookInput } from "./model";
import type { Report } from "./report";
import { SnbtNode, snbtGet } from "./snbt";
import { SlugMaps, claimSlug } from "./slugs";

/** Which bar of a chapter a gate (or a referrer) asks for. */
export type GateBar = "completed" | "started";

export interface PlannedGate {
  /** Lowercase chapter id this gate stands for. */
  readonly chapterHex: string;
  readonly chapterSlug: string;
  readonly bar: GateBar;
  /** The claimed Tenet id, file stem and `dependsOn` target. */
  readonly slug: string;
  readonly title: string;
  /** Milestone quest slugs in authored order (empty: the chapter is trivially done). */
  readonly dependsOn: ReadonlyArray<string>;
}

/** Gate slugs by chapter hex. Both arms optional: a missing arm fails loudly at retarget. */
export interface GateSlugs {
  readonly completed?: string;
  readonly started?: string;
}

export interface GatePlan {
  /** Gates in planning order: chapters by first reference, completed arm before started. */
  readonly gates: ReadonlyArray<PlannedGate>;
  readonly slugsByChapter: ReadonlyMap<string, GateSlugs>;
}

/** The plan for a book with no chapter edges: shared, never mutated. */
export const EMPTY_GATES: GatePlan = { gates: [], slugsByChapter: new Map() };

/**
 * The bar a quest's own `dependency_requirement` asks of its edges: the two `*_started`
 * modes wait on starts, everything else (absent included) on completions. An unknown
 * word reads as completed here; questFlags refuses it separately, so the gate plan never
 * invents a second failure for one field.
 */
export function dependencyBar(node: SnbtNode): GateBar {
  const mode = snbtGet(node, "dependency_requirement");
  if (
    mode !== undefined &&
    mode.kind === "string" &&
    (mode.value === "all_started" || mode.value === "one_started")
  ) {
    return "started";
  }
  return "completed";
}

/**
 * One gate per referenced chapter and bar, slugs claimed after every authored slug so a
 * synthesis can never steal an author's name. Notes every gate naming its referrers —
 * a rewrite, so the report carries it. Never errors: a dangling chapter already failed
 * the run in ids, so skipping one here only fires on a run that already fails.
 */
export function planChapterGates(
  book: QuestBookInput,
  ids: IdMap,
  slugs: SlugMaps,
  pool: LangPool,
  report: Report,
): GatePlan {
  if (ids.chapterEdges.length === 0) {
    return EMPTY_GATES;
  }
  const chapters = new Map<string, ChapterInput>();
  for (const chapter of book.chapters) {
    const hex = (chapter.id ?? "").toLowerCase();
    if (hex !== "" && !chapters.has(hex)) {
      chapters.set(hex, chapter);
    }
  }
  // Bars needed per chapter, chapters in first-reference order: chapterEdges record in
  // authored order (chapters sorted by path, quests in order), so the plan is stable.
  const needed = new Map<string, { completed: boolean; started: boolean }>();
  const referrers = new Map<string, Array<ChapterEdge>>();
  for (const edge of ids.chapterEdges) {
    const need = needed.get(edge.chapter) ?? { completed: false, started: false };
    if (edge.bar === "started") {
      need.started = true;
    } else {
      need.completed = true;
    }
    needed.set(edge.chapter, need);
    const list = referrers.get(edge.chapter) ?? [];
    list.push(edge);
    referrers.set(edge.chapter, list);
  }
  const taken = new Set<string>();
  for (const map of [slugs.groups, slugs.chapters, slugs.quests, slugs.tables, slugs.images, slugs.links]) {
    for (const slug of map.values()) {
      taken.add(slug);
    }
  }
  const gates: Array<PlannedGate> = [];
  const slugsByChapter = new Map<string, GateSlugs>();
  for (const [hex, need] of needed) {
    const chapter = chapters.get(hex);
    const entry = ids.chapters.get(hex);
    if (chapter === undefined || entry === undefined) {
      continue;
    }
    const chapterSlug = slugs.chapters.get(hex) ?? hex;
    const chapterTitle = pool.chapterTitle(entry.source) ?? chapterSlug;
    const entrySlugs: { completed?: string; started?: string } = {};
    // Completed arm first: the common case reads first in every listing.
    const order: ReadonlyArray<GateBar> = need.completed && need.started
      ? ["completed", "started"]
      : need.started
        ? ["started"]
        : ["completed"];
    for (const bar of order) {
      const base = bar === "completed" ? `gate_${chapterSlug}` : `gate_${chapterSlug}_started`;
      const slug = claimSlug(taken, base, `gate_${hex.slice(0, 8)}`);
      const dependsOn = milestoneSlugs(chapter, slugs, bar === "started");
      gates.push({
        chapterHex: hex,
        chapterSlug,
        bar,
        slug,
        title: bar === "completed" ? `Complete ${chapterTitle}` : `Start ${chapterTitle}`,
        dependsOn,
      });
      if (bar === "completed") {
        entrySlugs.completed = slug;
      } else {
        entrySlugs.started = slug;
      }
      report.note({
        code: "chapter-gate",
        message: gateMessage(chapter.path, slug, bar, dependsOn.length, chapterTitle, referrers.get(hex) ?? []),
        path: chapter.path,
        line: chapter.node.line,
        value: slug,
      });
    }
    slugsByChapter.set(hex, entrySlugs);
  }
  return { gates, slugsByChapter };
}

function gateMessage(
  chapterPath: string,
  slug: string,
  bar: GateBar,
  milestoneCount: number,
  chapterTitle: string,
  referrers: ReadonlyArray<ChapterEdge>,
): string {
  const mine = referrers.filter((edge) => edge.bar === bar);
  const who = mine.map((edge) => `${edge.quest} (${edge.file}:${edge.line})`).join(", ");
  const single = mine.length === 1;
  const done = bar === "completed"
    ? milestoneCount === 0
      ? "is already complete: the chapter has no required quests"
      : `completes when the chapter's ${milestoneCount} required quest${milestoneCount === 1 ? "" : "s"} do`
    : `starts when any of the chapter's quests does`;
  const gateTitle = bar === "completed" ? `Complete ${chapterTitle}` : `Start ${chapterTitle}`;
  return `chapter ${chapterPath} gains the gate quest ${slug} ("${gateTitle}"), which ${done}: ${who} ${single ? "waits" : "wait"} on the chapter, so ${single ? "it waits" : "they wait"} on ${slug} instead`;
}

/**
 * The chapterMilestones rule, read leniently: malformed flags are resolveQuest's (and
 * chapterMilestones') to refuse, so on a run already failing, unset is the only reading
 * that lets planning finish deterministically. Silent here, authoritative there — never
 * reported twice.
 */
function milestoneSlugs(chapter: ChapterInput, slugs: SlugMaps, includeOptional: boolean): Array<string> {
  const repeatDefault = flagValue(snbtGet(chapter.node, "default_repeatable_quest"));
  const out: Array<string> = [];
  for (const quest of chapter.quests) {
    if (quest.kind !== "compound") {
      continue;
    }
    if (!includeOptional) {
      if (flagValue(snbtGet(quest, "optional"))) {
        continue;
      }
      if (repeatValue(snbtGet(quest, "can_repeat"), repeatDefault)) {
        continue;
      }
    }
    const raw = snbtGet(quest, "id");
    const hex = raw !== undefined && raw.kind === "string" ? raw.value.toLowerCase() : "";
    // Slugless means ids already failed this quest: skip it here, report it there.
    const slug = hex === "" ? undefined : slugs.quests.get(hex);
    if (slug === undefined) {
      continue;
    }
    out.push(slug);
  }
  return out;
}

function flagValue(child: SnbtNode | undefined): boolean {
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

function repeatValue(child: SnbtNode | undefined, repeatDefault: boolean): boolean {
  if (child === undefined) {
    return repeatDefault;
  }
  if (child.kind === "boolean") {
    return child.value;
  }
  if (child.kind === "byte" && (child.value === 0n || child.value === 1n)) {
    return child.value === 1n;
  }
  return repeatDefault;
}

/**
 * Cycles running through a gate quest fail naming the chain. Iterative — a pathological
 * book must not cost the call stack — over the emitted slug graph (quest and gate
 * `dependsOn` alike), in graph order, so the first chain found is stable run to run.
 * Quest-only cycles are out of scope: Tenet reports those at load exactly as before.
 */
export function checkGateCycles(
  graph: ReadonlyMap<string, { readonly deps: ReadonlyArray<string>; readonly path: string }>,
  gateSlugs: ReadonlySet<string>,
  report: Report,
): void {
  if (gateSlugs.size === 0) {
    return;
  }
  const reported = new Set<string>();
  // 1 = on the current stack, 2 = walked.
  const state = new Map<string, number>();
  const stack: Array<string> = [];
  const position = new Map<string, number>();
  for (const root of graph.keys()) {
    if (state.has(root)) {
      continue;
    }
    const work: Array<{ node: string; next: number }> = [{ node: root, next: 0 }];
    state.set(root, 1);
    position.set(root, stack.length);
    stack.push(root);
    while (work.length > 0) {
      const top = work[work.length - 1] as { node: string; next: number };
      const deps = graph.get(top.node)?.deps ?? [];
      if (top.next >= deps.length) {
        work.pop();
        stack.pop();
        position.delete(top.node);
        state.set(top.node, 2);
        continue;
      }
      const dep = deps[top.next] as string;
      top.next += 1;
      if (!graph.has(dep)) {
        continue;
      }
      const seen = state.get(dep);
      if (seen === 1) {
        const cycle = [...stack.slice(position.get(dep) as number), dep];
        if (cycle.some((id) => gateSlugs.has(id))) {
          const key = canonicalCycle(cycle);
          if (!reported.has(key)) {
            reported.add(key);
            const gate = cycle.find((id) => gateSlugs.has(id)) as string;
            report.error({
              code: "dependency-cycle",
              message: `a dependency cycle runs through the gate quest ${gate}: ${cycle.join(" -> ")}`,
              path: graph.get(top.node)?.path ?? "",
              key: "dependencies",
              value: gate,
            });
          }
        }
      } else if (seen === undefined) {
        state.set(dep, 1);
        position.set(dep, stack.length);
        stack.push(dep);
        work.push({ node: dep, next: 0 });
      }
    }
  }
}

/** One key per directed cycle regardless of where discovery entered it. */
function canonicalCycle(cycle: ReadonlyArray<string>): string {
  const ring = cycle.slice(0, -1);
  let best = -1;
  for (let i = 0; i < ring.length; i += 1) {
    if (best < 0 || (ring[i] as string) < (ring[best] as string)) {
      best = i;
    }
  }
  const rotated: Array<string> = [];
  for (let i = 0; i < ring.length; i += 1) {
    rotated.push(ring[(best + i) % ring.length] as string);
  }
  return rotated.join("\0");
}
