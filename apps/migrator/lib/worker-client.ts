/**
 * Run the pipeline in a Worker, falling back to the main thread when Worker
 * construction fails (some static-host/browser combinations refuse blob workers).
 * Both paths call the same convertVfs — the fallback only loses the jank-free parse.
 */
'use client';

import { convertVfs } from './pipeline';
import type { PipelineOptions, PipelineResult, ProgressFn } from './pipeline';
import type { SkippedFile } from './vfs-adapter';
import type { VfsFile } from './core';

export interface RunHandle {
  readonly done: Promise<PipelineResult>;
  cancel(): void;
}

export function runPipeline(
  files: ReadonlyArray<VfsFile>,
  options: PipelineOptions,
  rootOverride: string | undefined,
  onProgress: ProgressFn,
  skipped: ReadonlyArray<SkippedFile> = [],
): RunHandle {
  try {
    const worker = new Worker(new URL('./worker.ts', import.meta.url));
    let cancel = () => worker.terminate();
    const done = new Promise<PipelineResult>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent) => {
        const data = event.data as Record<string, unknown>;
        if (data['type'] === 'progress') {
          onProgress(data['stage'] as string, data['done'] as number, data['total'] as number);
        } else if (data['type'] === 'done') {
          cancel = () => {};
          worker.terminate();
          resolve(data['result'] as PipelineResult);
        } else if (data['type'] === 'error') {
          cancel = () => {};
          worker.terminate();
          reject(new Error(data['message'] as string));
        }
      };
      worker.onerror = (event) => {
        cancel = () => {};
        worker.terminate();
        reject(new Error(`worker failed: ${event.message}`));
      };
      worker.postMessage({ files, options, rootOverride, skipped });
    });
    return { done, cancel: () => cancel() };
  } catch {
    // No Worker available: chunk one yield per stage so the progress bar still moves.
    const done = (async () => {
      const tick = async (stage: string, s: number, t: number): Promise<void> => {
        onProgress(stage, s, t);
        await new Promise((r) => setTimeout(r, 0));
      };
      return convertVfs(files, options, rootOverride, (s, d, t) => void tick(s, d, t), skipped);
    })();
    return { done, cancel: () => {} };
  }
}
