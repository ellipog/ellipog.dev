/**
 * Corpus end-to-end: every FTB Quests book on this machine through the app's own
 * convertVfs (the function the Web Worker runs), default options, one line each
 * (CORPUS_ALLOW_LOSS=1 runs them as the page's "allow loss" box does).
 * Where e2e-atm10 proves one pack deeply, this proves the converter does not
 * fall over on packs nobody wrote it against. Run: bun scripts/e2e-corpus.mjs
 *
 * Books are found under the launcher instance folders below (CORPUS_DIRS, split
 * on ';', overrides them). Not committed as a test: the corpus is whatever is
 * installed here. Exit 1 if any book fails or throws.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { convertVfs, DEFAULT_OPTIONS } from '../apps/migrator/lib/pipeline.ts';
import { normalizePath } from '../apps/migrator/lib/core.ts';

const HOME = homedir();
const DIRS = (process.env['CORPUS_DIRS'] ?? '').split(';').filter(Boolean);
if (DIRS.length === 0) {
  DIRS.push(
    join(HOME, 'curseforge', 'minecraft', 'Instances'),
    join(HOME, 'AppData', 'Roaming', 'ModrinthApp', 'profiles'),
    join(HOME, 'AppData', 'Roaming', 'PrismLauncher', 'instances'),
  );
}

const OPTIONS = process.env['CORPUS_ALLOW_LOSS'] ? { ...DEFAULT_OPTIONS, allowLoss: true } : DEFAULT_OPTIONS;

const books = [];
for (const dir of DIRS) {
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir).sort()) {
    for (const quests of [
      join(dir, name, 'config', 'ftbquests', 'quests'),
      join(dir, name, 'minecraft', 'config', 'ftbquests', 'quests'),
    ]) {
      if (existsSync(join(quests, 'data.snbt'))) books.push({ name, quests });
    }
  }
}

if (books.length === 0) {
  console.error(`no FTB Quests books under ${DIRS.join(', ')}`);
  process.exit(2);
}

function walk(dir, base, out) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const rel = base === '' ? name : `${base}/${name}`;
    if (statSync(full).isDirectory()) walk(full, rel, out);
    else out.push({ path: normalizePath(rel), bytes: new Uint8Array(readFileSync(full)) });
  }
  return out;
}

const tally = (entries, severity) => {
  const counts = new Map();
  for (const e of entries) {
    if (e.severity !== severity) continue;
    counts.set(e.code, (counts.get(e.code) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).map(([code, n]) => `${code}×${n}`).join(' ');
};

let failures = 0;
for (const { name, quests } of books) {
  const files = walk(quests, '', []);
  const started = performance.now();
  try {
    const run = await convertVfs(files, OPTIONS);
    const ms = Math.round(performance.now() - started);
    const entries = run.reportJson?.entries ?? [];
    const verdict = run.failed ? ' FAIL ' : '  ok  ';
    if (run.failed) failures++;
    console.log(
      `${verdict} ${name} — in=${run.filesIn} out=${run.filesOut} errors=${run.errors} warnings=${run.warnings} notes=${run.notes} (${ms} ms)`,
    );
    if (run.failed) {
      console.log(`       fatal: ${run.fatal ?? '(none)'}`);
      const errors = tally(entries, 'error');
      if (errors) console.log(`       errors: ${errors}`);
      for (const e of entries.filter((e) => e.severity === 'error').slice(0, 6)) {
        console.log(`         ${e.code} ${e.path ?? ''}${e.line ? `:${e.line}` : ''} ${e.message}`);
      }
    }
    if (process.env['CORPUS_VERBOSE']) {
      const warnings = tally(entries, 'warning');
      if (warnings) console.log(`       warnings: ${warnings}`);
    }
  } catch (error) {
    failures++;
    console.log(` THROW ${name} — ${error instanceof Error ? error.stack : String(error)}`);
  }
}

console.log(`\n${books.length - failures}/${books.length} books convert${OPTIONS.allowLoss ? ' with loss allowed' : ''}`);
process.exit(failures === 0 ? 0 : 1);
