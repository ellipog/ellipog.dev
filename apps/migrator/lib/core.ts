/**
 * One import site for the converter. Every mapping decision lives in the
 * vendored @ellipog/migrator-core snapshot (../vendor/migrator-core, refreshed
 * by bun scripts/sync-migrator-core.mjs — never hand-edited); the web shell is
 * intake, options, progress and export.
 *
 * Importing the snapshot root pulls the vendored Tenet schemas with it
 * (validate.ts imports ./schemas/*.json). That is deliberate: validation runs
 * against the exact schemas the core was read against, stamped below for the
 * UI footer.
 */
export {
  parseSnbt,
  SnbtError,
  snbtGet,
  normalizePath,
  vfsText,
  sortVfs,
  vfsCaseCollisions,
  vfsSubtree,
  VfsError,
  Report,
  reportMarkdown,
  loadQuestBook,
  buildIds,
  convertBook,
  emitJson,
  checkCapabilities,
  validateOutput,
  rewriteCommand,
  DEFAULT_GEOM,
  SCHEMA_STAMP,
} from '../vendor/migrator-core/src/index';
export type {
  VfsFile,
  ReportEntry,
  Severity,
  QuestBookInput,
  IdMap,
  ConvertOptions,
  OutputFile,
} from '../vendor/migrator-core/src/index';
