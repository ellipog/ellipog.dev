#!/usr/bin/env node
/**
 * stats.mjs -- pull download counts off both platforms, at build time.
 *
 * Why this exists rather than numbers in manifest.json
 * ----------------------------------------------------
 * A download count typed into a file is wrong within a week and stays wrong forever, because nobody
 * goes back to re-type it. That is the same failure the docs side of this project is built to avoid,
 * one level down: a fact about the world, written down once, that the world then moves past.
 *
 * MODRINTH needs nothing: its search endpoint takes an author facet and returns downloads, followers
 * and the URL together. One request.
 *
 * CURSEFORGE is the awkward one. Its own API (api.curseforge.com) requires a key, and there is no key
 * in this project. So the numbers come from **cfwidget**, a keyless read-only mirror -- the same route
 * `../beacon/lib/curseforge.ts` uses, and the reason that project works without a key either.
 *
 * Two things about cfwidget that are not obvious and cost real debugging to find:
 *
 * 1. `curl "https://api.cfwidget.com/minecraft/mc-mods/<slug>"` **fails with exit 3** on Windows --
 *    the shell mangles the URL. Node's `fetch` reaches it fine. Do not conclude the service is down
 *    from a curl failure.
 * 2. A project is resolved by **numeric id**, not by slug path. The two return different payloads:
 *    the slug path omits `files` for some projects and 404s for others. Beacon measured this as 79
 *    releases against 131 from the id route. We only need the total, but the id route is the one
 *    that reliably has it.
 *
 * The author listing is discoverable but incomplete: it returns 18 projects here, while CurseForge's
 * own profile page prints a larger count. Beacon records that gap explicitly
 * (`curseforgeProfileCount: 22`) rather than pretending the listing is everything. We do the same --
 * see the `note` written into stats.json.
 *
 * Not a hard failure. A build with no network should still produce a site, so an unreachable platform
 * writes what it has and the page renders without that platform's numbers rather than with stale ones.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, '..');
const OUT = join(SITE, 'apps', 'docs', 'stats.json');

const manifest = JSON.parse(readFileSync(join(SITE, 'manifest.json'), 'utf8'));

/** The creator this site is bound to. Both ids are needed: neither API looks a creator up by name. */
const MODRINTH_USER = 'ellipog';

/**
 * CurseForge's numeric author id.
 *
 * Taken from `../beacon/lib/config.ts`, which recovered it from the `members` array cfwidget returns
 * for any of the creator's projects. The API cannot resolve an author by display name, so this number
 * is the only way in, and it is stable.
 */
const CURSEFORGE_AUTHOR_ID = 30254096;

/**
 * CurseForge's own profile page prints a project count larger than this.
 *
 * Recorded so the shortfall is a stated gap rather than a silent one -- exactly as Beacon does it.
 * If a project is missing from the site's total, this is why.
 */
const CURSEFORGE_PROFILE_COUNT = 22;

/**
 * Projects the author listing cannot see, added by hand.
 *
 * Copied from `../beacon/lib/config.ts`, which found them the hard way: `BP: Origins Edition` is real
 * and public, but cfwidget's author listing does not return it, so discovery has no route to it and
 * the total was quietly short. Its page prints the exact integer 821 -- below 1,000 CurseForge does
 * not round -- so that is the number, not an approximation.
 *
 * Cross-checked against Beacon's own snapshot (`../beacon/data/snapshots.json`): it records
 * 2,337,541 for CurseForge against this script's 2,336,720, and the 821 difference is this entry.
 * Two implementations agreeing to within one declared gap is the reason to trust either.
 */
const CURSEFORGE_EXTRAS = [
  {
    slug: 'bp-origins-edition',
    title: 'BP: Origins Edition',
    downloads: 821,
    url: 'https://www.curseforge.com/minecraft/modpacks/bp-origins-edition',
  },
];

const UA = 'ellipog.dev build (+https://ellipog.dev)';

/** GET JSON, retrying only what is worth retrying: network faults, 5xx, 429. */
async function getJson(url, { attempts = 3 } = {}) {
  let last;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) return await res.json();
      // A 4xx is a decision the server has already made. Retrying a 404 is noise.
      if (res.status !== 429 && res.status < 500) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      last = new Error(`HTTP ${res.status} for ${url}`);
    } catch (err) {
      last = err;
    }
    if (attempt < attempts - 1) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
  throw last;
}

/** Every project this author has on Modrinth, keyed by slug. One request. */
async function fetchModrinth() {
  const url =
    'https://api.modrinth.com/v2/search?facets=' +
    encodeURIComponent(`[["author:${MODRINTH_USER}"]]`) +
    '&limit=100';

  const body = await getJson(url);
  const bySlug = {};
  for (const hit of body.hits ?? []) {
    bySlug[hit.slug] = {
      downloads: hit.downloads ?? 0,
      followers: hit.follows ?? 0,
      title: hit.title,
      kind: hit.project_type,
      url: `https://modrinth.com/${hit.project_type}/${hit.slug}`,
    };
  }
  return bySlug;
}

/** `https://www.curseforge.com/minecraft/mc-mods/animal-origins` -> `animal-origins`. */
function slugFromUrl(url) {
  if (!url) return null;
  const parts = url.replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || null;
}

/**
 * Every project this author has on CurseForge, keyed by slug.
 *
 * The author listing gives ids and names only, so each one costs a second request to resolve into a
 * total and a public URL. That is 19 requests against a free service, so it is done with a small pool
 * and a delay between each -- gentler than Beacon's four workers at 300ms, because this runs on every
 * build rather than on a ten-minute cache.
 */
async function fetchCurseForge() {
  const listing = await getJson(`${'https://api.cfwidget.com'}/author/${CURSEFORGE_AUTHOR_ID}`);
  const entries = Array.isArray(listing?.projects) ? listing.projects : [];
  if (entries.length === 0) throw new Error('cfwidget returned no projects');

  const bySlug = {};
  const queue = [...entries];
  const failed = [];

  async function worker() {
    for (; ;) {
      const entry = queue.shift();
      if (!entry) return;
      try {
        const payload = await getJson(`https://api.cfwidget.com/${entry.id}`);
        const slug = slugFromUrl(payload?.urls?.curseforge) ?? String(entry.id);
        bySlug[slug] = {
          downloads: payload?.downloads?.total ?? 0,
          title: payload?.title ?? entry.name,
          url: payload?.urls?.curseforge ?? `https://www.curseforge.com/minecraft/mc-mods/${slug}`,
        };
      } catch {
        // One unresolvable project should not lose the other seventeen.
        failed.push(entry.name);
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  await Promise.all([worker(), worker()]);
  return { bySlug, failed, listed: entries.length };
}

function sum(map) {
  return Object.values(map).reduce((n, p) => n + (p?.downloads ?? 0), 0);
}

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
 * failure mode is gone rather than handled, and `MODRINTH_USER` below is back to doing exactly one job:
 * naming the author in the Modrinth search.
 */

async function main() {
  const out = {
    fetched: new Date().toISOString().slice(0, 10),
    modrinth: {},
    curseforge: {},
    totals: { modrinth: 0, curseforge: 0, all: 0 },
    notes: [],
  };

  try {
    out.modrinth = await fetchModrinth();
  } catch (err) {
    out.notes.push(`modrinth unavailable: ${err.message}`);
    console.warn(`stats: Modrinth unreachable (${err.message}).`);
  }

  try {
    const cf = await fetchCurseForge();

    // Appended after discovery, because these are precisely the projects discovery cannot reach.
    for (const extra of CURSEFORGE_EXTRAS) {
      if (cf.bySlug[extra.slug]) continue;
      cf.bySlug[extra.slug] = { downloads: extra.downloads, title: extra.title, url: extra.url };
      out.notes.push(`curseforge: ${extra.slug} added by hand (not in the author listing)`);
    }

    out.curseforge = cf.bySlug;
    if (cf.failed.length > 0) {
      out.notes.push(`curseforge: ${cf.failed.length} project(s) would not resolve`);
    }
    if (cf.listed < CURSEFORGE_PROFILE_COUNT) {
      // Said out loud rather than hidden: the listing is not everything CurseForge hosts.
      out.notes.push(
        `curseforge: listing returned ${cf.listed}, the profile page prints ${CURSEFORGE_PROFILE_COUNT}`,
      );
    }
  } catch (err) {
    out.notes.push(`curseforge unavailable: ${err.message}`);
    console.warn(`stats: CurseForge unreachable (${err.message}).`);
  }

  out.totals.modrinth = sum(out.modrinth);
  out.totals.curseforge = sum(out.curseforge);
  out.totals.all = out.totals.modrinth + out.totals.curseforge;

  writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');

  const n = (v) => v.toLocaleString('en-US');
  console.log(
    `stats: modrinth ${Object.keys(out.modrinth).length} projects / ${n(out.totals.modrinth)} · ` +
    `curseforge ${Object.keys(out.curseforge).length} / ${n(out.totals.curseforge)} · ` +
    `total ${n(out.totals.all)}`,
  );
  for (const note of out.notes) console.log(`stats: note -- ${note}`);
}

await main();
