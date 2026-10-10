/**
 * `@ellipog/migrator-core`: the migration, without a runtime.
 *
 * Today this holds the shared primitives (SNBT, VFS, report) plus the profile pipeline:
 * input model, identities, language pool, defaults resolution and geometry. Writers and
 * field mappings (P7–P9) build on them next. The CLI and the future web Worker
 * both call in here; neither reaches past it.
 */

export {
  parseSnbt,
  SnbtParser,
  SnbtError,
  snbtGet,
  snbtRequire,
  snbtDuplicates,
  snbtString,
  snbtBigInt,
  snbtInt,
  snbtBoolean,
  snbtNumber,
  snbtToJson,
} from "./snbt";
export type { SnbtNode } from "./snbt";
export {
  normalizePath,
  vfsText,
  sortVfs,
  vfsCaseCollisions,
  vfsSubtree,
  VfsError,
} from "./vfs";
export type { VfsFile } from "./vfs";
export { Report, reportMarkdown } from "./report";
export type { ReportEntry, Severity } from "./report";
export {
  loadQuestBook,
  checkKeys,
  describeValue,
  DATA_KEYS,
  CHAPTER_KEYS,
  QUEST_KEYS,
  TASK_KEYS,
  REWARD_KEYS,
  TABLE_KEYS,
  IMAGE_KEYS,
  LINK_KEYS,
} from "./model";
export type { ModelOptions, ParsedFile, ChapterInput, QuestBookInput } from "./model";
export { buildIds, resolveQuestRef, resolveQuestSlug, remapTableId, idsJson } from "./ids";
export { buildSlugs, slugifyTitle, questTitleCandidate, readableItem } from "./slugs";
export type { SlugMaps, TitleCandidate, TitleOrigin } from "./slugs";
export type { IdMap, IdEntry, QuestIdEntry, FileIdEntry, TaskIdEntry, DeadEdge } from "./ids";
export { LangPool, collectImageIds, proseBreaks, proseLine } from "./lang";
export type { LangOptions } from "./lang";
export {
  readFileDefaults,
  readChapterDefaults,
  resolveQuest,
  resolveChapterFlexible,
  rewardAutoClaim,
  rewardTeam,
  clampIconScale,
  TENET_SHAPES,
} from "./resolve";
export type {
  FileDefaults,
  ChapterDefaults,
  QuestResolution,
  PresetEntry,
} from "./resolve";
export { DEFAULT_GEOM, scaleCoord, sizePx, nudgeDuplicates, centerToCorner, MIN_PX, MAX_PX } from "./geometry";
export type { GeomOptions, ScaledCoord, SizedPx, NudgedPoint, CornerPoint } from "./geometry";
export { mapIcon, mapItemRef, componentsToJson } from "./icons";
export type { IconJson, ItemRefJson } from "./icons";
export { convertBook, emitJson } from "./writers";
export type { ConvertOptions, OutputFile } from "./writers";
export { mapQuest, emitChapterQuests } from "./quests";
export type { QuestContext, EmittedQuest } from "./quests";
export { mapImage, mapLink, emitChapterCanvas } from "./canvas";
export type { CanvasContext, ClickJson, ChapterCanvas } from "./canvas";
export {
  SCHEMA_STAMP,
  checkCapabilities,
  schemaFor,
  unknownKeywords,
  validateAgainstSchema,
  validateOutput,
} from "./validate";
export type { EmittedFile, SchemaIssue } from "./validate";
export { mapTask } from "./tasks";
export type { TaskContext } from "./tasks";
export { mapReward, mapTableFile } from "./rewards";
export type { RewardContext, TableFile } from "./rewards";
export { rewriteCommand } from "./commands";
