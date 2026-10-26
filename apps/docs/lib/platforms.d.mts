/** Types for `platforms.mjs`, which stays untranspiled JavaScript so three runtimes can import it. */

export type ProjectCount = { downloads: number; title?: string; url?: string; followers?: number; kind?: string };

export type Stats = {
  fetched?: string;
  fetchedAt?: string;
  modrinth: Record<string, ProjectCount>;
  curseforge: Record<string, ProjectCount>;
  totals: { modrinth: number; curseforge: number; all: number };
  /** Which platforms answered on this fetch. Absent on a snapshot written before the field existed. */
  ok?: { modrinth: boolean; curseforge: boolean };
  notes?: string[];
};

export type FetchOptions = { headers?: Record<string, string>; concurrency?: number; delay?: number };

export const MODRINTH_USER: string;
export const CURSEFORGE_AUTHOR_ID: number;
export const CURSEFORGE_PROFILE_COUNT: number;
export const CURSEFORGE_EXTRAS: { slug: string; title: string; downloads: number; url: string }[];

export function fetchModrinth(options?: FetchOptions): Promise<Record<string, ProjectCount>>;
export function fetchCurseForge(
  options?: FetchOptions,
): Promise<{ bySlug: Record<string, ProjectCount>; failed: string[]; added: string[]; listed: number }>;
export function sum(map: Record<string, ProjectCount> | undefined): number;
export function collectStats(options?: FetchOptions): Promise<Stats & { fetchedAt: string; ok: { modrinth: boolean; curseforge: boolean }; notes: string[] }>;
export function slim(stats: Stats): Stats;
