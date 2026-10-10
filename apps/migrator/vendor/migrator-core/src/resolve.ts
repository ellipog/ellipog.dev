/**
 * Defaults resolution: FTB's quest → chapter → file chains, inlined where Tenet has no rung.
 *
 * <h2>Why resolve at all, when Tenet reads some ladders itself</h2>
 *
 * Tenet resolves the ladders it owns (consume items task → chapter → file, team rewards,
 * autoclaim, sequential tasks). The tool resolves only what Tenet cannot: shape and size
 * (Tenet keeps no file or chapter defaults — presets and appearance defaults are specified
 * inline at import), `hideDependencyLines`, `repeatable`, the visibility flags' chapter rungs,
 * and `flexibleProgress`. Where Tenet mirrors a chain rung-for-rung, this module passes the
 * raw values through and the reader resolves; where it does not, the resolved value lands on
 * the quest. Each function documents which.
 *
 * <h2>FTB readings this pins (verified in FTB-Quests 1.21.1 sources, not recalled)</h2>
 *
 * - Shape: quest (`""` and `"default"` unset) → preset → chapter `default_quest_shape`
 *   (`""` unset) → file `default_quest_shape` (`""` when absent) → `"circle"`.
 * - Size: quest (`0` unset) → preset (`0` unset) → chapter `default_quest_size` (absent `1.0`;
 *   only the `double` form counts — FTB reads it with a `TAG_DOUBLE` guard, so an `int` form
 *   is ignored there and here) → `1.0`.
 * - `hide_until_deps_visible/complete`, `hide_text_until_complete`,
 *   `hide_details_until_startable`, `hide_dependency_lines`: quest tristate (`true`/`false`/
 *   absent) falling back to the chapter boolean, else `false`. The legacy `hide` byte behaves
 *   as `hide_until_deps_visible`.
 * - `can_repeat` → chapter `default_repeatable_quest` (note the `_quest`: `default_repeatable`
 *   alone is not a field) → `false`. `require_sequential_tasks` → chapter same-named → `false`.
 * - `consume_items`: task → chapter tristate → file `default_consume_items` → `false`.
 * - Progression: quest → chapter → file (`"flexible"`/`"linear"`, `"default"` or absent unset,
 *   file absent `linear`); `flexible` anywhere effective sets `flexibleProgress`.
 * - Presets name shape and size only (`VisualPresetRecord`): quest `preset` → chapter `preset`
 *   → file `preset` → the `presets` map. A name the map does not define fails, naming it.
 *
 * <h2>Emit contract for the writers (P7/P8)</h2>
 *
 * Nullable booleans mean unset-everywhere: emit `true`, and emit `false` only when an explicit
 * `false` overrules a `true` default above it (otherwise the reader's own default already says
 * it). `sequential`, `repeatable`, `flexibleProgress` and `consumeItems` resolve to plain
 * booleans: emit when true.
 */

import { Report } from "./report";
import { ChapterInput, QuestBookInput } from "./model";
import { SnbtNode, snbtGet } from "./snbt";
import { GeomOptions, centerToCorner, sizePx } from "./geometry";

/** Tenet's closed shape set (`QuestShape`): anything else has no node to draw. */
export const TENET_SHAPES: ReadonlySet<string> = new Set([
  "rounded",
  "square",
  "circle",
  "diamond",
  "hexagon",
  "octagon",
  "pentagon",
  "gear",
  "heart",
  "tome",
  "star",
  "none",
]);

const PROGRESSION_WORDS: ReadonlySet<string> = new Set(["flexible", "linear", "default"]);
const AUTO_WORDS: ReadonlySet<string> = new Set([
  "default",
  "disabled",
  "enabled",
  "no_toast",
  "invisible",
]);

const TENET_AUTO: Record<string, string> = {
  default: "default",
  disabled: "disabled",
  enabled: "enabled",
  no_toast: "no_toast",
  invisible: "invisible",
};

export interface PresetEntry {
  readonly shape: string;
  readonly size: number;
}

export interface FileDefaults {
  readonly shape: string;
  readonly progression: "flexible" | "linear" | null;
  readonly consumeItems: boolean;
  readonly autoClaim: string;
  readonly teamReward: boolean;
  readonly presetName: string;
  readonly presets: ReadonlyMap<string, PresetEntry>;
  readonly disableRecipeMod: boolean;
}

export interface ChapterDefaults {
  readonly shape: string;
  readonly questSize: number | null;
  readonly hideDependencyLines: boolean;
  readonly hideUntilDepsVisible: boolean;
  readonly hideUntilDepsComplete: boolean;
  readonly hideDetailsUntilStartable: boolean;
  readonly hideTextUntilComplete: boolean;
  readonly repeatable: boolean;
  readonly sequential: boolean;
  /** Chapter tristate: `true`/`false` or null when the chapter says nothing. */
  readonly consumeItems: boolean | null;
  readonly progression: "flexible" | "linear" | null;
  readonly presetName: string;
  /** Zero means unset, like a quest's own minWidth. */
  readonly defaultMinWidth: number;
  readonly alwaysInvisible: boolean;
}

export interface QuestResolution {
  readonly shape: string;
  readonly sizePx: number;
  /** Top-left corner in canvas pixels: FTB centers shifted by half the node. */
  readonly x: number;
  readonly y: number;
  readonly hideUntilDepsVisible: boolean | null;
  readonly hideUntilDepsComplete: boolean | null;
  readonly hideTextUntilComplete: boolean | null;
  readonly hideDetailsUntilStartable: boolean | null;
  readonly hideDependencyLines: boolean | null;
  /** Null defers to the chapter default (Tenet reads the same ladder); emit only a difference. */
  readonly sequential: boolean | null;
  readonly repeatable: boolean;
  /** Null defers to the chapter's effective flexible default; emit only a difference. */
  readonly flexibleProgress: boolean | null;
}

/** File-level rungs, validated once so a bad file default fails in one place, not per quest. */
export function readFileDefaults(book: QuestBookInput, report: Report): FileDefaults {
  const root = book.data.root;
  const path = book.data.path;
  return {
    shape: optShape(root, "default_quest_shape", path, report) ?? "",
    progression: optProgression(root, "progression_mode", path, report) ?? "linear",
    consumeItems: readBool(root, "default_consume_items", false, report, path),
    autoClaim: optAuto(root, "default_autoclaim_rewards", path, report) ?? "default",
    teamReward: readBool(root, "default_reward_team", false, report, path),
    presetName: optString(root, "preset", path, report) ?? "",
    presets: readPresets(root, path, report),
    disableRecipeMod: readBool(root, "default_quest_disable_jei", false, report, path),
  };
}

/** Chapter-level rungs, validated once per chapter. */
export function readChapterDefaults(chapter: ChapterInput, report: Report): ChapterDefaults {
  const node = chapter.node;
  const path = chapter.path;
  return {
    shape: optShape(node, "default_quest_shape", path, report) ?? "",
    questSize: chapterQuestSize(node, path, report),
    hideDependencyLines: readBool(node, "default_hide_dependency_lines", false, report, path),
    hideUntilDepsVisible: readBool(node, "hide_quest_until_deps_visible", false, report, path),
    hideUntilDepsComplete: readBool(node, "hide_quest_until_deps_complete", false, report, path),
    hideDetailsUntilStartable: readBool(
      node,
      "hide_quest_details_until_startable",
      false,
      report,
      path,
    ),
    hideTextUntilComplete: readBool(node, "hide_text_until_complete", false, report, path),
    repeatable: readBool(node, "default_repeatable_quest", false, report, path),
    sequential: readBool(node, "require_sequential_tasks", false, report, path),
    consumeItems: optBool(node, "consume_items", path, report),
    progression: optProgression(node, "progression_mode", path, report),
    presetName: optString(node, "preset", path, report) ?? "",
    defaultMinWidth: readMinWidth(node, path, report),
    alwaysInvisible: readBool(node, "always_invisible", false, report, path),
  };
}

function readMinWidth(node: SnbtNode, path: string, report: Report): number {
  const child = snbtGet(node, "default_min_width");
  if (child === undefined) {
    return 0;
  }
  const value =
    child.kind === "byte" ||
    child.kind === "short" ||
    child.kind === "int" ||
    child.kind === "long"
      ? Number(child.value)
      : null;
  if (value === null || !Number.isInteger(value) || value < 0) {
    report.error({
      code: "malformed-field",
      message: "default_min_width is not a whole number of pixels",
      path,
      line: child.line,
      key: "default_min_width",
    });
    return 0;
  }
  return value;
}

/** A quest with every FTB chain resolved, scaled and validated. Never throws. */
export function resolveQuest(
  quest: SnbtNode,
  chapter: ChapterDefaults,
  file: FileDefaults,
  geom: GeomOptions,
  report: Report,
  path: string,
): QuestResolution | null {
  const shape = resolveShape(quest, chapter, file, report, path);
  if (shape === null) {
    return null;
  }
  const size = resolveSize(quest, chapter, file, report, path);
  if (size === null) {
    return null;
  }
  const sized = sizePx(size, geom);
  if (sized.clamped) {
    report.warn({
      code: "clamped-size",
      message: `node size ${size} lands at ${sized.px}px, outside Tenet's 16–512; it draws at ${sized.px}`,
      path,
      line: lineOf(quest, "size"),
      key: "size",
      value: size,
    });
  }
  const position = resolvePosition(quest, sized.px, geom, report, path);
  const legacy = legacyHide(quest, path, report);
  return {
    shape,
    sizePx: sized.px,
    x: position.x,
    y: position.y,
    hideUntilDepsVisible: resolveFlag(quest, "hide_until_deps_visible", chapter.hideUntilDepsVisible, report, path, legacy),
    hideUntilDepsComplete: resolveFlag(quest, "hide_until_deps_complete", chapter.hideUntilDepsComplete, report, path, null),
    hideTextUntilComplete: resolveFlag(quest, "hide_text_until_complete", chapter.hideTextUntilComplete, report, path, null),
    hideDetailsUntilStartable: resolveFlag(quest, "hide_details_until_startable", chapter.hideDetailsUntilStartable, report, path, null),
    hideDependencyLines: resolveFlag(quest, "hide_dependency_lines", chapter.hideDependencyLines, report, path, null),
    sequential: resolveSequential(quest, chapter, report, path),
    repeatable: readBool(quest, "can_repeat", chapter.repeatable, report, path),
    flexibleProgress: resolveFlexible(quest, chapter, file, report, path),
  };
}

/**
 * The chapter's effective flexible default: its own word, else the file's. Quests defer to
 * this; only a quest that differs from it writes its own flag.
 */
export function resolveChapterFlexible(chapter: ChapterDefaults, file: FileDefaults): boolean {
  return (chapter.progression ?? file.progression) === "flexible";
}

function resolveSequential(
  quest: SnbtNode,
  chapter: ChapterDefaults,
  report: Report,
  path: string,
): boolean | null {
  const own = optBool(quest, "require_sequential_tasks", path, report);
  if (own === null) {
    return null;
  }
  return own === chapter.sequential ? null : own;
}

function resolveFlexible(
  quest: SnbtNode,
  chapter: ChapterDefaults,
  file: FileDefaults,
  report: Report,
  path: string,
): boolean | null {
  const effective =
    optProgression(quest, "progression_mode", path, report) ??
    chapter.progression ??
    file.progression;
  const questFlexible = effective === "flexible";
  return questFlexible === resolveChapterFlexible(chapter, file) ? null : questFlexible;
}
/** Reward autoclaim as a Tenet word: the reward's own, defaulting to default. */
export function rewardAutoClaim(reward: SnbtNode, report: Report, path: string): string {
  const own = optAuto(reward, "auto", path, report);
  const word = own === null || own === "default" ? "default" : own;
  return TENET_AUTO[word] ?? "default";
}

/** Reward team flag: the reward's own, or null when it says nothing. */
export function rewardTeam(reward: SnbtNode, report: Report, path: string): boolean | null {
  return optBool(reward, "team_reward", path, report);
}

/** FTB editor bounds `0.1–2.0` into Tenet's `0.25–1.0`, reporting every clamp. */
export function clampIconScale(
  value: number,
  report: Report,
  path: string,
  line: number,
): { value: number; clamped: boolean } {
  if (value < 0.25) {
    report.warn({
      code: "clamped-icon-scale",
      message: `icon scale ${value} is below Tenet's 0.25 floor; it draws at 0.25`,
      path,
      line,
      key: "icon_scale",
      value,
    });
    return { value: 0.25, clamped: true };
  }
  if (value > 1.0) {
    report.warn({
      code: "clamped-icon-scale",
      message: `icon scale ${value} is above Tenet's 1.0 ceiling; it draws at 1.0`,
      path,
      line,
      key: "icon_scale",
      value,
    });
    return { value: 1.0, clamped: true };
  }
  return { value, clamped: false };
}

function resolveShape(
  quest: SnbtNode,
  chapter: ChapterDefaults,
  file: FileDefaults,
  report: Report,
  path: string,
): string | null {
  const preset = resolvePreset(quest, chapter, file, report, path);
  const questShape = cleanShape(optString(quest, "shape", path, report));
  if (questShape !== null) {
    return mapShapeName(questShape, report, path, lineOf(quest, "shape"));
  }
  if (preset !== null && preset.shape !== "") {
    return mapShapeName(preset.shape, report, path, quest.line);
  }
  if (chapter.shape !== "") {
    return mapShapeName(chapter.shape, report, path, quest.line);
  }
  if (file.shape !== "") {
    return mapShapeName(file.shape, report, path, quest.line);
  }
  return "circle";
}

function resolvePreset(
  quest: SnbtNode,
  chapter: ChapterDefaults,
  file: FileDefaults,
  report: Report,
  path: string,
): PresetEntry | null {
  const name =
    optString(quest, "preset", path, report) ||
    chapter.presetName ||
    file.presetName;
  if (name === "") {
    return null;
  }
  const preset = file.presets.get(name);
  if (preset === undefined) {
    report.error({
      code: "unknown-preset",
      message: `uses the preset ${JSON.stringify(name)}, which data.snbt does not define`,
      path,
      line: lineOf(quest, "preset"),
      key: "preset",
      value: name,
    });
    return null;
  }
  return preset;
}

function resolveSize(
  quest: SnbtNode,
  chapter: ChapterDefaults,
  file: FileDefaults,
  report: Report,
  path: string,
): number | null {
  const questSize = readQuestSize(quest, path, report);
  if (questSize === null) {
    return null;
  }
  if (questSize > 0) {
    return questSize;
  }
  const preset = resolvePreset(quest, chapter, file, report, path);
  if (preset !== null && preset.size > 0) {
    return preset.size;
  }
  if (chapter.questSize !== null && chapter.questSize > 0) {
    return chapter.questSize;
  }
  return 1.0;
}

/**
 * A quest's own size: absent and zero both mean unset (fall through), a positive number
 * wins, anything else fails the quest. Absent must not read as malformed.
 */
function readQuestSize(quest: SnbtNode, path: string, report: Report): number | null {
  if (snbtGet(quest, "size") === undefined) {
    return 0;
  }
  const value = optSize(quest, "size", path, report);
  return value === null ? null : value;
}

function resolvePosition(
  quest: SnbtNode,
  sizePx: number,
  geom: GeomOptions,
  report: Report,
  path: string,
): { x: number; y: number } {
  return {
    x: resolveCoord(quest, "x", sizePx, geom, report, path),
    y: resolveCoord(quest, "y", sizePx, geom, report, path),
  };
}

function resolveCoord(
  quest: SnbtNode,
  key: string,
  sizePx: number,
  geom: GeomOptions,
  report: Report,
  path: string,
): number {
  const child = snbtGet(quest, key);
  if (child === undefined) {
    return Math.round(0 - sizePx / 2);
  }
  const raw =
    child.kind === "float" || child.kind === "double"
      ? child.value
      : child.kind === "byte" || child.kind === "short" || child.kind === "int" || child.kind === "long"
        ? Number(child.value)
        : null;
  if (raw === null || !Number.isFinite(raw)) {
    report.error({
      code: "malformed-coordinate",
      message: `${key} is not a finite number`,
      path,
      line: child.line,
      key,
    });
    return Math.round(0 - sizePx / 2);
  }
  const corner = centerToCorner(raw, sizePx, geom.coordinateScale);
  if (!corner.exact) {
    report.note({
      code: "rounded-coordinate",
      message: `the quest's ${key} of ${raw} centers at ${raw * geom.coordinateScale}px; its top-left corner sits at ${corner.px}`,
      path,
      line: child.line,
      key,
    });
  }
  return corner.px;
}

function resolveFlag(
  quest: SnbtNode,
  key: string,
  chapterValue: boolean,
  report: Report,
  path: string,
  legacy: boolean | null,
): boolean | null {
  const own = optBool(quest, key, path, report);
  if (own !== null) {
    return own;
  }
  if (legacy === true) {
    return true;
  }
  return chapterValue ? true : null;
}

function legacyHide(quest: SnbtNode, path: string, report: Report): boolean | null {
  const child = snbtGet(quest, "hide");
  if (child === undefined) {
    return null;
  }
  // FTB reads the legacy key as a byte; the SNBT dialect also allows true/false.
  if (child.kind === "boolean") {
    if (child.value) {
      report.note({
        code: "legacy-hide-key",
        message: "hide behaves as hide_until_deps_visible: the 1.20-era spelling still reads",
        path,
        line: child.line,
        key: "hide",
      });
    }
    return child.value ? true : null;
  }
  if (child.kind === "byte" && (child.value === 0n || child.value === 1n)) {
    if (child.value === 1n) {
      report.note({
        code: "legacy-hide-key",
        message: "hide behaves as hide_until_deps_visible: the 1.20-era spelling still reads",
        path,
        line: child.line,
        key: "hide",
      });
      return true;
    }
    return null;
  }
  report.error({
    code: "malformed-field",
    message: "hide is not true or false",
    path,
    line: child.line,
    key: "hide",
  });
  return null;
}

/** An FTB node shape into its Tenet spelling, or null when no node draws it. */
export function mapShapeName(shape: string, report: Report, path: string, line: number): string | null {
  if (shape === "rsquare") {
    report.note({
      code: "renamed-shape",
      message: "rsquare draws as rounded: Tenet's set has no rsquare",
      path,
      line,
      key: "shape",
      value: shape,
    });
    return "rounded";
  }
  if (!TENET_SHAPES.has(shape)) {
    report.error({
      code: "unmapped-shape",
      message: `asks for the shape ${JSON.stringify(shape)}, which Tenet has no node for`,
      path,
      line,
      key: "shape",
      value: shape,
    });
    return null;
  }
  return shape;
}

function cleanShape(raw: string | null): string | null {
  if (raw === null || raw === "" || raw === "default") {
    return null;
  }
  return raw;
}

function readPresets(root: SnbtNode, path: string, report: Report): ReadonlyMap<string, PresetEntry> {
  const out = new Map<string, PresetEntry>();
  const presets = snbtGet(root, "presets");
  if (presets === undefined || presets.kind !== "compound") {
    return out;
  }
  for (const [name, entry] of presets.entries) {
    if (entry.kind !== "compound") {
      continue;
    }
    const shape = snbtGet(entry, "shape");
    const size = snbtGet(entry, "size");
    if (shape?.kind !== "string" || size === undefined || (size.kind !== "double" && size.kind !== "float" && size.kind !== "int" && size.kind !== "long")) {
      report.error({
        code: "malformed-preset",
        message: `the preset ${JSON.stringify(name)} is not a shape plus a size`,
        path,
        line: entry.line,
        key: name,
      });
      continue;
    }
    out.set(name, { shape: shape.value, size: Number(size.value) });
  }
  return out;
}

function chapterQuestSize(node: SnbtNode, path: string, report: Report): number | null {
  const child = snbtGet(node, "default_quest_size");
  if (child === undefined) {
    return null;
  }
  // FTB reads this key through a TAG_DOUBLE guard: an int form is ignored there and here.
  if (child.kind !== "double") {
    return 1.0;
  }
  if (!Number.isFinite(child.value)) {
    report.error({
      code: "malformed-field",
      message: "default_quest_size is not a number",
      path,
      line: child.line,
      key: "default_quest_size",
    });
    return 1.0;
  }
  return child.value;
}

function optShape(node: SnbtNode, key: string, path: string, report: Report): string | null {
  const child = snbtGet(node, key);
  if (child === undefined) {
    return null;
  }
  if (child.kind !== "string") {
    report.error({
      code: "malformed-field",
      message: `${key} is not text`,
      path,
      line: child.line,
      key,
    });
    return null;
  }
  return child.value;
}

function optString(node: SnbtNode, key: string, path: string, report: Report): string | null {
  const child = snbtGet(node, key);
  if (child === undefined) {
    return null;
  }
  if (child.kind !== "string") {
    report.error({
      code: "malformed-field",
      message: `${key} is not text`,
      path,
      line: child.line,
      key,
    });
    return null;
  }
  return child.value;
}

function optProgression(
  node: SnbtNode,
  key: string,
  path: string,
  report: Report,
): "flexible" | "linear" | null {
  const child = snbtGet(node, key);
  if (child === undefined) {
    return null;
  }
  if (child.kind !== "string") {
    report.error({
      code: "malformed-field",
      message: `${key} is not text`,
      path,
      line: child.line,
      key,
    });
    return null;
  }
  if (child.value === "default") {
    return null;
  }
  if (!PROGRESSION_WORDS.has(child.value)) {
    report.error({
      code: "unknown-progression",
      message: `${key} names ${JSON.stringify(child.value)}, which is neither flexible nor linear`,
      path,
      line: child.line,
      key,
      value: child.value,
    });
    return null;
  }
  return child.value as "flexible" | "linear";
}

function optAuto(node: SnbtNode, key: string, path: string, report: Report): string | null {
  const child = snbtGet(node, key);
  if (child === undefined) {
    return null;
  }
  if (child.kind !== "string") {
    report.error({
      code: "malformed-field",
      message: `${key} is not text`,
      path,
      line: child.line,
      key,
    });
    return null;
  }
  if (!AUTO_WORDS.has(child.value)) {
    report.error({
      code: "unknown-auto",
      message: `${key} names ${JSON.stringify(child.value)}, which is no autoclaim mode`,
      path,
      line: child.line,
      key,
      value: child.value,
    });
    return null;
  }
  return child.value;
}

function optBool(node: SnbtNode, key: string, path: string, report: Report): boolean | null {
  const child = snbtGet(node, key);
  if (child === undefined) {
    return null;
  }
  // FTB writes flags as true/false and as 1b/0b; any other byte is malformed.
  if (child.kind === "boolean") {
    return child.value;
  }
  if (child.kind === "byte" && (child.value === 0n || child.value === 1n)) {
    return child.value === 1n;
  }
  report.error({
    code: "malformed-field",
    message: `${key} is not true or false`,
    path,
    line: child.line,
    key,
  });
  return null;
}

function readBool(
  node: SnbtNode,
  key: string,
  fallback: boolean,
  report: Report,
  path: string,
): boolean {
  return optBool(node, key, path, report) ?? fallback;
}

function optSize(node: SnbtNode, key: string, path: string, report: Report): number | null {
  const child = snbtGet(node, key);
  if (child === undefined) {
    return null;
  }
  const value =
    child.kind === "float" || child.kind === "double"
      ? child.value
      : child.kind === "byte" || child.kind === "short" || child.kind === "int" || child.kind === "long"
        ? Number(child.value)
        : null;
  if (value === null || !Number.isFinite(value)) {
    report.error({
      code: "malformed-field",
      message: `${key} is not a number`,
      path,
      line: child.line,
      key,
    });
    return null;
  }
  if (value < 0) {
    report.error({
      code: "malformed-field",
      message: `${key} is negative, which no node size can be`,
      path,
      line: child.line,
      key,
      value,
    });
    return null;
  }
  return value;
}

function lineOf(node: SnbtNode, key: string): number {
  if (node.kind !== "compound") {
    return node.line;
  }
  const lines = node.keyLines.get(key);
  if (lines === undefined || lines.length === 0) {
    return node.line;
  }
  return lines[lines.length - 1] as number;
}
