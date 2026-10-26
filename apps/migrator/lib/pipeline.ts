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
import type { SkippedFile } from './vfs-adapter';

export interface PipelineOptions {
  readonly canonicalLocale: string;
  readonly fallbackLocale: string;
  readonly allowLoss: boolean;
  readonly strict: boolean;
  /** Re-run over an already-migrated tree: the FTB book inside converts anyway. */
  readonly force: boolean;
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
  force: false,
  coordinateScale: null,
  sizeScale: null,
  imageScale: null,
  keepSource: true,
  includeMigrator: true,
};

export interface PlacedFile {
  readonly path: string;
  /** Where the file came from — labelled at emission, never guessed from the path. */
  readonly kind: 'converted' | 'passthrough' | 'report';
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

function fmtSize(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

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

/**
 * Why a run stopped, in one sentence the Result head can show. Unknown fields are the one
 * failure a checkbox fixes, so they say so; parse errors name themselves; the rest point at
 * the report, which names every one.
 */
function failureSentence(report: Report, options: PipelineOptions, phase: 'load' | 'convert'): string {
  const errors = report.sorted().filter((entry) => entry.severity === 'error');
  const n = errors.length;
  const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`;
  if (n > 0 && errors.every((entry) => entry.code === 'unmapped-field')) {
    return options.allowLoss
      ? `${plural(n, 'field')} this converter has no mapping for — see the report.`
      : `${plural(n, 'field')} this converter has no mapping for. Allow loss to convert without them, each listed as a warning.`;
  }
  if (errors.some((entry) => entry.code === 'parse-error')) {
    return `${plural(errors.filter((entry) => entry.code === 'parse-error').length, 'file')} would not parse — see the report.`;
  }
  const lead = phase === 'load' ? 'The quest book did not load' : 'Conversion failed';
  return options.allowLoss
    ? `${lead}: ${plural(n, 'error')} — see the report.`
    : `${lead}: ${plural(n, 'error')}. Allow loss leaves out what cannot convert and lists it, or see the report.`;
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
 * picks a Detection other than the default. `skipped` names input files the
 * intake saw but refused to hold (too big) — each gets a report note, so the
 * report accounts for every file seen, not just every file converted.
 */
export async function convertVfs(
  allFiles: ReadonlyArray<VfsFile>,
  options: PipelineOptions,
  rootOverride?: string,
  onProgress: ProgressFn = noop,
  skipped: ReadonlyArray<SkippedFile> = [],
): Promise<PipelineResult> {
  // Allow-loss also lets one broken task, reward, table entry or picture go on its own
  // (warned) instead of stopping the run; see Report.lossy in the core.
  const report = new Report({ lossy: options.allowLoss });
  onProgress('detect', 0, 7);
  for (const s of skipped) {
    report.note({
      code: 'passthrough-skipped',
      message: `${fmtSize(s.size)} — ${s.reason}`,
      path: s.path,
    });
  }

  const migrated = alreadyMigrated(allFiles);
  if (migrated !== null && !options.force) {
    report.error({ code: 'already-migrated', message: `refused: input ${migrated}` });
    return fail(report, allFiles.length, `Refused — input ${migrated}. Tick “convert anyway” to run it regardless.`);
  }
  if (migrated !== null) {
    report.note({ code: 'forced-remigration', message: `input ${migrated}; converting anyway` });
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
    return fail(report, allFiles.length, failureSentence(report, options, 'load'), {
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
        : failureSentence(report, options, 'convert'), {
        detectedRoot: root,
        outputRoot,
        evidence: picked.evidence,
      }),
      failed: true,
    };
  }

  onProgress('emit', 6, 7);
  const placed: Array<PlacedFile> = [];
  const emittedPaths = new Set<string>();
  for (const file of emitted) {
    if (file.path.startsWith('_migrator/') && !options.includeMigrator) continue;
    emittedPaths.add(prefix(file.path));
    placed.push({
      path: prefix(file.path),
      kind: file.path.startsWith('_migrator/') ? 'report' : 'converted',
      text: file.text,
    });
  }
  // Structure preservation: everything outside the book root passes through
  // byte-for-byte; inside the root everything stays unless keepSource is off.
  // Paths the new tree emits are replaced, never duplicated (forced re-runs).
  // Collected before the _migrator files so the report names every replacement.
  // (Report paths register here too, although their text is written last.)
  if (options.includeMigrator) {
    emittedPaths.add(prefix('_migrator/report.json'));
    emittedPaths.add(prefix('_migrator/report.md'));
  }
  const passthrough: Array<PlacedFile> = [];
  let replaced = 0;
  const inRoot = (p: string): boolean => (root === '' ? true : p === root || p.startsWith(`${root}/`));
  for (const file of allFiles) {
    const inside = inRoot(file.path);
    if (inside && !options.keepSource) continue;
    if (inside && /(^|\/)lang\/[^/]*_merged\.snbt$/.test(file.path)) continue; // build artefact
    if (emittedPaths.has(file.path)) {
      replaced++;
      continue;
    }
    passthrough.push({ path: file.path, kind: 'passthrough', bytes: file.bytes });
  }
  if (replaced > 0) {
    report.note({
      code: 'replaced-output',
      message: `${replaced} stale output file${replaced === 1 ? '' : 's'} replaced, not duplicated`,
    });
  }
  if (options.includeMigrator) {
    placed.push({ path: prefix('_migrator/report.json'), kind: 'report', text: `${JSON.stringify(report.toJson(), null, 2)}\n` });
    placed.push({ path: prefix('_migrator/report.md'), kind: 'report', text: reportMarkdown(report) });
  }
  placed.push(...passthrough);
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
