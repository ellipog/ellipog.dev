#!/usr/bin/env node
/**
 * reset.mjs -- free port 3000 and clear the dev server's lock.
 *
 * WHY THIS IS A PERMANENT TOOL RATHER THAN A ONE-OFF
 *
 * Two problems recur whenever this project is built and then served, and both surface as a running server
 * that will not serve the current code:
 *
 * 1. **`bun run build` wipes `apps/docs/content/` while `bun run dev` is watching it.** Deleting a watched
 *    directory breaks the watcher's registration, so the server keeps serving the compile it made *before*
 *    the wipe. The page you are looking at is older than the files on disk, and a fix appears not to have
 *    worked. This is gap 7 in `AGENT.md`, and it cost several debugging rounds before it was understood.
 *
 * 2. **A dead server leaves a registration behind.** `.next/dev` holds a lock naming a PID, and the next
 *    `bun run dev` refuses to start: "you can access the existing server at http://localhost:3000" — for a
 *    server that is not running. `rmdir` cannot clear it either; it fails with `ENOTEMPTY` because Next
 *    holds a handle, so the process has to be killed first and the directory removed after.
 *
 * Both are Windows-specific in their details and would be a `kill` on any other platform, but the sequence
 * — find the port's owner, kill it, then remove the lock — is the same everywhere.
 *
 * Run: bun run reset
 */

import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, '..');
const PORT = Number(process.env.PORT ?? 3000);

/* ------------------------------------------------------------------ */
/* Whoever is listening on the port                                    */
/* ------------------------------------------------------------------ */

/**
 * The PIDs listening on the port, from `netstat -ano`.
 *
 * The last column of a LISTENING line is the owning process id. Parsed with a regex rather than split on
 * whitespace, because the local and foreign address columns are variable-width and a split lands on the
 * wrong field depending on how long the address is.
 */
function listeners() {
  let out = '';
  try {
    out = execSync('netstat -ano', { encoding: 'utf8' });
  } catch {
    return [];
  }

  const pids = new Set();
  for (const line of out.split(/\r?\n/)) {
    if (!line.includes('LISTENING')) continue;
    // `:3000` bounded, so port 30001 is not matched.
    if (!new RegExp(`[:.]${PORT}\\s`).test(line)) continue;
    const m = /(\d+)\s*$/.exec(line.trim());
    if (m) pids.add(m[1]);
  }
  return [...pids];
}

const pids = listeners();

if (pids.length === 0) {
  console.log(`  port ${PORT}: nothing listening`);
} else {
  for (const pid of pids) {
    try {
      execSync(`taskkill /F /PID ${pid}`, { stdio: 'pipe' });
      console.log(`  port ${PORT}: killed PID ${pid}`);
    } catch (err) {
      // A PID that has already exited is not a failure worth stopping for, but saying so matters: the
      // next `bun run dev` will still refuse if the lock survives, and that is the thing to look at then.
      console.log(`  port ${PORT}: could not kill PID ${pid} — ${String(err).split('\n')[0]}`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* The lock                                                           */
/* ------------------------------------------------------------------ */

/*
 * Removed after the processes, never before.
 *
 * `rmSync` on `.next/dev` fails with `ENOTEMPTY` while Next still holds a handle on something inside it,
 * so killing first is not tidiness — it is the difference between this working and this throwing. The
 * retries are for Windows' habit of holding a directory open for a moment after the process that owned it
 * has gone.
 */
const lock = join(SITE, 'apps', 'docs', '.next', 'dev');

if (!existsSync(lock)) {
  console.log('  dev lock: none to clear');
} else {
  try {
    rmSync(lock, { recursive: true, force: true, maxRetries: 5, retryDelay: 120 });
    console.log('  dev lock: cleared');
  } catch (err) {
    console.log(`  dev lock: could not clear — ${String(err).split('\n')[0]}`);
    console.log('            a `bun run dev` may still refuse to start; try again in a moment');
  }
}

console.log(`\nport ${PORT} is free. Start a server with \`bun run dev\`.`);
