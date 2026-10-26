#!/usr/bin/env node
/**
 * stats.mjs -- the build-time snapshot of both platforms' download counts.
 *
 * Why this exists rather than numbers in manifest.json
 * ----------------------------------------------------
 * A download count typed into a file is wrong within a week and stays wrong forever, because nobody
 * goes back to re-type it. That is the same failure the docs side of this project is built to avoid,
 * one level down: a fact about the world, written down once, that the world then moves past.
 *
 * Why it still exists now that the page is live
 * ---------------------------------------------
 * The catalog polls `/api/stats` and updates its figures in place, but the *first* paint is this file:
 * it is what the static HTML carries, so JavaScript off, a crawler, or an API that is down all still get
 * a real number rather than a blank. The fetching itself lives in `apps/docs/lib/platforms.mjs`, shared
 * with the function and the browser fallback, so the snapshot and the live figure cannot be computed two
 * different ways.
 *
 * Not a hard failure. A build with no network should still produce a site, so an unreachable platform
 * writes what it has and the page renders without that platform's numbers rather than with stale ones.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectStats } from '../apps/docs/lib/platforms.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, '..');
const OUT = join(SITE, 'apps', 'docs', 'stats.json');

/*
 * THERE WAS A fetchAvatar() HERE, AND ITS REMOVAL IS THE POINT OF THIS NOTE.
 *
 * It downloaded the Modrinth profile picture at build time and wrote it into `public/`, on the
 * reasoning that a page rendering your face from somebody else's server is a page that breaks the day
 * that server moves the file. That reasoning was sound and the arrangement was still wrong for a
 * different reason: a photograph of a person is not a site's identity, it was the only mark on the page
 * with no dark variant, and it was the only one that could *go missing* — a failed fetch meant a
 * different masthead, silently, on that build only.
 *
 * The mark is now two committed PNGs under `public/site/`, copied by hand from the studio repository and
 * serving the masthead, the colophon and the tab icon. A committed file cannot fail to download, so the
 * failure mode is gone rather than handled.
 */

const out = await collectStats({
  headers: { 'User-Agent': 'ellipog.dev build (+https://ellipog.dev)' },
  concurrency: 2,
  delay: 250,
});

if (!out.ok.modrinth) console.warn('stats: Modrinth unreachable.');
if (!out.ok.curseforge) console.warn('stats: CurseForge unreachable.');

writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');

const n = (v) => v.toLocaleString('en-US');
console.log(
  `stats: modrinth ${Object.keys(out.modrinth).length} projects / ${n(out.totals.modrinth)} · ` +
  `curseforge ${Object.keys(out.curseforge).length} / ${n(out.totals.curseforge)} · ` +
  `total ${n(out.totals.all)}`,
);
for (const note of out.notes) console.log(`stats: note -- ${note}`);
