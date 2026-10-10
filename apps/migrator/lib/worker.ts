/**
 * The conversion Worker: same convertVfs as the main-thread fallback, fed by
 * message. Bundled by Next via `new Worker(new URL('./worker.ts', import.meta.url))`
 * so a static export still emits it as a separate asset.
 */
import { convertVfs } from './pipeline';
import type { PipelineOptions } from './pipeline';
import type { VfsFile } from './core';

interface RunMessage {
  readonly files: ReadonlyArray<VfsFile>;
  readonly options: PipelineOptions;
  readonly rootOverride?: string;
}

const scope = self as unknown as {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent<RunMessage>) => void) | null;
};

scope.onmessage = async (event: MessageEvent<RunMessage>) => {
  try {
    const { files, options, rootOverride } = event.data;
    const result = await convertVfs(files, options, rootOverride, (stage, done, total) => {
      scope.postMessage({ type: 'progress', stage, done, total });
    });
    scope.postMessage({ type: 'done', result });
  } catch (error) {
    scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};

export {};
