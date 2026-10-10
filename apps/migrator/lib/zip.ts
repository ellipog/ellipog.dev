/**
 * Zip intake + output packaging on @zip.js/zip.js (the streaming,
 * worker-capable library the conversion spec names). Deterministic output:
 * sorted entries, fixed-or-preserved mtime, configurable compression.
 */
import { BlobReader, BlobWriter, Uint8ArrayReader, Uint8ArrayWriter, ZipReader, ZipWriter } from '@zip.js/zip.js';
import type { VfsFile } from './core';
import { normalizePath } from './core';
import { HARD_TOTAL_BYTES, MAX_INTAKE_FILES, MAX_PASSTHROUGH_BYTES, shouldSkip, skipReason } from './vfs-adapter';
import type { SkippedFile } from './vfs-adapter';
import type { PlacedFile } from './pipeline';

/** Guards from the spec: warn at 512 MB total, refuse past 50 000 entries. */
export const WARN_TOTAL_BYTES = 512 * 1024 * 1024;
export const MAX_FILE_BYTES = 256 * 1024 * 1024;
export const MAX_RATIO = 200;

export interface ZipIntake {
  readonly files: Array<VfsFile>;
  readonly skipped: Array<SkippedFile>;
  /** Oversize warning for the UI when the total passes WARN_TOTAL_BYTES. */
  readonly oversize: boolean;
}

/** A .zip Blob into VfsFiles, with zip-slip, skip-list and bomb guards. */
export async function filesFromZipBlob(blob: Blob): Promise<ZipIntake> {
  const reader = new ZipReader(new BlobReader(blob));
  try {
    const entries = await reader.getEntries();
    if (entries.length > MAX_INTAKE_FILES) {
      throw new Error(`zip holds ${entries.length} entries (limit ${MAX_INTAKE_FILES}) — zip the config folder instead of the whole instance`);
    }
    const files: Array<VfsFile> = [];
    const skipped: Array<SkippedFile> = [];
    let total = 0;
    for (const entry of entries) {
      if (entry.directory) continue;
      const raw = entry.filename;
      if (shouldSkip(raw)) continue;
      const uncompressed = entry.uncompressedSize ?? 0;
      const compressed = entry.compressedSize ?? 1;
      if (uncompressed > MAX_FILE_BYTES) {
        throw new Error(`${raw}: ${uncompressed} bytes (per-file limit ${MAX_FILE_BYTES})`);
      }
      if (uncompressed > compressed * MAX_RATIO && uncompressed > 1024 * 1024) {
        throw new Error(`${raw}: decompression ratio looks like a zip bomb`);
      }
      let path: string;
      try {
        path = normalizePath(raw);
      } catch {
        continue; // zip-slip or absolute path: refuse the entry, never guess
      }
      // Big non-quest files (jars, saves) are listed, never inflated: a whole-
      // instance zip converts without holding gigabytes beside the book.
      if (uncompressed > MAX_PASSTHROUGH_BYTES) {
        if (path.endsWith('.snbt')) {
          throw new Error(`${path} is too large to convert in the browser — zip the quest book, not the whole instance`);
        }
        skipped.push({ path, size: uncompressed, reason: skipReason() });
        continue;
      }
      const bytes = await entry.getData?.(new Uint8ArrayWriter());
      if (!bytes) continue;
      total += bytes.length;
      if (total > HARD_TOTAL_BYTES) {
        throw new Error('that zip is too large to hold in memory — zip the config folder instead of the whole instance');
      }
      files.push({ path, bytes: bytes as Uint8Array });
    }
    await reader.close();
    return { files, skipped, oversize: total > WARN_TOTAL_BYTES };
  } finally {
    await reader.close().catch(() => {});
  }
}

export interface ZipOptions {
  /** Fixed mtime (default) keeps re-runs byte-identical; preserved keeps source dates. */
  readonly mtime: 'fixed' | 'preserved';
  readonly level: number;
}

/** Deterministic date: the same input + options → byte-identical output. */
const FIXED_DATE = new Date(Date.UTC(2000, 0, 1, 0, 0, 0));

/** Placed files into a .zip Blob, entries sorted by path. */
export async function placedToZipBlob(
  placed: ReadonlyArray<PlacedFile>,
  options: ZipOptions = { mtime: 'fixed', level: 6 },
): Promise<Blob> {
  const writer = new ZipWriter(new BlobWriter('application/zip'), { bufferedWrite: true });
  const sorted = [...placed].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const encode = new TextEncoder();
  for (const file of sorted) {
    const data = file.text !== undefined ? encode.encode(file.text) : (file.bytes as Uint8Array);
    await writer.add(file.path, new Uint8ArrayReader(data), {
      lastModDate: options.mtime === 'fixed' ? FIXED_DATE : new Date(),
      level: options.level,
    });
  }
  return writer.close();
}
