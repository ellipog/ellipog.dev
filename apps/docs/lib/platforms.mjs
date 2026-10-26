/**
 * platforms.mjs -- download counts from Modrinth and CurseForge, in one place for three callers.
 *
 * The same numbers are fetched from three places, and they must not be three implementations:
 *
 *   1. `scripts/stats.mjs`, at build time, which writes the snapshot baked into the static HTML.
 *   2. `api/stats.mjs`, the Vercel function the catalog page polls, cached at the edge.
 *   3. `components/live-stats.tsx`, in the visitor's browser, only when that function is not there --
 *      `next dev`, or any static host that is not Vercel.
 *
 * So this file is plain ESM with no Node APIs: `fetch`, `AbortSignal` and `setTimeout` exist in all
 * three runtimes. It is `.mjs` rather than `.ts` because the function and the build script import it
 * by relative path from outside the Next project, and an untranspiled `.mjs` is the one format all of
 * Node, Bun, Vercel's tracer and Turbopack read without a build step. `platforms.d.mts` beside it gives
 * the page its types.
 *
 * MODRINTH needs one request: `/user/{id}/projects` returns every project with its download count. It
 * used to be `/search`, which also answers in one request but reads an *indexed* count that lagged the
 * project endpoint by ~0.2%; a live counter that is behind the platform's own page is the wrong way
 * round.
 *
 * CURSEFORGE comes through **cfwidget**, a keyless read-only mirror, because CurseForge's own API needs
 * a key and there is none in this project. The author listing returns ids and names with no counts, so
 * each project costs a second request -- and cfwidget answers with `max-age=3600`, so these figures move
 * at most hourly however often they are asked for. AGENT.md -> *Where the numbers come from* has the
 * three things about it that cost real debugging.
 */

/** The creator on Modrinth. The user endpoint takes the username as well as the id. */
export const MODRINTH_USER = 'ellipog';

/**
 * CurseForge's numeric author id. The API cannot resolve an author by display name, so this number is
 * the only way in; it was recovered from the `members` array cfwidget returns for any of the creator's
 * projects (`../beacon/lib/config.ts` records the same one).
 */
export const CURSEFORGE_AUTHOR_ID = 30254096;

/**
 * How many projects CurseForge's own profile page prints. The cfwidget listing returns fewer, and the
 * shortfall is written into the notes rather than swallowed.
 */
export const CURSEFORGE_PROFILE_COUNT = 22;

/**
 * Projects the author listing cannot see, added by hand.
 *
 * `BP: Origins Edition` is real and public, but the listing does not return it, so discovery has no
 * route to it. Its page prints the exact integer 821 -- below 1,000 CurseForge does not round -- so that
 * is the number rather than an approximation. Cross-checked against Beacon's snapshot, where the 821 is
 * exactly the difference between the two totals.
 */
export const CURSEFORGE_EXTRAS = [
  {
    slug: 'bp-origins-edition',
    title: 'BP: Origins Edition',
    downloads: 821,
    url: 'https://www.curseforge.com/minecraft/modpacks/bp-origins-edition',
  },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * GET JSON, retrying only what is worth retrying: network faults, 5xx and 429.
 *
 * `headers` is a parameter because the browser must not be sent a `User-Agent`: it is not a
 * CORS-safelisted header, so setting one turns every request into a preflight plus the request.
 */
async function getJson(url, { headers = {}, attempts = 3, timeout = 20_000 } = {}) {
  let last;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let res;
    try {
      res = await fetch(url, {
        headers: { Accept: 'application/json', ...headers },
        signal: AbortSignal.timeout(timeout),
      });
      if (res.ok) return await res.json();
    } catch (err) {
      last = err;
    }
    if (res && !res.ok) {
      last = new Error(`HTTP ${res.status} for ${url}`);
      // A 4xx is a decision the server has already made. Retrying a 404 is noise.
      if (res.status !== 429 && res.status < 500) throw last;
    }
    if (attempt < attempts - 1) await sleep(500 * (attempt + 1));
  }
  throw last;
}

/** Every project this author has on Modrinth, keyed by slug. One request. */
export async function fetchModrinth({ headers } = {}) {
  const body = await getJson(`https://api.modrinth.com/v2/user/${MODRINTH_USER}/projects`, { headers });
  if (!Array.isArray(body)) throw new Error('modrinth returned no project list');

  const bySlug = {};
  for (const project of body) {
    bySlug[project.slug] = {
      downloads: project.downloads ?? 0,
      followers: project.followers ?? 0,
      title: project.title,
      kind: project.project_type,
      url: `https://modrinth.com/${project.project_type}/${project.slug}`,
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
 * Every project this author has on CurseForge, keyed by slug, with the hand-listed extras appended.
 *
 * A small worker pool with a pause between requests, because this is a free service: the build runs
 * two workers at 250ms, the function four at 100ms (it answers a waiting request, and the edge cache in
 * front of it means it runs a few times an hour, not per visitor).
 */
export async function fetchCurseForge({ headers, concurrency = 2, delay = 250 } = {}) {
  const listing = await getJson(`https://api.cfwidget.com/author/${CURSEFORGE_AUTHOR_ID}`, { headers });
  const entries = Array.isArray(listing?.projects) ? listing.projects : [];
  if (entries.length === 0) throw new Error('cfwidget returned no projects');

  const bySlug = {};
  const queue = [...entries];
  const failed = [];

  async function worker() {
    for (;;) {
      const entry = queue.shift();
      if (!entry) return;
      try {
        const payload = await getJson(`https://api.cfwidget.com/${entry.id}`, { headers });
        const slug = slugFromUrl(payload?.urls?.curseforge) ?? String(entry.id);
        bySlug[slug] = {
          downloads: payload?.downloads?.total ?? 0,
          title: payload?.title ?? entry.name,
          url: payload?.urls?.curseforge ?? `https://www.curseforge.com/minecraft/mc-mods/${slug}`,
        };
      } catch {
        // One unresolvable project should not lose the other twenty.
        failed.push(entry.name);
      }
      if (delay > 0) await sleep(delay);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

  const added = [];
  // Appended after discovery, because these are precisely the projects discovery cannot reach.
  for (const extra of CURSEFORGE_EXTRAS) {
    if (bySlug[extra.slug]) continue;
    bySlug[extra.slug] = { downloads: extra.downloads, title: extra.title, url: extra.url };
    added.push(extra.slug);
  }

  return { bySlug, failed, added, listed: entries.length };
}

export function sum(map) {
  return Object.values(map ?? {}).reduce((n, p) => n + (p?.downloads ?? 0), 0);
}

/**
 * Both platforms, best-effort, in the shape `stats.json` has always had.
 *
 * Never throws. An unreachable platform leaves its map empty and says so in `notes`, and `ok` records
 * which platforms answered -- the page's merge reads that, so a platform that failed this time keeps the
 * figures it had rather than dropping its whole share of the total.
 */
export async function collectStats(options = {}) {
  const out = {
    fetched: new Date().toISOString().slice(0, 10),
    fetchedAt: new Date().toISOString(),
    modrinth: {},
    curseforge: {},
    totals: { modrinth: 0, curseforge: 0, all: 0 },
    ok: { modrinth: false, curseforge: false },
    notes: [],
  };

  const [mr, cf] = await Promise.allSettled([
    fetchModrinth(options),
    fetchCurseForge(options),
  ]);

  if (mr.status === 'fulfilled') {
    out.modrinth = mr.value;
    out.ok.modrinth = true;
  } else {
    out.notes.push(`modrinth unavailable: ${mr.reason?.message ?? mr.reason}`);
  }

  if (cf.status === 'fulfilled') {
    out.curseforge = cf.value.bySlug;
    out.ok.curseforge = true;
    for (const slug of cf.value.added) out.notes.push(`curseforge: ${slug} added by hand (not in the author listing)`);
    if (cf.value.failed.length > 0) out.notes.push(`curseforge: ${cf.value.failed.length} project(s) would not resolve`);
    if (cf.value.listed < CURSEFORGE_PROFILE_COUNT) {
      // Said out loud rather than hidden: the listing is not everything CurseForge hosts.
      out.notes.push(`curseforge: listing returned ${cf.value.listed}, the profile page prints ${CURSEFORGE_PROFILE_COUNT}`);
    }
  } else {
    out.notes.push(`curseforge unavailable: ${cf.reason?.message ?? cf.reason}`);
  }

  out.totals.modrinth = sum(out.modrinth);
  out.totals.curseforge = sum(out.curseforge);
  out.totals.all = out.totals.modrinth + out.totals.curseforge;
  return out;
}

/**
 * The same stats with only what the page reads: a count per slug, and the totals.
 *
 * The function's response is polled by every open tab, so it carries no titles, URLs or follower counts
 * -- about 1.5KB instead of 6KB, for a figure that changes by tens an hour.
 */
export function slim(stats) {
  const counts = (map) =>
    Object.fromEntries(Object.entries(map ?? {}).map(([slug, p]) => [slug, { downloads: p?.downloads ?? 0 }]));
  return {
    fetchedAt: stats.fetchedAt,
    modrinth: counts(stats.modrinth),
    curseforge: counts(stats.curseforge),
    totals: stats.totals,
    ok: stats.ok,
  };
}
