/**
 * The web pipeline: the same phase order as the CLI (load → capabilities →
 * remap → emit → validate), but structure-preserving — files the profile does
 * not own pass through untouched, and the output mirrors the input layout with
 * only the migrated subtree changed. Runs in a Worker; the same function runs
 * on the main thread as fallback (see lib/worker-client.ts).
 */
import {
  DEFAULT_GEOM,
  Report,
  buildIds,
  checkCapabilities,
  convertBook,
  loadQuestBook,
  reportMarkdown,
  snbtGet,
  validateOutput,
  vfsCaseCollisions,
} from './core';
import type { VfsFile } from './core';
import { alreadyMigrated, detectBooks, outputRootFor, rebaseToRoot } from './detect';

export interface PipelineOptions {
  readonly canonicalLocale: string;
  readonly fallbackLocale: string;
  readonly allowLoss: boolean;
  readonly strict: boolean;
  readonly coordinateScale: number | null;
  readonly sizeScale: number | null;
  readonly imageScale: number | null;
  readonly keepSource: boolean;
  readonly includeMigrator: boolean;
}

export const DEFAULT_OPTIONS: PipelineOptions = {
  canonicalLocale: 'en_us',
  fallbackLocale: '',
  allowLoss: false,
  strict: false,
  coordinateScale: null,
  sizeScale: null,
  imageScale: null,
  keepSource: true,
  includeMigrator: true,
};

export interface PlacedFile {
  readonly path: string;
  readonly text?: string;
  readonly bytes?: Uint8Array;
}

export interface PipelineResult {
  readonly failed: boolean;
  /** Fatal message when the run stopped before emitting (no book, bad version, …). */
  readonly fatal: string | null;
  readonly detectedRoot: string;
  readonly outputRoot: string;
  readonly evidence: string;
  readonly placed: ReadonlyArray<PlacedFile>;
  readonly reportJson: { entries: unknown };
  readonly reportMd: string;
  readonly filesIn: number;
  readonly filesOut: number;
  readonly errors: number;
  readonly warnings: number;
  readonly notes: number;
}

export type ProgressFn = (stage: string, done: number, total: number) => void;

const noop: ProgressFn = () => {};

function versionOf(book: { data: { root: Parameters<typeof snbtGet>[0] } }): number | null {
  const version = snbtGet(book.data.root, 'version');
  if (
    version !== undefined &&
    (version.kind === 'int' || version.kind === 'long' || version.kind === 'short' || version.kind === 'byte')
  ) {
    return Number(version.value);
  }
  return null;
}

function fail(
  report: Report,
  filesIn: number,
  fatal: string,
  extra?: Partial<PipelineResult>,
): PipelineResult {
  return {
    failed: true,
    fatal,
    detectedRoot: '',
    outputRoot: '',
    evidence: '',
    placed: [],
    reportJson: report.toJson() as PipelineResult['reportJson'],
    reportMd: reportMarkdown(report),
    filesIn,
    filesOut: 0,
    errors: report.errorCount,
    warnings: report.warningCount,
    notes: report.noteCount,
    ...extra,
  };
}

/**
 * Convert one dropped tree. `rootOverride` pins the book root when the user
 * picks a Detection other than the default.
 */
export async function convertVfs(
  allFiles: ReadonlyArray<VfsFile>,
  options: PipelineOptions,
  rootOverride?: string,
  onProgress: ProgressFn = noop,
): Promise<PipelineResult> {
  const report = new Report();
  onProgress('detect', 0, 7);

  const migrated = alreadyMigrated(allFiles);
  if (migrated !== null) {
    report.error({ code: 'already-migrated', message: `refused: input ${migrated}` });
    return fail(report, allFiles.length, `Refused — input ${migrated}.`);
  }

  const detections = detectBooks(allFiles);
  if (detections.length === 0) {
    report.error({ code: 'missing-book', message: 'no data.snbt: nothing here is a quest book' });
    return fail(report, allFiles.length, 'No quest book found — nothing here is an FTB Quests export.');
  }
  const picked =
    rootOverride !== undefined
      ? detections.find((d) => d.root === rootOverride) ?? null
      : (detections.find((d) => d.confidence === 'high') ?? detections[0] ?? null);
  if (picked === null) {
    return fail(report, allFiles.length, 'Selected quest-book root not found in this input.');
  }
  const root = picked.root;
  const outputRoot = outputRootFor(root);
  const prefix = (rel: string): string => (outputRoot === '' ? rel : `${outputRoot}/${rel}`);

  onProgress('parse', 1, 7);
  const rebased = rebaseToRoot(allFiles, root);
  const book = loadQuestBook(rebased, { allowLoss: options.allowLoss }, report);
  if (book === null) {
    return fail(report, allFiles.length, 'No quest book here — see the report.', {
      detectedRoot: root,
      outputRoot,
      evidence: picked.evidence,
    });
  }

  onProgress('capabilities', 2, 7);
  if (!checkCapabilities(versionOf(book), report, book.data.path)) {
    return fail(report, allFiles.length, 'Unsupported book version — this profile converts format 13.', {
      detectedRoot: root,
      outputRoot,
      evidence: picked.evidence,
    });
  }

  onProgress('remap', 3, 7);
  const ids = buildIds(book, report);
  if (ids === null) {
    return fail(report, allFiles.length, 'Conflicting ids — see the report.', {
      detectedRoot: root,
      outputRoot,
      evidence: picked.evidence,
    });
  }

  onProgress('transform', 4, 7);
  const geom = {
    coordinateScale: options.coordinateScale ?? DEFAULT_GEOM.coordinateScale,
    sizeScale: options.sizeScale ?? DEFAULT_GEOM.sizeScale,
    imageScale: options.imageScale ?? DEFAULT_GEOM.imageScale,
  };
  const emitted = convertBook(
    book,
    ids,
    { canonicalLocale: options.canonicalLocale, fallbackLocale: options.fallbackLocale, geom },
    report,
  );

  onProgress('validate', 5, 7);
  validateOutput(
    emitted.map((f) => ({ path: f.path, text: f.text })),
    report,
  );

  const failed = report.failed || (options.strict && report.warningCount > 0);
  if (failed) {
    return {
      ...fail(report, allFiles.length, options.strict && !report.failed
        ? 'Strict mode: warnings fail the run — see the report.'
        : 'Conversion failed — see the report.', {
        detectedRoot: root,
        outputRoot,
        evidence: picked.evidence,
      }),
      failed: true,
    };
  }

  onProgress('emit', 6, 7);
  const placed: Array<PlacedFile> = [];
  for (const file of emitted) {
    if (file.path.startsWith('_migrator/') && !options.includeMigrator) continue;
    placed.push({ path: prefix(file.path), text: file.text });
  }
  if (options.includeMigrator) {
    placed.push({ path: prefix('_migrator/report.json'), text: `${JSON.stringify(report.toJson(), null, 2)}\n` });
    placed.push({ path: prefix('_migrator/report.md'), text: reportMarkdown(report) });
  }
  // Structure preservation: everything outside the book root passes through
  // byte-for-byte, plus non-snbt members inside the root the model ignores.
  // keepSource=false drops the original subtree after a successful run.
  const inRoot = (p: string): boolean => (root === '' ? true : p === root || p.startsWith(`${root}/`));
  for (const file of allFiles) {
    const inside = inRoot(file.path);
    if (inside && !options.keepSource) continue;
    if (inside && /(^|\/)lang\/[^/]*_merged\.snbt$/.test(file.path)) continue; // build artefact
    placed.push({ path: file.path, bytes: file.bytes });
  }
  placed.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  for (const group of vfsCaseCollisions(placed.map((f) => ({ path: f.path, bytes: new Uint8Array() })))) {
    report.warn({
      code: 'case-collision',
      message: `outputs collide on a case-insensitive disk: ${group.join(', ')}`,
    });
  }

  onProgress('report', 7, 7);
  return {
    failed: false,
    fatal: null,
    detectedRoot: root,
    outputRoot,
    evidence: picked.evidence,
    placed,
    reportJson: report.toJson() as PipelineResult['reportJson'],
    reportMd: reportMarkdown(report),
    filesIn: allFiles.length,
    filesOut: placed.length,
    errors: report.errorCount,
    warnings: report.warningCount,
    notes: report.noteCount,
  };
}
