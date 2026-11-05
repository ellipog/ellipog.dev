/**
 * The pipeline's options and their defaults, apart from lib/pipeline.ts so the page can read them
 * without importing the converter. pipeline.ts re-exports both, so scripts keep one import site.
 */
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
