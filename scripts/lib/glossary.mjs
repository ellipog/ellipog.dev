/**
 * The site's glossary: the shared file at the root, plus each mod's own terms, merged into one
 * vocabulary.
 *
 * WHY THE SHARED FILE IS STILL FIRST
 *
 * A term more than one mod needs cannot live in any one of them, so `glossary.json` at the site root
 * stays the home of the shared vocabulary and is read first. A mod may add `docs/glossary.json` for
 * the terms it coined; because `[[term]]` resolves against the merged set, a mod *uses* a shared term
 * without redefining it, and only defines what is its own.
 *
 * WHY A COLLISION IS A FAILURE
 *
 * Two sources claiming one id — or, just as bad, one word for a reader — is a build failure, not a
 * silent win for whichever file was read last. The author cannot see the other file while writing, so
 * a term that quietly points at somebody else's definition is exactly the kind of mistake this site
 * cannot catch later: the page renders, the tooltip is wrong, and nothing looks broken. The failure
 * names both files, and the fix is almost always "the shared file is where that term belongs".
 *
 * WHY THE UNION IS COMPUTED RATHER THAN COPIED INTO EACH MOD
 *
 * A copy of the vocabulary beside each mod would be a second home for it, stale the moment a term is
 * added — the failure this whole site exists to prevent. `glossary.mjs` prints the merged list instead,
 * so there is nothing to copy and nothing to drift.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SITE } from './repos.mjs';

/** The id shape a term must have: the thing a document names inside `[[like-this]]`. */
export const TERM_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Every glossary file the site reads, with the names a problem uses for each.
 *
 * The shared file is labelled `shared` and is required — it is committed, and its absence is a broken
 * checkout rather than an empty glossary. A mod's file is labelled with the mod's id and is optional: a
 * mod without a glossary is the normal case. The label travels on each entry, so a collision can name
 * the file the other definition came from.
 */
export function glossarySources(sections) {
  return [
    { file: join(SITE, 'glossary.json'), label: 'shared', where: 'glossary.json', required: true },
    ...sections.map((section) => {
      const docsPath = section.mod.docsPath ?? 'docs';
      return {
        file: join(section.repoDir, docsPath, 'glossary.json'),
        label: section.mod.id,
        where: `${section.mod.id}/${docsPath}/glossary.json`,
        required: false,
      };
    }),
  ];
}

/**
 * Read one glossary file and check it.
 *
 * The same shape everywhere: a `terms` array, plus whatever `/*` comment keys an author leaves beside
 * it. A file that exists and is wrong is a problem, named with the file and the term so it can be
 * fixed by opening the file the message names.
 */
export function readGlossaryFile(file, { label, where, problems, required = false }) {
  if (!file || !existsSync(file)) {
    if (required) problems.push(`${where}: missing -- the site's shared vocabulary has to exist`);
    return [];
  }

  let document;
  try {
    document = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    problems.push(`${where}: not valid JSON -- ${String(err.message).split('\n')[0]}`);
    return [];
  }
  if (!document || !Array.isArray(document.terms)) {
    problems.push(`${where}: no "terms" array`);
    return [];
  }

  const entries = [];
  document.terms.forEach((term, index) => {
    const at = `${where}: term ${index + 1}`;
    if (!term || typeof term !== 'object' || Array.isArray(term)) {
      problems.push(`${at} is not an object`);
      return;
    }
    if (typeof term.id !== 'string' || !TERM_ID.test(term.id)) {
      problems.push(`${at}: the id ${JSON.stringify(term.id)} is not lowercase letters, digits and hyphens`);
      return;
    }
    if (typeof term.term !== 'string' || term.term.trim() === '') {
      problems.push(`${where}: the term "${term.id}" has no name`);
      return;
    }
    if (typeof term.definition !== 'string' || term.definition.trim() === '') {
      problems.push(`${where}: the term "${term.id}" has no definition`);
      return;
    }
    if (term.see !== undefined && (!Array.isArray(term.see) || term.see.some((id) => typeof id !== 'string'))) {
      problems.push(`${where}: the term "${term.id}" has a "see" that is not a list of ids`);
      return;
    }
    entries.push({ ...term, source: label });
  });

  return entries;
}

/**
 * The union: the shared file, then each mod's, in manifest order.
 *
 * Order is the reading rule as well as the reading order — the shared file is consulted first — and it
 * is preserved into the generated copy, so the glossary page's own sort is the only reordering a
 * reader sees.
 */
export function mergeGlossaries(sources, problems) {
  const terms = [];
  for (const source of sources) {
    terms.push(...readGlossaryFile(source.file, { ...source, problems }));
  }

  const byId = new Map();
  const byWord = new Map();
  for (const term of terms) {
    const idTaken = byId.get(term.id);
    const wordTaken = byWord.get(term.term.trim().toLowerCase());
    if (idTaken) {
      problems.push(
        `${term.source}: the id "${term.id}" is already defined in ${idTaken.source} -- ` +
          'a term two sources need belongs in glossary.json at the site root',
      );
    } else {
      byId.set(term.id, term);
    }
    if (wordTaken) {
      problems.push(`${term.source}: the term "${term.term}" is already defined in ${wordTaken.source}`);
    } else {
      byWord.set(term.term.trim().toLowerCase(), term);
    }
  }

  // `see` is a link between terms, so a dangling one is a broken link, and the same rule applies: say
  // which file, and which term in it.
  for (const term of terms) {
    for (const other of term.see ?? []) {
      if (!byId.has(other)) {
        problems.push(`${term.source}: the term "${term.id}" says see "${other}", which nothing defines`);
      }
    }
  }

  return terms;
}

/**
 * The copy the MDX components import, written into `apps/docs/`.
 *
 * `source` is a build-time fact and is stripped here: the components' shape is a term, and a reader
 * does not need to know which file it came from.
 */
export function generatedGlossary(terms) {
  return (
    JSON.stringify(
      {
        '/*':
          'Generated by scripts/sync.mjs: the shared vocabulary from glossary.json at the site root, ' +
          "then each mod's docs/glossary.json, in manifest order. Edit a term in the file that defines it.",
        terms: terms.map(({ source, ...term }) => term),
      },
      null,
      2,
    ) + '\n'
  );
}
