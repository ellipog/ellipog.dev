/**
 * Zip intake + output packaging on @zip.js/zip.js (the streaming,
 * worker-capable library the conversion spec names). Deterministic output:
 * sorted entries, fixed-or-preserved mtime, configurable compression.
 */
import { BlobReader, BlobWriter, Uint8ArrayReader, Uint8ArrayWriter, ZipReader, ZipWriter } from '@zip.js/zip.js';
import type { FileEntry } from '@zip.js/zip.js';
import type { VfsFile } from './core';
import { normalizePath } from './paths';
import { HARD_TOTAL_BYTES, MAX_INTAKE_FILES, MAX_PASSTHROUGH_BYTES, shouldSkip, skipReason } from './vfs-adapter';
import type { ScanFn, SkippedFile } from './vfs-adapter';
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

/**
 * Entries inflated at once. One at a time, each entry waits out its own round trip to a zip.js worker,
 * and on a 919-file quest book those waits are most of the intake. A pool of 32 keeps the workers busy:
 * 1.5–2.7 s → ~1.0 s in Chrome on ATM10, with no long task on the page. Starting every entry at once is
 * a little faster but stalls the page for 200–300 ms while it queues them, and holds no bound on memory.
 */
const INTAKE_CONCURRENCY = 32;

/** A .zip Blob into VfsFiles, with zip-slip, skip-list and bomb guards. */
export async function filesFromZipBlob(blob: Blob, onScan?: ScanFn): Promise<ZipIntake> {
  const reader = new ZipReader(new BlobReader(blob));
  try {
    onScan?.(0, null, 'reading zip');
    const entries = await reader.getEntries();
    if (entries.length > MAX_INTAKE_FILES) {
      throw new Error(`zip holds ${entries.length} entries (limit ${MAX_INTAKE_FILES}) — zip the config folder instead of the whole instance`);
    }
    const skipped: Array<SkippedFile> = [];
    // Pass 1, headers only: every guard that needs no bytes, in entry order, so a bad entry is refused
    // before anything is inflated. What survives is extracted in pass 2.
    const wanted: Array<{ readonly entry: FileEntry; readonly path: string }> = [];
    let done = 0;
    for (const entry of entries) {
      if (entry.directory) {
        done++;
        continue;
      }
      const raw = entry.filename;
      if (shouldSkip(raw)) {
        done++;
        continue;
      }
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
        done++;
        continue; // zip-slip or absolute path: refuse the entry, never guess
      }
      // Big non-quest files (jars, saves) are listed, never inflated: a whole-
      // instance zip converts without holding gigabytes beside the book.
      if (uncompressed > MAX_PASSTHROUGH_BYTES) {
        if (path.endsWith('.snbt')) {
          throw new Error(`${path} is too large to convert in the browser — zip the quest book, not the whole instance`);
        }
        skipped.push({ path, size: uncompressed, reason: skipReason() });
        done++;
        continue;
      }
      wanted.push({ entry, path });
    }
    onScan?.(done, entries.length, 'extracting');

    // Pass 2: inflate through the pool. Results keep entry order, and the memory guard runs on the real
    // bytes as each entry lands, so at most INTAKE_CONCURRENCY entries are in flight past the limit.
    const extracted: Array<VfsFile | undefined> = new Array(wanted.length);
    let total = 0;
    let next = 0;
    let failed = false;
    const lane = async (): Promise<void> => {
      while (!failed && next < wanted.length) {
        const index = next++;
        const { entry, path } = wanted[index]!;
        const bytes = await entry.getData?.(new Uint8ArrayWriter());
        onScan?.(++done, entries.length, 'extracting');
        if (!bytes) continue;
        total += bytes.length;
        if (total > HARD_TOTAL_BYTES) {
          failed = true;
          throw new Error('that zip is too large to hold in memory — zip the config folder instead of the whole instance');
        }
        extracted[index] = { path, bytes: bytes as Uint8Array };
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(INTAKE_CONCURRENCY, wanted.length) }, lane));
    } catch (error) {
      failed = true;
      throw error;
    }
    const files = extracted.filter((file): file is VfsFile => file !== undefined);
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

/**
 * Placed files into a .zip Blob, entries sorted by path.
 *
 * Every entry is added at once and zip.js compresses them across its workers. `keepOrder` (on by
 * default) still writes them in call order, so the bytes match adding them one by one. One by one, a
 * converted book's thousands of small entries each waited out a worker round trip: on ATM10's 5,867
 * entries in Chrome, 5.9–9.7 s became 2.7–4.3 s in isolation. Keep the workers: without them the same
 * export runs on the page's thread and freezes it for seconds.
 *
 * The adds are queued in slices with a yield between them. Encoding and queueing all 5,867 in one go
 * held the page's thread for ~160 ms; in slices of QUEUE_SLICE the longest task is ~80 ms. In the app,
 * from Download to the finished blob on ATM10: 9.6 s → 5.0 s.
 */
const QUEUE_SLICE = 256;

export async function placedToZipBlob(
  placed: ReadonlyArray<PlacedFile>,
  options: ZipOptions = { mtime: 'fixed', level: 6 },
): Promise<Blob> {
  const writer = new ZipWriter(new BlobWriter('application/zip'), { bufferedWrite: true, keepOrder: true });
  const sorted = [...placed].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const encode = new TextEncoder();
  const adds: Array<Promise<unknown>> = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && i % QUEUE_SLICE === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    const file = sorted[i]!;
    const data = file.text !== undefined ? encode.encode(file.text) : (file.bytes as Uint8Array);
    const add = writer.add(file.path, new Uint8ArrayReader(data), {
      lastModDate: options.mtime === 'fixed' ? FIXED_DATE : new Date(),
      level: options.level,
    });
    add.catch(() => {}); // a failure while later slices queue is reported by Promise.all below, once
    adds.push(add);
  }
  await Promise.all(adds);
  return writer.close();
}
