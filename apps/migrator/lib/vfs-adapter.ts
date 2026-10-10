/**
 * Browser files into VfsFiles: bytes in, bytes out, no interpretation.
 * Path normalisation (zip-slip, drive letters, `..`) is the core's
 * normalizePath — refused paths surface as report errors, never guesses.
 */
import { normalizePath } from './core';
import type { VfsFile } from './core';

const SKIP_DIRS: ReadonlyArray<string> = ['__MACOSX/', '.git/'];
const SKIP_NAMES: ReadonlyArray<string> = ['.DS_Store', 'Thumbs.db'];

export function shouldSkip(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    SKIP_DIRS.some((dir) => lower.includes(`/${dir.toLowerCase()}`) || lower.startsWith(dir.toLowerCase())) ||
    SKIP_NAMES.some((name) => lower === name.toLowerCase() || lower.endsWith(`/${name.toLowerCase()}`))
  );
}

/** A file seen but deliberately not read: too big to hold beside the book. */
export interface SkippedFile {
  readonly path: string;
  readonly size: number;
  readonly reason: string;
}

export interface IntakeResult {
  readonly files: Array<VfsFile>;
  readonly skipped: Array<SkippedFile>;
}

/** Live intake progress. total is null while the walk size is still unknown. */
export type ScanFn = (done: number, total: number | null, label: string) => void;

/** Passthrough cap: bigger files are listed in the report, never read. */
export const MAX_PASSTHROUGH_BYTES = 32 * 1024 * 1024;
/** Backstop on what one drop may hold in memory at once. */
export const HARD_TOTAL_BYTES = 1024 * 1024 * 1024;
export const MAX_INTAKE_FILES = 50_000;

function fmtSize(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function skipReason(): string {
  return `over ${MAX_PASSTHROUGH_BYTES / 1024 / 1024} MB — left out of the output, copy it back yourself`;
}

/**
 * Sizes are known upfront (File.size, zip headers), so big files never get
 * read: a profile folder's jars and saves are listed, not slurped. A quest
 * file over the cap is a hard error instead — converting without book members
 * would fail confusingly downstream.
 */
async function realize(
  pairs: ReadonlyArray<{ path: string; file: File }>,
  onScan?: ScanFn,
): Promise<IntakeResult> {
  if (pairs.length > MAX_INTAKE_FILES) {
    throw new Error(
      `that input holds ${pairs.length} files (limit ${MAX_INTAKE_FILES}) — drop the config folder or a smaller zip instead`,
    );
  }
  const files: Array<VfsFile> = [];
  const skipped: Array<SkippedFile> = [];
  const pending: Array<{ path: string; file: File }> = [];
  let total = 0;
  for (const { path, file } of pairs) {
    if (shouldSkip(path)) continue;
    let norm: string;
    try {
      norm = normalizePath(path);
    } catch {
      continue;
    }
    if (file.size > MAX_PASSTHROUGH_BYTES) {
      if (norm.endsWith('.snbt')) {
        throw new Error(`${norm} is ${fmtSize(file.size)} — over the readable limit; quest files this big can't convert in the browser`);
      }
      skipped.push({ path: norm, size: file.size, reason: skipReason() });
      continue;
    }
    total += file.size;
    pending.push({ path: norm, file });
  }
  if (total > HARD_TOTAL_BYTES) {
    throw new Error(
      `that input is ${fmtSize(total)} — too large to hold in memory. Drop the config folder (or a zip of it) instead of the whole profile.`,
    );
  }
  for (let i = 0; i < pending.length; i++) {
    const item = pending[i] as { path: string; file: File };
    files.push({ path: item.path, bytes: new Uint8Array(await item.file.arrayBuffer()) });
    onScan?.(i + 1, pending.length, 'reading');
  }
  return { files, skipped };
}

function safeFile(path: string, bytes: Uint8Array): VfsFile | null {
  if (shouldSkip(path)) return null;
  try {
    return { path: normalizePath(path), bytes };
  } catch {
    return null;
  }
}

/** A flat FileList/File[] (picker or <input webkitdirectory>). */
export async function filesFromFileList(
  list: FileList | Array<File>,
  onScan?: ScanFn,
): Promise<IntakeResult> {
  return realize(
    Array.from(list).map((file) => ({
      path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
      file,
    })),
    onScan,
  );
}

/** Single path+bytes into a VfsFile (null when skipped or unsafe). */
export function vfsFile(path: string, bytes: Uint8Array): VfsFile | null {
  return safeFile(path, bytes);
}

interface PickerEntry {
  readonly kind: 'file' | 'directory';
  readonly name: string;
  getFile?: () => Promise<File>;
  values?: () => AsyncIterable<PickerEntry>;
}

interface PickerDir {
  readonly name: string;
  values(): AsyncIterable<PickerEntry>;
}

export interface PickerResult extends IntakeResult {
  readonly name: string;
}

/** File System Access directory picker, recursed into VfsFiles. */
export async function filesFromDirectoryPicker(onScan?: ScanFn): Promise<PickerResult> {
  const picker = (
    window as unknown as { showDirectoryPicker?: (this: Window) => Promise<PickerDir> }
  ).showDirectoryPicker;
  if (typeof picker !== 'function') {
    throw new Error('this browser has no folder picker — use Choose files or a zip instead');
  }
  const root = await picker.call(window);
  const pairs: Array<{ path: string; file: File }> = [];
  const walk = async (dir: PickerDir, base: string): Promise<void> => {
    for await (const entry of dir.values()) {
      const path = base === '' ? entry.name : `${base}/${entry.name}`;
      if (entry.kind === 'file' && typeof entry.getFile === 'function') {
        pairs.push({ path, file: await entry.getFile() });
        onScan?.(pairs.length, null, 'scanning');
      } else if (entry.kind === 'directory' && typeof entry.values === 'function') {
        await walk({ name: entry.name, values: entry.values }, path);
      }
    }
  };
  await walk(root, '');
  const { files, skipped } = await realize(pairs, onScan);
  return { files, skipped, name: root.name };
}

interface FsEntry {
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly name: string;
  readonly fullPath?: string;
}

interface FsFileEntry extends FsEntry {
  file(success: (f: File) => void, fail?: (e: unknown) => void): void;
  createReader(): FsReader;
}

interface FsReader {
  readEntries(success: (entries: Array<FsEntry>) => void, fail?: (e: unknown) => void): void;
}

/** Folder drag-drop via webkitGetAsEntry, recursed; FileList fallback when absent. */
export async function filesFromDataTransfer(data: DataTransfer, onScan?: ScanFn): Promise<IntakeResult> {
  const items = Array.from(data.items ?? []);
  const withEntry = items.filter(
    (item) => typeof (item as DataTransferItem & { webkitGetAsEntry?: unknown }).webkitGetAsEntry === 'function',
  );
  if (withEntry.length === 0) {
    return filesFromFileList(Array.from(data.files ?? []));
  }
  const pairs: Array<{ path: string; file: File }> = [];
  for (const item of withEntry) {
    const entry = (item as unknown as { webkitGetAsEntry(): FsEntry | null }).webkitGetAsEntry();
    if (entry !== null) await walkEntry(entry, '', pairs, onScan);
  }
  return realize(pairs, onScan);
}

async function walkEntry(
  entry: FsEntry,
  base: string,
  pairs: Array<{ path: string; file: File }>,
  onScan?: ScanFn,
): Promise<void> {
  const path = base === '' ? entry.name : `${base}/${entry.name}`;
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FsFileEntry).file(resolve, reject),
    );
    pairs.push({ path, file });
    onScan?.(pairs.length, null, 'scanning');
    return;
  }
  if (entry.isDirectory) {
    const reader = (entry as unknown as FsFileEntry).createReader();
    for (;;) {
      const batch = await new Promise<Array<FsEntry>>((resolve, reject) =>
        reader.readEntries(resolve, reject),
      );
      if (batch.length === 0) break;
      for (const child of batch) await walkEntry(child, path, pairs, onScan);
    }
  }
}
