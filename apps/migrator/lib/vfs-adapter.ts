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

function safeFile(path: string, bytes: Uint8Array): VfsFile | null {
  if (shouldSkip(path)) return null;
  try {
    return { path: normalizePath(path), bytes };
  } catch {
    return null;
  }
}

/** A flat FileList/File[] (picker or <input webkitdirectory>). */
export async function filesFromFileList(list: FileList | Array<File>): Promise<Array<VfsFile>> {
  const files = Array.from(list);
  const out: Array<VfsFile> = [];
  for (const file of files) {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const vfs = safeFile(rel, bytes);
    if (vfs !== null) out.push(vfs);
  }
  return out;
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

/** File System Access directory picker, recursed into VfsFiles. */
export async function filesFromDirectoryPicker(): Promise<{ files: Array<VfsFile>; name: string }> {
  const picker = (
    window as unknown as { showDirectoryPicker?: (this: Window) => Promise<PickerDir> }
  ).showDirectoryPicker;
  if (typeof picker !== 'function') {
    throw new Error('this browser has no folder picker — use Choose files or a zip instead');
  }
  const root = await picker.call(window);
  const out: Array<VfsFile> = [];
  const walk = async (dir: PickerDir, base: string): Promise<void> => {
    for await (const entry of dir.values()) {
      const path = base === '' ? entry.name : `${base}/${entry.name}`;
      if (entry.kind === 'file' && typeof entry.getFile === 'function') {
        const file = await entry.getFile();
        const vfs = safeFile(path, new Uint8Array(await file.arrayBuffer()));
        if (vfs !== null) out.push(vfs);
      } else if (entry.kind === 'directory' && typeof entry.values === 'function') {
        await walk({ name: entry.name, values: entry.values }, path);
      }
    }
  };
  await walk(root, '');
  return { files: out, name: root.name };
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
export async function filesFromDataTransfer(data: DataTransfer): Promise<Array<VfsFile>> {
  const items = Array.from(data.items ?? []);
  const withEntry = items.filter(
    (item) => typeof (item as DataTransferItem & { webkitGetAsEntry?: unknown }).webkitGetAsEntry === 'function',
  );
  if (withEntry.length === 0) {
    return filesFromFileList(Array.from(data.files ?? []));
  }
  const out: Array<VfsFile> = [];
  for (const item of withEntry) {
    const entry = (item as unknown as { webkitGetAsEntry(): FsEntry | null }).webkitGetAsEntry();
    if (entry !== null) await walkEntry(entry, '', out);
  }
  return out;
}

async function walkEntry(entry: FsEntry, base: string, out: Array<VfsFile>): Promise<void> {
  const path = base === '' ? entry.name : `${base}/${entry.name}`;
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FsFileEntry).file(resolve, reject),
    );
    const bytes = new Uint8Array(await file.arrayBuffer());
    const vfs = safeFile(path, bytes);
    if (vfs !== null) out.push(vfs);
    return;
  }
  if (entry.isDirectory) {
    const reader = (entry as unknown as FsFileEntry).createReader();
    for (;;) {
      const batch = await new Promise<Array<FsEntry>>((resolve, reject) =>
        reader.readEntries(resolve, reject),
      );
      if (batch.length === 0) break;
      for (const child of batch) await walkEntry(child, path, out);
    }
  }
}
