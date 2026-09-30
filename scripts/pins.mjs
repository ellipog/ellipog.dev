#!/usr/bin/env node
/**
 * pins.mjs -- move every mod's pin to its repository's current default-branch head.
 *
 * The pin is what makes a deploy reproducible: `sync.mjs` checks out that exact commit, so the site
 * describes a known state of the code rather than whatever happened to be in a working tree. That also
 * means the pin is the only thing deciding how fresh the docs are, and a pin nobody bumps is a site that
 * quietly freezes.
 *
 * Two callers:
 *
 *   bun run pins          print what would change, and change nothing
 *   bun run pins --write  actually bump the pins in manifest.json
 *
 * **Dry by default, deliberately.** This edits a committed file, and a command that rewrites your
 * manifest as a side effect of being curious about it is a command you learn not to run. The weekly
 * workflow passes `--write`.
 *
 * It does not commit, push or deploy. Bumping a pin is an edit, and an edit is something a person or a
 * workflow decides to keep -- not something a script smuggles in behind them.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, '..');
const MANIFEST = join(SITE, 'manifest.json');

const write = process.argv.includes('--write');
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));

/**
 * The head of a repository's default branch, read from GitHub rather than from a local clone.
 *
 * `git ls-remote` needs no authentication for a public repository, no checkout, and no working copy —
 * which is what makes this safe to run from a workflow with nothing on disk. It returns every ref, so
 * the default branch is asked for by name; `HEAD` would also work but returns a detached name on some
 * servers and is worth avoiding for a value that goes into a committed file.
 */
function headOf(repo) {
  const out = execFileSync('git', ['ls-remote', repo, 'refs/heads/main'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

  const sha = out.split(/\s+/)[0];
  if (!sha || !/^[0-9a-f]{40}$/.test(sha)) throw new Error(`no main branch at ${repo}`);
  return sha;
}

let changes = 0;
let failed = 0;

for (const mod of manifest.suite) {
  if (!mod.repo || mod.status !== 'active') continue;

  let head;
  try {
    head = headOf(mod.repo);
  } catch (err) {
    // One unreachable repository should not stop the others from being checked.
    console.error(`  ! ${mod.id.padEnd(10)} could not read ${mod.repo} -- ${err.message.split('\n')[0]}`);
    failed += 1;
    continue;
  }

  const current = mod.pin;

  if (current === head) {
    console.log(`  = ${mod.id.padEnd(10)} ${head.slice(0, 7)} (already current)`);
    continue;
  }

  changes += 1;

  if (!current) {
    console.log(`  + ${mod.id.padEnd(10)} ${head.slice(0, 7)} (no pin yet)`);
  } else {
    console.log(`  > ${mod.id.padEnd(10)} ${current.slice(0, 7)} -> ${head.slice(0, 7)}`);
  }

  if (write) mod.pin = head;
}

if (write && changes > 0) {
  // Two spaces and a trailing newline, matching the file's existing formatting so a diff shows only
  // the pin that moved.
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

console.log('');
if (changes === 0) {
  console.log('pins: nothing to do.');
} else if (write) {
  console.log(`pins: bumped ${changes} pin(s) in manifest.json. Nothing has been committed.`);
} else {
  console.log(`pins: ${changes} pin(s) would move. Re-run with --write to apply.`);
}

if (failed > 0) process.exitCode = 1;
