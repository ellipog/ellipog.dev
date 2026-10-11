import type { MetadataRoute } from 'next';

import { absoluteUrl } from '@/lib/metadata';

/*
 * Every page, written down rather than derived — same shape as
 * `apps/docs/app/sitemap.ts`, without its loader.
 *
 * Docs derives the list from `source.getPages()` so a page cannot be in the
 * sitemap and not in the build. This app has four routes and no page loader,
 * so the list is typed. If a route is ever added, add it here too.
 *
 * No `lastModified` (the only date the build knows is today, and stamping
 * every page with it tells a crawler everything changed this morning, every
 * morning). No `priority` / `changeFrequency` — nobody reads them.
 */
export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  return [...new Set(['/', '/reference/', '/ftb-quests-alternative/', '/minecraft-questing-mods/'].map(absoluteUrl))].map((url) => ({ url }));
}
