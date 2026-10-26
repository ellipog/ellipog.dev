import type { Stats } from '@/lib/platforms.mjs';

/** One spelling of a count, so the server's HTML and the client's update can never format differently. */
export const formatCount = (v: number) => v.toLocaleString('en-US');

/**
 * One project's downloads across both platforms.
 *
 * Summed rather than picked, because a project on two platforms is one project and showing only the
 * Modrinth figure would undercount the bigger one by more than half. Returns null when neither
 * platform has a number, so a cell can say nothing rather than say zero.
 */
export function combined(stats: Stats, modrinth?: string, curseforge?: string) {
  const mr = modrinth ? stats.modrinth[modrinth]?.downloads : undefined;
  const cf = curseforge ? stats.curseforge[curseforge]?.downloads : undefined;
  if (mr === undefined && cf === undefined) return null;

  const parts: string[] = [];
  if (mr !== undefined) parts.push(`${formatCount(mr)} Modrinth`);
  if (cf !== undefined) parts.push(`${formatCount(cf)} CurseForge`);
  return { total: (mr ?? 0) + (cf ?? 0), breakdown: parts.join(' · ') };
}
