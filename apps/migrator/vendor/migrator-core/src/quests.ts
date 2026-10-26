/**
 * Quests: one FTB quest into its Tenet file, positioned on its chapter's canvas.
 *
 * <h2>Task gates lift to their owning quest</h2>
 *
 * A dependency may name any QuestObject: quests, but also tasks and rewards
 * (`Quest.dependencies` holds whatever `file.get(id)` finds). Tenet gates quests on
 * quests only, so a task or reward gate has no direct Tenet edge. The converter lifts
 * each such gate onto the quest owning that task or reward — the progression-safe
 * reading: the gate stays a gate, in authored order, and the report names every lift
 * with both sides. A lifted gate is strictly stronger than the FTB original (the whole
 * owning quest instead of one of its tasks), which keeps the questline order intact;
 * dropping it would silently open the quest instead. Where the same quest is already
 * named directly beside the task gate (five of the nine AE2 quests in ATM10), the pair
 * collapses onto the one quest and the collapse is noted. A gate lifting onto the
 * quest itself would loop, so that one drops with the same note.
 *
 * <h2>Titles</h2>
 *
 * The lang title wins; without one the first task's lang title stands in (exactly FTB's own
 * `getAltTitle` fallback); without that, a readable item name; without that, `Quest
 * <short-id>`. Every synthesis warns naming what stood in, because an invented title is
 * author work waiting, not content converted.
 *
 * <h2>Positions</h2>
 *
 * Resolution yields top-left corners (FTB centers shifted); `emitChapterQuests` then nudges
 * collisions chapter-wide so the converted canvas loads with zero duplicate-position
 * warnings. Order is authored order throughout: Tenet progress and linear chapters read it.
 */

import { DeadEdge, IdMap } from "./ids";
import { dependencyBar } from "./gates";
import type { GatePlan, GateSlugs, PlannedGate } from "./gates";
import { LangPool } from "./lang";
import { mapIcon } from "./icons";
import { ChapterInput } from "./model";
import { Report } from "./report";
import { readTagItems } from "./tags";
import {
  ChapterDefaults,
  FileDefaults,
  QuestResolution,
  clampIconScale,
  resolveQuest,
} from "./resolve";
import { GeomOptions } from "./geometry";
import { SnbtNode, snbtGet } from "./snbt";
import { mapReward, RewardContext } from "./rewards";
import { mapTask, TaskContext } from "./tasks";
import { nudgeDuplicates } from "./geometry";
import { SlugMaps, TitleOrigin, questTitleCandidate } from "./slugs";

export interface QuestContext {
  readonly questId: string;
  readonly sourceHex: string;
  readonly slug: string;
  readonly slugs: SlugMaps;
  readonly chapter: ChapterInput;
  readonly ids: IdMap;
  readonly lang: LangPool;
  readonly file: FileDefaults;
  readonly chapterDefaults: ChapterDefaults;
  readonly geom: GeomOptions;
  readonly report: Report;
  readonly deadEdges: ReadonlyArray<DeadEdge>;
  /** Chapter-hex to gate slugs, planned from the book's chapter edges. */
  readonly chapterGates: ReadonlyMap<string, GateSlugs>;
  /**
   * The exclusive group this quest's questsadditions `incompatible` list became, when it and
   * every quest it names lock each other within this chapter (see {@link exclusiveGroups}).
   */
  readonly exclusiveGroup?: string | undefined;
  /** Lowercase ids sharing that group, so the rest of the list can be told apart. */
  readonly exclusivePeers?: ReadonlySet<string> | undefined;
}

const PREREQUISITE_MODES: ReadonlySet<string> = new Set([
  "all_completed",
  "one_completed",
  "all_started",
  "one_started",
]);

/**
 * One quest node into its Tenet JSON (without nudging: single-quest callers like tests),
 * or null when it cannot convert (reported). Chapter loops use {@link emitChapterQuests},
 * which nudges positions across siblings first.
 */
export function mapQuest(node: SnbtNode, ctx: QuestContext): Record<string, unknown> | null {
  if (node.kind !== "compound") {
    return null;
  }
  const resolution = resolveQuest(node, ctx.chapterDefaults, ctx.file, ctx.geom, ctx.report, ctx.chapter.path);
  if (resolution === null) {
    return null;
  }
  return mapQuestBody(node, resolution, { x: resolution.x, y: resolution.y }, ctx);
}

export interface EmittedQuest {
  readonly filename: string;
  readonly json: Record<string, unknown>;
}

/** A chapter's quests mapped in authored order, positions nudged so none share a pixel. */
export function emitChapterQuests(
  chapter: ChapterInput,
  base: Omit<QuestContext, "questId" | "sourceHex" | "slug" | "deadEdges" | "chapterGates"> & {
    gates: GatePlan;
  },
  ids: IdMap,
): Array<EmittedQuest> {
  const resolved: Array<{ node: SnbtNode; id: string; source: string; resolution: QuestResolution }> = [];
  for (const quest of chapter.quests) {
    if (quest.kind !== "compound") {
      base.report.error({
        code: "malformed-quest",
        message: `a quest entry in ${chapter.path} is not an object`,
        path: chapter.path,
        line: quest.line,
      });
      continue;
    }
    const raw = snbtGet(quest, "id");
    const source = raw !== undefined && raw.kind === "string" ? raw.value : "";
    const id = source.toLowerCase();
    if (!ids.quests.has(id)) {
      continue;
    }
    const resolution = resolveQuest(quest, base.chapterDefaults, base.file, base.geom, base.report, chapter.path);
    if (resolution === null) {
      continue;
    }
    resolved.push({ node: quest, id, source, resolution });
  }
  const groups = exclusiveGroups(resolved);
  const nudged = nudgeDuplicates(resolved.map((entry) => ({ x: entry.resolution.x, y: entry.resolution.y })));
  const out: Array<EmittedQuest> = [];
  resolved.forEach((entry, index) => {
    const point = nudged[index] as { x: number; y: number; moved: boolean };
    if (point.moved) {
      base.report.note({
        code: "nudged-position",
        message: `the quest ${entry.id} shared its pixel; it sits one step down-right`,
        path: chapter.path,
        line: entry.node.line,
        key: entry.id,
      });
    }
    const slug = base.slugs.quests.get(entry.id) ?? entry.id;
    const ctx: QuestContext = {
      ...base,
      questId: entry.id,
      sourceHex: entry.source,
      slug,
      slugs: base.slugs,
      chapterGates: base.gates.slugsByChapter,
      deadEdges: ids.deadEdges.filter((edge) => edge.quest === entry.id),
      exclusiveGroup: groups.get(entry.id)?.name,
      exclusivePeers: groups.get(entry.id)?.members,
    };
    const json = mapQuestBody(entry.node, entry.resolution, { x: point.x, y: point.y }, ctx);
    if (json !== null) {
      out.push({ filename: `${slug}.json`, json });
    }
  });
  // Chapter gates land below the chapter's own quests in a deterministic row: the
  // positions are invented, so they sit out of the way rather than among authored
  // nodes, and the taken-set (every resolved pixel, mapped or not) keeps them off
  // any quest's pixel without moving anything the pack placed.
  const chapterHex = (chapter.id ?? "").toLowerCase();
  const chapterGates = base.gates.gates.filter((gate) => gate.chapterHex === chapterHex);
  if (chapterGates.length > 0) {
    let minX = 0;
    let maxY = -64;
    for (const point of nudged) {
      if (point.x < minX) {
        minX = point.x;
      }
      if (point.y > maxY) {
        maxY = point.y;
      }
    }
    const taken = new Set<string>(nudged.map((point) => `${point.x},${point.y}`));
    chapterGates.forEach((gate, index) => {
      let x = minX + index * 64;
      let y = maxY + 64;
      while (taken.has(`${x},${y}`)) {
        y += 64;
      }
      taken.add(`${x},${y}`);
      out.push(emitGateQuest(gate, x, y));
    });
  }
  return out;
}

/**
 * A planned gate into its Tenet file: id, title, position and gate edges only. No
 * tasks or rewards — a taskless quest with dependants loads quietly and completes on
 * the tick its gate opens — and no `dependsOn` key when the chapter has no required
 * quests (an empty rule is met). The completed arm omits its mode (the default); the
 * started arm writes `all_started`.
 */
function emitGateQuest(gate: PlannedGate, x: number, y: number): EmittedQuest {
  const json: Record<string, unknown> = {
    $schema: "https://ellipog.dev/tenet/_schema/quest.schema.json",
    id: gate.slug,
    title: gate.title,
    x,
    y,
  };
  if (gate.dependsOn.length > 0) {
    json["dependsOn"] = [...gate.dependsOn];
  }
  if (gate.bar === "started") {
    json["prerequisiteMode"] = "all_started";
  }
  return { filename: `${gate.slug}.json`, json };
}

function mapQuestBody(
  node: SnbtNode,
  resolution: QuestResolution,
  position: { x: number; y: number },
  ctx: QuestContext,
): Record<string, unknown> | null {
  const out: Record<string, unknown> = {
    $schema: "https://ellipog.dev/tenet/_schema/quest.schema.json",
    id: ctx.slug,
  };
  const title = questTitle(node, ctx);
  if (title === null) {
    return null;
  }
  out["title"] = title;
  const subtitle = ctx.lang.questSubtitle(ctx.sourceHex);
  if (subtitle !== null) {
    out["subtitle"] = subtitle;
  }
  const description = ctx.lang.questDescription(ctx.sourceHex);
  if (description !== null && description.some((line) => line.trim() !== "")) {
    out["description"] = [...description];
  }
  const icon = mapIcon(snbtGet(node, "icon"), ctx.report, ctx.chapter.path, `the quest ${ctx.questId}'s icon`);
  const tasks = questTasks(node, ctx);
  if (tasks === null) {
    return null;
  }
  if (icon !== null) {
    out["icon"] = icon;
  }
  // No fallback: a quest with no icon adopts its first task's picture at draw time, cycling
  // for filters (FTB's IconAnimation rule, resolved live). Writing one here would freeze the
  // rotation and block the adoption, so absence is the honest mapping.
  out["x"] = position.x;
  out["y"] = position.y;
  out["shape"] = resolution.shape;
  out["size"] = resolution.sizePx;
  const iconScale = readIconScale(node, ctx);
  if (iconScale === null) {
    return null;
  }
  out["iconScale"] = iconScale;
  const dependencies = questDependencies(node, ctx);
  if (dependencies === null) {
    return null;
  }
  const dependsOn = dependencies.slugs;
  if (dependsOn.length > 0) {
    out["dependsOn"] = dependsOn;
  }
  if (!questFlags(node, ctx, out, resolution)) {
    return null;
  }
  // Tenet refuses a minRequired above the dependency count at load; refuse it here
  // with the pack's own numbers instead of emitting a file Tenet would reject.
  const minRequired = out["minRequired"];
  if (typeof minRequired === "number" && minRequired > dependsOn.length && minRequired <= dependsOn.length + dependencies.liftedInto) {
    // The count is over only because task/reward gates lifted onto a quest already waited
    // on: FTB counted each of those edges, Tenet holds one. Waiting on every lifted quest is
    // the lift's own reading (the whole owning quest for its tasks), so the quest waits on all.
    ctx.report.warn({
      code: "lifted-min-required",
      message: `min_required_dependencies is ${minRequired}, counting task or reward gates that lift onto the ${dependsOn.length} quest${dependsOn.length === 1 ? "" : "s"} the quest now waits on; it waits on all of ${dependsOn.length === 1 ? "it" : "them"}, so it unlocks once the owning quests are done rather than those tasks`,
      path: ctx.chapter.path,
      line: (snbtGet(node, "min_required_dependencies") ?? node).line,
      key: "min_required_dependencies",
      value: minRequired,
    });
    out["minRequired"] = dependsOn.length;
  } else if (typeof minRequired === "number" && minRequired > dependsOn.length && ctx.report.lossy) {
    // FTB never unlocks it either; with loss allowed it waits on every dependency instead.
    ctx.report.warn({
      code: "clamped-min-required",
      message: `min_required_dependencies is ${minRequired} but the quest waits on only ${dependsOn.length}, so it could never unlock; with loss allowed it waits on all of them`,
      path: ctx.chapter.path,
      line: (snbtGet(node, "min_required_dependencies") ?? node).line,
      key: "min_required_dependencies",
      value: minRequired,
    });
    if (dependsOn.length > 0) {
      out["minRequired"] = dependsOn.length;
    } else {
      delete out["minRequired"];
    }
  } else if (typeof minRequired === "number" && minRequired > dependsOn.length) {
    const child = snbtGet(node, "min_required_dependencies") ?? node;
    fail(
      ctx,
      child,
      "min_required_dependencies",
      `min_required_dependencies is ${minRequired} but the quest waits on only ${dependsOn.length}, so it could never unlock`,
    );
    return null;
  }
  const required = requiredTasks(node, tasks, ctx);
  if (required === null) {
    return null;
  }
  if (required.length > 0) {
    out["tasks"] = required;
  }
  questIncompatible(node, ctx, out);
  const rewards = questRewards(node, ctx);
  if (rewards === null) {
    return null;
  }
  if (rewards.length > 0) {
    out["rewards"] = rewards;
  }
  return out;
}

function questTitle(node: SnbtNode, ctx: QuestContext): string | null {
  const direct = ctx.lang.questTitle(ctx.sourceHex);
  if (direct !== null) {
    return direct;
  }
  const candidate = questTitleCandidate(node, ctx.lang, ctx.sourceHex, ctx.questId);
  return synthesized(ctx, node, candidate.title, candidate.origin);
}

const ORIGIN_PHRASES: Record<TitleOrigin, string> = {
  "quest-lang": "its own words",
  "task-lang": "its first titled task",
  "task-content:item": "its first item task",
  "task-content:fluid": "its first fluid task",
  "task-content:kill": "its first kill task",
  "task-content:biome": "its first biome task",
  "task-content:structure": "its first structure task",
  "task-content:dimension": "its first dimension task",
  "task-content:title": "its first titled task row",
  icon: "its icon",
  reward: "its first reward",
  fallback: "nothing recognisable",
};

function synthesized(ctx: QuestContext, node: SnbtNode, title: string, origin: TitleOrigin): string {
  ctx.report.warn({
    code: "synthesised-title",
    message: `the quest ${ctx.questId} has no title; it reads ${JSON.stringify(title)} from ${ORIGIN_PHRASES[origin]} until an author words it`,
    path: ctx.chapter.path,
    line: node.line,
    key: "title",
    value: title,
  });
  return title;
}

function readIconScale(node: SnbtNode, ctx: QuestContext): number | null {
  const child = snbtGet(node, "icon_scale");
  // FTB reads this key through a TAG_DOUBLE guard: an int form is ignored there and here.
  const raw = child !== undefined && child.kind === "double" ? child.value : 1.0;
  if (!Number.isFinite(raw)) {
    fail(ctx, child ?? node, "icon_scale", "icon scale is not a finite number");
    return null;
  }
  const clamped = clampIconScale(raw, ctx.report, ctx.chapter.path, child?.line ?? node.line);
  return clamped.value;
}

/**
 * The quest slugs a quest waits on, and how many source edges folded into one already there
 * through a lifted task/reward gate. FTB counts each of those edges toward
 * `min_required_dependencies`; after the lift they are one Tenet edge.
 */
interface Dependencies {
  readonly slugs: ReadonlyArray<string>;
  readonly liftedInto: number;
}

function questDependencies(node: SnbtNode, ctx: QuestContext): Dependencies | null {
  const deps = snbtGet(node, "dependencies");
  if (deps === undefined) {
    return { slugs: [], liftedInto: 0 };
  }
  if (deps.kind !== "list") {
    fail(ctx, deps, "dependencies", "dependencies is not a list");
    return null;
  }
  const rewritten = new Map<string, string>();
  for (const edge of ctx.deadEdges) {
    if (edge.owner === ctx.questId) {
      rewritten.set(edge.ref.toLowerCase(), "");
    } else {
      rewritten.set(edge.ref.toLowerCase(), edge.owner);
    }
  }
  const out: Array<string> = [];
  // Dedupe on the emitted slug only: hex spellings and slugs live in different
  // namespaces, so mixing them in one set can collapse two distinct edges.
  // Slugs arriving through a lifted task/reward gate remember it: a collapse between a
  // lifted gate and the quest edge beside it is the lift itself (already named by the
  // rewritten-dead-edge note), not an author writing one quest twice.
  const seen = new Set<string>();
  const lifted = new Set<string>();
  let liftedInto = 0;
  for (const dep of deps.items) {
    if (dep.kind !== "string") {
      fail(ctx, dep, "dependencies", "a dependency is not a quest id");
      return null;
    }
    let target = dep.value.toLowerCase();
    const rewrite = rewritten.get(target);
    if (rewrite !== undefined) {
      target = rewrite;
    }
    if (target === "") {
      continue;
    }
    // Every dependency names its assumed name: the slug the target quest file carries.
    let slug = ctx.slugs.quests.get(target);
    if (slug === undefined) {
      // A chapter id retargets onto the chapter's gate quest, planned from the book's
      // chapter edges: the gate completes exactly when the chapter does, so the edge
      // keeps its meaning — and its single place in prerequisiteMode/minRequired
      // counting. Anything else names nothing and fails here.
      const gate = ctx.chapterGates.get(target);
      const gated = gate === undefined
        ? undefined
        : dependencyBar(node) === "started"
          ? (gate.started ?? gate.completed)
          : gate.completed;
      if (gated === undefined) {
        fail(ctx, dep, "dependencies", `the quest depends on ${dep.value}, which resolves to no quest`);
        return null;
      }
      slug = gated;
    }
    if (slug === ctx.slug) {
      fail(ctx, dep, "dependencies", "the quest depends on itself, so it could never start");
      return null;
    }
    if (seen.has(slug)) {
      // A collapse onto an already-waited quest through a lifted task/reward gate is
      // the lift itself, already named by the rewritten-dead-edge note below — not a
      // second report. Only two original quest edges naming one quest warn here.
      if (rewrite !== undefined || lifted.has(slug)) {
        liftedInto += 1;
      } else {
        ctx.report.note({
          code: "duplicate-dependency",
          message: `the quest ${ctx.questId} names ${dep.value} twice; it waits once`,
          path: ctx.chapter.path,
          line: dep.line,
          key: "dependencies",
          value: dep.value,
        });
      }
      continue;
    }
    seen.add(slug);
    if (rewrite !== undefined) {
      lifted.add(slug);
    }
    out.push(slug);
  }
  if (rewritten.size > 0) {
    const pairs = [...rewritten.entries()].map(([from, to]) =>
      to === "" ? `${from} (dropped: a quest cannot wait on itself)` : `${from} waits on ${to}`,
    );
    ctx.report.note({
      code: "rewritten-dead-edge",
      message: `the quest ${ctx.questId} gated on task or reward ids, which Tenet cannot gate on: ${pairs.join("; ")} (lifted onto the owning quests)`,
      path: ctx.chapter.path,
      line: deps.line,
      key: "dependencies",
    });
  }
  return { slugs: out, liftedInto };
}

function questFlags(
  node: SnbtNode,
  ctx: QuestContext,
  out: Record<string, unknown>,
  resolution: QuestResolution,
): boolean {
  const mode = snbtGet(node, "dependency_requirement");
  if (mode !== undefined) {
    if (mode.kind !== "string") {
      fail(ctx, mode, "dependency_requirement", "dependency_requirement is not text");
      return false;
    }
    if (
      mode.value !== "all_completed" &&
      mode.value !== "one_completed" &&
      mode.value !== "all_started" &&
      mode.value !== "one_started"
    ) {
      fail(
        ctx,
        mode,
        "dependency_requirement",
        `dependency_requirement ${JSON.stringify(mode.value)} names no prerequisite mode`,
      );
      return false;
    }
    if (mode.value !== "all_completed") {
      out["prerequisiteMode"] = mode.value;
    }
  }
  const minRequired = snbtGet(node, "min_required_dependencies");
  if (minRequired !== undefined) {
    const value = wholeNumber(minRequired, ctx, "min_required_dependencies");
    if (value === null) {
      return false;
    }
    if (value < 0) {
      fail(ctx, minRequired, "min_required_dependencies", "a negative minimum means nothing");
      return false;
    }
    if (value > 0) {
      out["minRequired"] = value;
    }
  }
  const maxDependents = snbtGet(node, "max_completable_dependents");
  if (maxDependents !== undefined) {
    const value = wholeNumber(maxDependents, ctx, "max_completable_dependents");
    if (value === null) {
      return false;
    }
    if (value < 0) {
      fail(ctx, maxDependents, "max_completable_dependents", "a negative maximum means nothing");
      return false;
    }
    if (value > 0) {
      out["maxCompletableDependents"] = value;
    }
  }
  if (readBool(node, "optional", ctx)) {
    out["optional"] = true;
  }
  if (readBool(node, "invisible", ctx)) {
    out["invisible"] = true;
  }
  const invisibleUntil = snbtGet(node, "invisible_until_tasks");
  if (invisibleUntil !== undefined) {
    const value = wholeNumber(invisibleUntil, ctx, "invisible_until_tasks");
    if (value === null || value < 0) {
      fail(ctx, invisibleUntil, "invisible_until_tasks", "invisible_until_tasks is not a count");
      return false;
    }
    if (value > 0) {
      out["invisibleUntilTasks"] = value;
    }
  }
  if (readBool(node, "secret", ctx)) {
    // questsadditions hides a secret quest until it is completed (MixinQuest.isVisible), ahead
    // of FTB's own rules: Tenet's invisible, with nothing unhiding it early.
    out["invisible"] = true;
    delete out["invisibleUntilTasks"];
    ctx.report.note({
      code: "secret-quest",
      message: `the quest ${ctx.questId} is secret (questsadditions), hidden until done; it reads as invisible`,
      path: ctx.chapter.path,
      line: (snbtGet(node, "secret") ?? node).line,
      key: "secret",
    });
  }
  emitFlag(out, "hideUntilDependenciesVisible", resolution.hideUntilDepsVisible, ctx.chapterDefaults.hideUntilDepsVisible);
  emitFlag(out, "hideUntilDependenciesComplete", resolution.hideUntilDepsComplete, ctx.chapterDefaults.hideUntilDepsComplete);
  emitFlag(out, "hideTextUntilComplete", resolution.hideTextUntilComplete, ctx.chapterDefaults.hideTextUntilComplete);
  emitFlag(out, "hideDetailsUntilStartable", resolution.hideDetailsUntilStartable, ctx.chapterDefaults.hideDetailsUntilStartable);
  emitFlag(out, "hideDependencyLines", resolution.hideDependencyLines, ctx.chapterDefaults.hideDependencyLines);
  if (readBool(node, "hide_dependent_lines", ctx)) {
    out["hideDependentLines"] = true;
  }
  if (resolution.sequential !== null) {
    out["sequentialTasks"] = resolution.sequential;
  }
  if (resolution.repeatable) {
    out["repeatable"] = true;
  }
  const cooldown = snbtGet(node, "repeat_cooldown");
  if (cooldown !== undefined) {
    const seconds =
      cooldown.kind === "float" || cooldown.kind === "double"
        ? cooldown.value
        : cooldown.kind === "byte" || cooldown.kind === "short" || cooldown.kind === "int" || cooldown.kind === "long"
          ? Number(cooldown.value)
          : null;
    if (seconds === null || !Number.isFinite(seconds) || seconds < 0) {
      fail(ctx, cooldown, "repeat_cooldown", "repeat_cooldown is not a number of seconds");
      return false;
    }
    const ticks = Math.round(seconds * 20);
    if (ticks > 0) {
      if (!resolution.repeatable) {
        ctx.report.note({
          code: "inert-cooldown",
          message: `the quest ${ctx.questId} sets a repeat cooldown without repeating; it travels nowhere`,
          path: ctx.chapter.path,
          line: cooldown.line,
          key: "repeat_cooldown",
        });
      } else {
        out["repeatCooldownTicks"] = ticks;
      }
    }
  }
  if (resolution.flexibleProgress !== null) {
    out["flexibleProgress"] = resolution.flexibleProgress;
  }
  const minWidth = snbtGet(node, "min_width");
  if (minWidth !== undefined) {
    const value = wholeNumber(minWidth, ctx, "min_width");
    if (value === null || value < 0) {
      fail(ctx, minWidth, "min_width", "min_width is not a pixel count");
      return false;
    }
    if (value > 3000) {
      ctx.report.warn({
        code: "clamped-min-width",
        message: `the quest ${ctx.questId} asks for ${value}px, over Tenet's 3000; it reads 3000`,
        path: ctx.chapter.path,
        line: minWidth.line,
        key: "min_width",
        value,
      });
      out["minWidth"] = 3000;
    } else if (value > 0) {
      out["minWidth"] = value;
    }
  }
  if (readBool(node, "hide_lock_icon", ctx)) {
    out["hideLockIcon"] = true;
  }
  const disableViewers = snbtGet(node, "disable_recipe_mod");
  if (disableViewers !== undefined) {
    if (disableViewers.kind !== "boolean") {
      fail(ctx, disableViewers, "disable_recipe_mod", "disable_recipe_mod is not true or false");
      return false;
    }
    out["disableRecipeMod"] = disableViewers.value;
  }
  const guide = snbtGet(node, "guide_page");
  if (guide !== undefined && guide.kind === "string" && guide.value !== "") {
    out["guidePage"] = guide.value;
  }
  const tags = snbtGet(node, "tags");
  if (tags !== undefined) {
    if (tags.kind !== "list") {
      fail(ctx, tags, "tags", "tags is not a list");
      return false;
    }
    const out2 = readTagItems(tags.items, ctx.report, ctx.chapter.path, `the quest ${ctx.questId}`);
    if (out2.length > 0) {
      out["tags"] = out2;
    }
  }
  if (readBool(node, "ignore_reward_blocking", ctx)) {
    out["ignoreRewardBlocking"] = true;
  }
  if (readBool(node, "disable_toast", ctx)) {
    out["disableToast"] = true;
  }
  const control = snbtGet(node, "dep_control_pts");
  if (control !== undefined) {
    // Tenet draws its own routes: control points have no home, and dropping them changes
    // no gate, only the curve of a line.
    ctx.report.note({
      code: "dep-control-pts",
      message: `the quest ${ctx.questId} bends its dependency lines by hand; Tenet draws its own routes`,
      path: ctx.chapter.path,
      line: control.line,
      key: "dep_control_pts",
    });
  }
  return true;
}

/**
 * questsadditions' `min_required_tasks`: the quest completes once that many of its tasks are
 * (MixinQuest.isCompletedRaw), where Tenet completes on all of them. "Any one of these items"
 * is a filter Tenet can say exactly, so plain one-of-each item tasks fold into one
 * `or(item(a)item(b))` filter task; anything else keeps every task, and the quest asks for more.
 */
function requiredTasks(
  node: SnbtNode,
  tasks: Array<Record<string, unknown>>,
  ctx: QuestContext,
): Array<Record<string, unknown>> | null {
  const raw = snbtGet(node, "min_required_tasks");
  if (raw === undefined) {
    return tasks;
  }
  const value = wholeNumber(raw, ctx, "min_required_tasks");
  if (value === null) {
    return null;
  }
  if (value <= 0 || value >= tasks.length) {
    return tasks;
  }
  const plain = tasks.every(
    (task) =>
      task["type"] === "tenet:item" &&
      Object.keys(task).every((key) => key === "type" || key === "item" || key === "match" || key === "title") &&
      (task["match"] === undefined || task["match"] === "none"),
  );
  if (value === 1 && plain) {
    const items = [...new Set(tasks.map((task) => String(task["item"])))];
    ctx.report.note({
      code: "min-required-tasks",
      message: `the quest ${ctx.questId} completes on any one of its ${tasks.length} item tasks (questsadditions); they read as one filter task for any of ${items.join(", ")}`,
      path: ctx.chapter.path,
      line: raw.line,
      key: "min_required_tasks",
    });
    return [{ type: "tenet:filter", filter: `or(${items.map((item) => `item(${item})`).join("")})` }];
  }
  ctx.report.warn({
    code: "min-required-tasks",
    message: `the quest ${ctx.questId} completes on any ${value} of its ${tasks.length} tasks (questsadditions); Tenet completes a quest on all of them, so it asks for every one`,
    path: ctx.chapter.path,
    line: raw.line,
    key: "min_required_tasks",
    value,
  });
  return tasks;
}

/**
 * questsadditions' `incompatible`: this quest cannot start once any quest it names is done
 * (MixinTeamData.canStartTasks), one way only. Tenet's exclusive group is the two-way form
 * within a chapter, so it covers exactly the quests that all name each other there; any other
 * named quest leaves this one open after it completes, which the warning says.
 */
function questIncompatible(node: SnbtNode, ctx: QuestContext, out: Record<string, unknown>): void {
  const list = snbtGet(node, "incompatible");
  if (list === undefined || list.kind !== "list") {
    return;
  }
  if (ctx.exclusiveGroup !== undefined) {
    out["exclusiveGroup"] = ctx.exclusiveGroup;
  }
  const open = list.items
    .map((item) => (item.kind === "string" ? item.value.toLowerCase() : ""))
    .filter((id) => id !== "" && !(ctx.exclusivePeers?.has(id) ?? false));
  if (ctx.exclusiveGroup !== undefined) {
    ctx.report.note({
      code: "exclusive-group",
      message: `the quest ${ctx.questId} and the quests it is incompatible with lock each other (questsadditions); they share the exclusive group ${ctx.exclusiveGroup}`,
      path: ctx.chapter.path,
      line: list.line,
      key: "incompatible",
    });
  }
  if (open.length > 0) {
    const names = open.map((id) => ctx.slugs.quests.get(id) ?? id);
    ctx.report.warn({
      code: "incompatible-quest",
      message: `the quest ${ctx.questId} locks once ${names.join(", ")} ${open.length === 1 ? "is" : "are"} done (questsadditions, one way); Tenet locks only both ways within a chapter, so it stays open`,
      path: ctx.chapter.path,
      line: list.line,
      key: "incompatible",
      value: names,
    });
  }
}

/**
 * Exclusive groups for a chapter: the quests whose questsadditions `incompatible` lists all
 * name each other, every pair both ways, in this chapter. Each such set locks as Tenet's
 * exclusive group does; the group is named for its lowest id.
 */
function exclusiveGroups(
  resolved: ReadonlyArray<{ readonly node: SnbtNode; readonly id: string }>,
): Map<string, { name: string; members: ReadonlySet<string> }> {
  const names = new Map<string, Set<string>>();
  for (const entry of resolved) {
    const list = snbtGet(entry.node, "incompatible");
    if (list !== undefined && list.kind === "list") {
      names.set(
        entry.id,
        new Set(list.items.map((item) => (item.kind === "string" ? item.value.toLowerCase() : "")).filter((id) => id !== "")),
      );
    }
  }
  const mutual = (a: string, b: string): boolean => (names.get(a)?.has(b) ?? false) && (names.get(b)?.has(a) ?? false);
  const out = new Map<string, { name: string; members: ReadonlySet<string> }>();
  const seen = new Set<string>();
  for (const start of [...names.keys()].sort()) {
    if (seen.has(start)) {
      continue;
    }
    const members = new Set<string>([start]);
    const queue = [start];
    while (queue.length > 0) {
      const at = queue.pop() as string;
      for (const next of names.get(at) ?? []) {
        if (!members.has(next) && mutual(at, next)) {
          members.add(next);
          queue.push(next);
        }
      }
    }
    for (const member of members) {
      seen.add(member);
    }
    const list = [...members].sort();
    const clique = list.length > 1 && list.every((a) => list.every((b) => a === b || mutual(a, b)));
    if (clique) {
      const group = { name: `incompatible_${list[0] as string}`, members };
      for (const member of list) {
        out.set(member, group);
      }
    }
  }
  return out;
}

function emitFlag(
  out: Record<string, unknown>,
  key: string,
  resolved: boolean | null,
  chapterDefault: boolean,
): void {
  if (resolved === true) {
    out[key] = true;
  } else if (resolved === false && chapterDefault) {
    out[key] = false;
  }
}

function questTasks(node: SnbtNode, ctx: QuestContext): Array<Record<string, unknown>> | null {
  const tasks = snbtGet(node, "tasks");
  if (tasks === undefined) {
    return [];
  }
  if (tasks.kind !== "list") {
    return [];
  }
  const out: Array<Record<string, unknown>> = [];
  for (const item of tasks.items) {
    const errorsBefore = ctx.report.errorCount;
    const mark = ctx.report.mark();
    const mapped = mapTask(item, {
      questId: ctx.questId,
      chapter: ctx.chapter.path,
      lang: ctx.lang,
      report: ctx.report,
    });
    if (mapped === null) {
      // Skipped tasks report themselves (manual work); only a new error stops the quest —
      // unless the caller accepts losses, when the one task goes and the quest stays.
      if (ctx.report.errorCount > errorsBefore) {
        if (!ctx.report.lossy) {
          return null;
        }
        ctx.report.soften(mark, `with loss allowed, this task of quest ${ctx.questId} is left out`);
      }
      continue;
    }
    out.push(mapped);
  }
  return out;
}

function questRewards(node: SnbtNode, ctx: QuestContext): Array<Record<string, unknown>> | null {
  const rewards = snbtGet(node, "rewards");
  if (rewards === undefined) {
    return [];
  }
  if (rewards.kind !== "list") {
    return [];
  }
  const out: Array<Record<string, unknown>> = [];
  for (const item of rewards.items) {
    const errorsBefore = ctx.report.errorCount;
    const mark = ctx.report.mark();
    const mapped = mapReward(item, {
      questId: ctx.questId,
      chapter: ctx.chapter.path,
      lang: ctx.lang,
      ids: ctx.ids,
      slugs: ctx.slugs,
      report: ctx.report,
    });
    if (mapped === null) {
      if (ctx.report.errorCount > errorsBefore) {
        if (!ctx.report.lossy) {
          return null;
        }
        ctx.report.soften(mark, `with loss allowed, this reward of quest ${ctx.questId} is left out`);
      }
      continue;
    }
    out.push(mapped);
  }
  return out;
}

function wholeNumber(child: SnbtNode, ctx: QuestContext, key: string): number | null {
  const value =
    child.kind === "byte" || child.kind === "short" || child.kind === "int" || child.kind === "long"
      ? Number(child.value)
      : null;
  if (value === null || !Number.isInteger(value)) {
    fail(ctx, child, key, `${key} is not a whole number`);
    return null;
  }
  return value;
}

function readBool(node: SnbtNode, key: string, ctx: QuestContext): boolean {
  const child = snbtGet(node, key);
  if (child === undefined) {
    return false;
  }
  // FTB writes flags as true/false and as 1b/0b; anything else is malformed.
  if (child.kind === "boolean") {
    return child.value;
  }
  if (child.kind === "byte" && (child.value === 0n || child.value === 1n)) {
    return child.value === 1n;
  }
  fail(ctx, child, key, `${key} is not true or false`);
  return false;
}

function fail(ctx: QuestContext, node: SnbtNode, key: string, message: string): void {
  ctx.report.error({ code: "malformed-quest", message, path: ctx.chapter.path, line: node.line, key });
}
