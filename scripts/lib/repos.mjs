/**
 * Where a mod's checkout is, and how one is fetched when it is not beside this repository.
 *
 * Two callers, one definition: `sync.mjs` reads each mod's `docs/` to build the site, and
 * `glossary.mjs` reads each mod's terms to print the merged vocabulary. Both have to answer the same
 * question — is the repository in the sibling folder, or does the pin have to be fetched into
 * `.cache` — and a second implementation of that question would drift from this one the first time a
 * path convention changed.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** The site repository's root: this file lives in `scripts/lib/`. */
export const SITE = resolve(HERE, '..', '..');

/** Where a pinned checkout lands. Gitignored, and safe to delete. */
const CACHE = join(SITE, '.cache');

/**
 * Force the pinned commit even when the repository is present beside this one.
 *
 * Off by default, because a local build should show local edits — that is the whole reason the sibling
 * read exists. On in CI, where there are no siblings to read. It is also how the pin path is tested on
 * a machine that *does* have the repositories, which otherwise could not exercise it at all.
 */
export const USE_PINS = process.env.ELLIPOG_USE_PINS === '1';

/** The sibling checkout a mod's `localPath` names. Not checked for existence; see `materialise`. */
export function repoPath(mod) {
  return resolve(SITE, mod.localPath);
}

/**
 * A checkout of one commit, into `.cache/<mod>`.
 *
 * **Why this exists, in one sentence: on a build server there are no sibling folders.** A clone of this
 * repository contains `.gitignore`, `AGENT.md`, `apps`, `manifest.json`, `package.json` and `scripts` —
 * and nothing else. `../tenet` does not exist, so the sibling read finds nothing, every mod is skipped
 * and the sync exits non-zero. The site cannot be deployed at all without this.
 *
 * The shallow single-commit fetch is deliberate. `git clone --depth 1` cannot check out an arbitrary
 * commit — depth limits you to a branch tip — but fetching one commit *by SHA* is supported and pulls
 * exactly the one snapshot, with none of the history. For a docs build that is the whole repository we
 * need.
 *
 * The `.pin` stamp is a marker rather than bookkeeping: a re-build with the same pin skips the network
 * entirely, which matters because a Vercel build runs this on every deploy.
 */
export function checkoutPin(mod) {
  const dir = join(CACHE, mod.id);
  const stamp = join(dir, '.pin');

  if (existsSync(stamp) && readFileSync(stamp, 'utf8').trim() === mod.pin) {
    return { dir, cached: true };
  }

  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const git = (...args) =>
    execFileSync('git', args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });

  git('init', '--quiet');
  git('remote', 'add', 'origin', mod.repo);
  git('fetch', '--quiet', '--depth', '1', 'origin', mod.pin);
  git('checkout', '--quiet', 'FETCH_HEAD');
  writeFileSync(stamp, mod.pin, 'utf8');

  return { dir, cached: false };
}

/**
 * Where a mod's documentation comes from: the sibling folder if it is there, otherwise the pin.
 *
 * **The sibling wins, and that ordering is a reversal worth stating.** `AGENT.md` originally said the pin
 * should be preferred when one is set. That would mean a local build silently showing pushed code and
 * hiding the edit you are in the middle of making, which is the opposite of useful — and it would make
 * `bun run dev` lie about what you are working on. So a local folder wins by default, and
 * `ELLIPOG_USE_PINS=1` forces the pin for anyone who wants to reproduce a deploy or test the CI path.
 */
export function materialise(mod, problems) {
  const local = repoPath(mod);
  const hasLocal = existsSync(local);

  if (mod.pin && (!hasLocal || USE_PINS)) {
    try {
      const { dir, cached } = checkoutPin(mod);
      return { dir, source: `${mod.pin.slice(0, 7)}${cached ? ' (cached)' : ''}` };
    } catch (err) {
      const detail = (err.stderr ?? err.message ?? '').toString().trim().split('\n').slice(-3).join(' / ');
      problems.push(`${mod.id}: could not fetch pin ${mod.pin.slice(0, 7)} -- ${detail}`);
      return { dir: null, source: null };
    }
  }

  if (hasLocal) return { dir: local, source: mod.localPath };

  return { dir: null, source: null };
}
