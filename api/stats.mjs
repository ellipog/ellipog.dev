/**
 * GET /api/stats -- the live download counts, cached at Vercel's edge.
 *
 * The catalog page polls this once a minute. It is the one piece of the deployment that runs code, and
 * it sits beside the static export rather than inside it: Vercel serves `api/` at the repository root as
 * functions whatever the framework preset is, so `vercel.json` needs no new key (and `check.mjs` holds
 * that file to exactly six).
 *
 * WHY A FUNCTION RATHER THAN THE BROWSER ALONE. cfwidget's author listing carries no download counts,
 * so the CurseForge half is about twenty-two requests and ~1.5MB of project payloads. Done in the
 * visitor's browser that is per tab, per poll. Done here it is once per edge region per minute, and
 * every tab gets back the same ~1.5KB answer. The browser does still fall back to fetching the
 * platforms itself when this route is missing -- `next dev`, or a static host that is not Vercel.
 *
 * THE CACHE. `s-maxage=60` is the freshness the page promises; `stale-while-revalidate` means a request
 * after that minute is answered from the cache at once while one refresh runs behind it, so no visitor
 * waits on twenty-two upstream calls. A half answer -- one platform down -- is cached for fifteen
 * seconds rather than sixty, and a full failure is not cached at all: the page keeps the figures it has
 * and asks again on its next poll.
 */

import { collectStats, slim } from '../apps/docs/lib/platforms.mjs';

export async function GET() {
  const stats = await collectStats({
    headers: { 'User-Agent': 'ellipog.dev live stats (+https://ellipog.dev)' },
    concurrency: 4,
    delay: 100,
  });

  const answered = Number(stats.ok.modrinth) + Number(stats.ok.curseforge);
  const cache =
    answered === 2
      ? 'public, max-age=0, s-maxage=60, stale-while-revalidate=600'
      : answered === 1
        ? 'public, max-age=0, s-maxage=15, stale-while-revalidate=60'
        : 'no-store';

  return new Response(JSON.stringify(slim(stats)), {
    status: answered === 0 ? 502 : 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cache,
    },
  });
}
