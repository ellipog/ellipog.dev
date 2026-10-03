#!/usr/bin/env node
/**
 * glossary.mjs -- print the site's merged glossary: the shared file, then each mod's own terms.
 *
 * Read-only, and it exists for the moment before a term is written. The vocabulary is a union of files
 * in different repositories, so an author working in one of them cannot see all of it — and the one
 * mistake that union makes possible is defining a word that is already defined somewhere else. The
 * sync catches that at build time; this prints the whole list on demand, so it can be caught before
 * writing rather than after.
 *
 * It is deliberately not a copy-into-the-mod step. A copy of the vocabulary sitting beside a mod would
 * be a second home for it, stale the moment a term is added — the failure the site is built to avoid.
 * The union is computed here, every time, and nothing is written anywhere.
 *
 * It reports the same problems the sync would: a malformed file, a duplicate id, the same word from
 * two sources, a `see` that points at nothing.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SITE, materialise } from './lib/repos.mjs';
import { glossarySources, mergeGlossaries } from './lib/glossary.mjs';

const manifest = JSON.parse(readFileSync(join(SITE, 'manifest.json'), 'utf8'));

const problems = [];
const sections = [];
for (const mod of manifest.suite.filter((m) => m.status === 'active')) {
  const where = materialise(mod, problems);
  if (where.dir) sections.push({ mod, repoDir: where.dir });
}

const sources = glossarySources(sections);
const whereOf = new Map(sources.map((source) => [source.label, source.where]));
const terms = mergeGlossaries(sources, problems);

if (terms.length === 0) {
  console.log('glossary: no terms defined anywhere yet.');
} else {
  console.log(`glossary: ${terms.length} term(s), ${new Set(terms.map((t) => t.source)).size} file(s)`);
  let current = null;
  for (const term of terms) {
    if (term.source !== current) {
      current = term.source;
      console.log(`\n  ${current}  ${whereOf.get(current) ?? ''}`);
    }
    console.log(`    ${term.id.padEnd(20)} ${term.term}`);
  }
}

if (problems.length > 0) {
  console.error(`\nglossary: ${problems.length} problem(s) -- these would fail the site build:\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exitCode = 1;
}
