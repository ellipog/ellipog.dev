/**
 * "Save to folder…" via the File System Access API where available.
 * Download .zip is always offered; this is the enhancement beside it.
 */
'use client';

import type { PlacedFile } from './pipeline';

interface DirHandle {
  getFileHandle(name: string, opts: { create: boolean }): Promise<FileHandle>;
  getDirectoryHandle(name: string, opts: { create: boolean }): Promise<DirHandle>;
}

interface FileHandle {
  createWritable(): Promise<{ write(data: unknown): Promise<void>; close(): Promise<void> }>;
}

declare global {
  interface Window {
    showDirectoryPicker?: () => Promise<DirHandle>;
  }
}

export function canSaveToFolder(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/** Write the placed tree into a user-picked directory, creating subfolders. */
export async function saveToFolder(placed: ReadonlyArray<PlacedFile>): Promise<number> {
  const root = await window.showDirectoryPicker!();
  const encode = new TextEncoder();
  let written = 0;
  for (const file of placed) {
    const parts = file.path.split('/');
    const name = parts.pop() as string;
    let dir = root;
    for (const part of parts) {
      dir = await dir.getDirectoryHandle(part, { create: true });
    }
    const handle = await dir.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(file.text !== undefined ? encode.encode(file.text) : (file.bytes as Uint8Array));
    await writable.close();
    written++;
  }
  return written;
}
