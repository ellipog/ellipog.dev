#!/usr/bin/env node
/**
 * sync.mjs -- bring every mod's documentation into this site, from the repository that owns it.
 *
 * Run by `bun run build` and `bun run dev`. The failure this exists to prevent is a document living in
 * two places and disagreeing with itself, so every page comes from exactly one repository and is
 * copied every time, never by hand.
 *
 * WHAT SYNCS, AND WHAT DOES NOT
 *
 * Only `<mod>/docs/**`. **The README is deliberately not documentation** and never reaches this site.
 * A README is a front door for somebody who has just landed in the repository -- what it is, how to
 * build it, which jar. Docs are a manual for somebody who has already installed it. A site that mirrors
 * the README shows a build guide to a player.
 *
 * Because only docs sync, `docs/` may be full MDX: nothing there is rendered by GitHub, so there is no
 * compatibility to preserve.
 *
 * THE GLOSSARY
 *
 * The shared vocabulary is `glossary.json` at the site root, read first; a mod may add
 * `docs/glossary.json` for the terms it coined. The union is what `[[term]]` resolves against, and what
 * the generated page and hover cards read. A duplicate id, or one visible word from two sources, fails
 * the build naming both files -- see `lib/glossary.mjs` for why that is a failure rather than a
 * precedence rule. `bun run glossary` prints the union without building anything.
 *
 * THE LINK SYNTAX
 *
 * Two forms, distinguished by the colon, resolved in one pass after every page is known:
 *
 *   [[armature:layout]]           link to Armature's `layout` page, text taken from its title
 *   [[armature:layout|the seam]]  the same link with your own text
 *   [[tasked:guides/tasks#ids]]   a section within a page, with an optional anchor
 *   [[term]]                      a glossary term: hover definition, and listed on /docs/glossary
 *
 * A link to a page that does not exist **fails the build**, with the file it was found in. That is the
 * whole point of resolving at sync time rather than at render time: a cross-mod link is exactly the
 * kind that rots, because the author cannot see the target while writing it.
 *
 * Nothing inside a fenced code block is transformed. That matters more than it sounds -- a doc showing
 * the link syntax would otherwise have its own example rewritten into a link.
 *
 * FIVE RULES
 *
 * 1. THE COPY IS WIPED BEFORE IT IS REBUILT. `apps/docs/content/docs/` is deleted outright, not merged
 *    into. A stale file surviving a re-sync is the drift this exists to prevent.
 * 2. THE FOLDER NESTING IS THE URL. `docs/guides/tasks.md` becomes `/docs/tasked/guides/tasks/`, and
 *    the rail renders each one-level folder as a collapsible group. A folder's `index.md` is the
 *    folder's own page, and it names the group.
 * 3. A DOCUMENT'S OWN TITLE IS CONSUMED, NOT REPEATED. The first `# heading` sets the page title and is
 *    removed from the body, because the template renders the title. Otherwise the same words appear
 *    twice, once at 24px and again immediately below.
 * 4. A MOD WITH NO `docs/index.md` STILL GETS A LANDING PAGE, generated from the manifest. An authored
 *    `index` always wins.
 * 5. EVERY PAGE IS DISCOVERED BEFORE ANY IS WRITTEN. Cross-mod links need the whole site's page list,
 *    so the sync is two passes: discover everything, then write with the index in hand.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

import { SITE, USE_PINS, materialise } from './lib/repos.mjs';
import { generatedGlossary, glossarySources, mergeGlossaries } from './lib/glossary.mjs';

const CONTENT = join(SITE, 'apps', 'docs', 'content', 'docs');
const PUBLIC = join(SITE, 'apps', 'docs', 'public');

const manifest = JSON.parse(readFileSync(join(SITE, 'manifest.json'), 'utf8'));

/** The merged vocabulary: filled in by `mergeGlossary()` once every checkout is known. */
let glossary = { terms: [] };

const problems = [];
const usedTerms = new Set();

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function write(file, body) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body, 'utf8');
}

function frontmatter(title, description, extra = {}) {
  const escape = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const lines = ['---', `title: "${escape(title)}"`];
  if (description) lines.push(`description: "${escape(description)}"`);
  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined || value === null || value === '') continue;
    lines.push(`${key}: ${typeof value === 'string' ? `"${escape(value)}"` : value}`);
  }
  lines.push('---', '');
  return lines.join('\n') + '\n';
}

/**
 * Split a document's own frontmatter from its body.
 *
 * Two bugs came from not doing this, both from the same cause: the source frontmatter is not part of
 * the body, and treating it as one means it gets copied into the generated file as a second `---`
 * block, while `leadingHeading` stops finding the title because the file no longer starts with `#`.
 *
 * The frontmatter a document declares is *read* (for `maturity`) and never written through: the
 * generated frontmatter is the site's, and a document does not get to overrule the title the manifest
 * gave it.
 */
function splitFrontmatter(markdown) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(markdown);
  return match
    ? { front: match[1], body: markdown.slice(match[0].length) }
    : { front: '', body: markdown };
}

/** A key out of a document's own frontmatter. */
function declaredKey(markdown, key) {
  const { front } = splitFrontmatter(markdown);
  if (!front) return undefined;
  const match = new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(front);
  return match ? match[1].trim().replace(/^["']|["']$/g, '') : undefined;
}

/** The first heading of a document's body, or null. Anchored, so a banner-then-title keeps its title. */
function leadingHeading(markdown) {
  const match = /^\s*#\s+(.+?)\s*(?:\n|$)/.exec(splitFrontmatter(markdown).body);
  return match ? match[1].trim() : null;
}

function stripLeadingHeading(markdown) {
  return markdown.replace(/^\s*#\s+[^\n]+\n+/, '');
}

/** `config-reference.md` -> `Config reference`. */
function humanise(filename) {
  const base = filename.replace(/\.(md|mdx)$/i, '').replace(/[-_]+/g, ' ');
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function markdownFiles(dir) {
  const found = [];
  const walk = (current) => {
    for (const entry of readdirSync(current).sort()) {
      const path = join(current, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(md|mdx)$/i.test(entry)) found.push(path);
    }
  };
  walk(dir);
  return found;
}

/* ------------------------------------------------------------------ */
/* Pass 1 -- discover every page, so links between mods can resolve     */
/* ------------------------------------------------------------------ */

/**
 * Every page the site will have, keyed by `mod:slug-path`.
 *
 * `index` maps to the section root, so `[[armature:index]]` is the way to link to a section's front
 * page. A link with no colon is a glossary term and is not looked up here.
 */
const pageIndex = new Map();
const sections = [];

/*
 * `repoPath`, `checkoutPin` and `materialise` live in `lib/repos.mjs` now: `glossary.mjs` has to answer
 * the same "where is this mod's checkout" question, and one definition is what keeps the two honest.
 */

function discover(mod) {
  const where = materialise(mod, problems);

  if (!where.dir) {
    return {
      mod,
      status: 'skipped',
      note: `no repository at ${mod.localPath}${mod.pin ? '' : ' and no pin'}`,
    };
  }

  const docsDir = join(where.dir, mod.docsPath ?? 'docs');
  if (!existsSync(docsDir) || !statSync(docsDir).isDirectory()) {
    return { mod, status: 'skipped', note: `no docs/ folder in ${where.source}` };
  }

  const files = markdownFiles(docsDir);
  if (files.length === 0) return { mod, status: 'skipped', note: 'docs/ is empty' };

  const pages = [];
  for (const file of files) {
    const rel = relative(docsDir, file);
    const parts = rel.split(sep);
    const filename = parts.pop();
    const slugged = filename.replace(/\.(md|mdx)$/i, '').toLowerCase();
    const isIndex = slugged === 'index';
    const slugPath = isIndex ? parts.map((p) => p.toLowerCase()) : [...parts.map((p) => p.toLowerCase()), slugged];

    const raw = readFileSync(file, 'utf8');
    const title = leadingHeading(raw) ?? (isIndex ? mod.name : humanise(filename));
    const url = `/docs/${[mod.id, ...slugPath].filter(Boolean).join('/')}/`;

    const page = { file, raw, slugged, isIndex, parts, slugPath, title, url };

    pages.push(page);
    // Keys: the root index answers to `mod:index` and to the bare mod id, because that reads more
    // naturally for a whole section. A nested index answers to its own folder path -- `mod:toolkit` --
    // which is what keeps it addressable. Before this, every `index.md` claimed `mod:index`, so a
    // subfolder's front page silently replaced the mod's own: the link resolved, to the wrong page.
    const key = isIndex ? slugPath.join('/') || 'index' : slugPath.join('/');
    pageIndex.set(`${mod.id}:${key}`, page);
    if (isIndex && slugPath.length === 0) pageIndex.set(`${mod.id}:`, page);
  }

  return { mod, status: 'synced', pages, repoDir: where.dir, source: where.source };
}

/* ------------------------------------------------------------------ */
/* The transforms                                                      */
/* ------------------------------------------------------------------ */

/**
 * Resolve `[[...]]` to markdown, and report anything that cannot resolve.
 *
 * Returning the original text on failure means the error message can show what was written, which is
 * more use than a partially substituted line.
 */
function resolveLink(inner, where) {
  const [target, label] = inner.split('|', 2);

  // A colon means a cross-mod link; no colon means a glossary term.
  if (target.includes(':')) {
    const [modId, rawPath] = target.split(':', 2);
    const [slugPath, anchor] = rawPath.split('#', 2);
    const key = `${modId}:${slugPath}`;

    const page = pageIndex.get(key);
    if (!page) {
      const known = [...pageIndex.keys()].filter((k) => k.startsWith(`${modId}:`)).length;
      problems.push(
        known === 0
          ? `${where}: [[${target}]] -- no mod "${modId}" has any pages`
          : `${where}: [[${target}]] -- "${modId}" has no page "${slugPath || 'index'}"`,
      );
      return `[[${inner}]]`;
    }

    const href = anchor ? `${page.url}#${anchor}` : page.url;
    return `[${label ?? page.title}](${href})`;
  }

  const id = target.trim().toLowerCase();
  const entry = glossary.terms.find((t) => t.id === id);
  if (!entry) {
    problems.push(`${where}: [[${target}]] -- not a glossary term`);
    return `[[${inner}]]`;
  }

  usedTerms.add(id);
  // The visible text defaults to the term's own casing, so a doc can write [[quest]] and get "Quest".
  return label
    ? `<GlossaryTerm term="${id}">${label}</GlossaryTerm>`
    : `<GlossaryTerm term="${id}" />`;
}

/**
 * The whole body transform, in one line-walking pass: GFM alerts into components, `[[...]]` into links.
 *
 * One pass rather than two because both need the same state -- whether the current line is inside a
 * fenced code block. Composing two independent text rewrites would have each of them transform the
 * other's output, and neither would know about fences.
 */
function transformBody(markdown, where) {
  const lines = markdown.split('\n');
  const out = [];
  let fence = null;

  const substitute = (text) => text.replace(/\[\[([^\]\n]+)\]\]/g, (_whole, inner) => resolveLink(inner, where));

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fenceMark = /^\s*(`{3,}|~{3,})/.exec(line);

    // Inside a fence: everything is literal, and only the closing mark matters.
    if (fence) {
      out.push(line);
      if (fenceMark && fenceMark[1][0] === fence[0]) fence = null;
      continue;
    }
    if (fenceMark) {
      fence = fenceMark[1];
      out.push(line);
      continue;
    }

    const alert = /^>\s*\[!(NOTE|TIP|WARNING|CAUTION|IMPORTANT)\]\s*$/i.exec(line);
    if (alert) {
      const kind = alert[1].toLowerCase();
      const body = [];
      let j = i + 1;
      for (; j < lines.length && /^>/.test(lines[j]); j += 1) body.push(lines[j].replace(/^>\s?/, ''));
      while (body.length > 0 && body[body.length - 1].trim() === '') body.pop();

      // Blank lines around the body, or MDX parses a JSX block element's contents as raw text.
      out.push(`<Callout kind="${kind}">`, '', ...body.map(substitute), '', '</Callout>');
      i = j - 1;
      continue;
    }

    out.push(substitute(line));
  }

  return out.join('\n');
}

/* ------------------------------------------------------------------ */
/* Pass 2 -- write                                                      */
/* ------------------------------------------------------------------ */

function writeMeta(dir, targetDir, title) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const pages = entries
    .filter((e) => e.isFile() && /\.(md|mdx)$/i.test(e.name))
    .map((e) => e.name.replace(/\.(md|mdx)$/i, '').toLowerCase())
    // `index` first: it is the section's own page, not one of its children. It stays in the list
    // rather than being left implicit, because `pages` is an ordering and a page left out of it can
    // end up somewhere unexpected.
    .sort((a, b) => (a === 'index' ? -1 : b === 'index' ? 1 : a.localeCompare(b)));

  write(
    join(targetDir, 'meta.json'),
    JSON.stringify(
      {
        title,
        pages: [
          ...pages,
          ...entries
            .filter((e) => e.isDirectory())
            .map((e) => e.name)
            .sort(),
        ],
      },
      null,
      2,
    ) + '\n',
  );
}

/**
 * What the generated tree calls a folder.
 *
 * A folder with an `index.md` is called whatever that page calls itself: `api/index.md` titled "The API"
 * is the section "The API", where humanising the folder name would print "Api". A folder with no index
 * page has nothing to borrow a name from, and its folder name is all there is.
 */
function folderTitle(section, dir, docsDir) {
  if (dir === docsDir) return section.mod.name;
  const index = section.pages.find((page) => page.isIndex && dirname(page.file) === dir);
  return index?.title ?? humanise(relative(docsDir, dir).split(sep).pop());
}

function writeMod(section) {
  const { mod, pages } = section;
  const out = join(CONTENT, mod.id);

  for (const page of pages) {
    const where = relative(resolve(SITE, '..'), page.file);
    const { body: sourceBody } = splitFrontmatter(page.raw);
    const body = transformBody(stripLeadingHeading(sourceBody), where);
    // Only `maturity` is read from the source's own frontmatter; the rest is generated. See declaredKey.
    const maturity = declaredKey(page.raw, 'maturity');
    // The folder is the URL for an index too: `toolkit/index.md` writes `toolkit/index.mdx`. Every
    // index used to write the mod's root `index.mdx`, so a subfolder's front page replaced the mod's
    // own -- the landing page vanished from the site with nothing in the log to say so.
    const target = [out, ...page.parts.map((p) => p.toLowerCase()), `${page.slugged}.mdx`];
    write(join(...target), frontmatter(page.title, '', maturity ? { maturity } : {}) + body);
  }

  // A section's own front page, not a subfolder's: a mod whose only index is `guides/index.md`
  // still needs the generated one at its root.
  if (!pages.some((p) => p.isIndex && p.parts.length === 0)) {
    write(
      join(out, 'index.mdx'),
      frontmatter(mod.name, mod.summary) +
        `This section has no overview page yet. Its documentation lives in the\n` +
        `[${mod.name} repository](${mod.repo ?? '#'}), and the pages below are what it has so far.\n`,
    );
  }

  const docsDir = join(section.repoDir, mod.docsPath ?? 'docs');
  for (const dir of new Set([docsDir, ...pages.map((p) => dirname(p.file))])) {
    const rel = relative(docsDir, dir);
    const target = rel ? join(out, rel) : out;
    mkdirSync(target, { recursive: true });
    writeMeta(dir, target, folderTitle(section, dir, docsDir));
  }

  return pages.length;
}

/** The `/docs/` landing page: an intro, then a contents list rendered from what synced. */
function writeDocsIndex(mods) {
  write(
    join(CONTENT, 'index.mdx'),
    frontmatter('Documentation', manifest.site?.description ?? 'Manuals for the mods.') +
      [
        'Every page here is written in the repository that owns the mod and copied in when this site',
        'builds. Nothing is authored on this site, which is the whole reason it cannot drift from the',
        'code it describes.',
        '',
      ].join('\n'),
  );
  write(
    join(CONTENT, 'meta.json'),
    JSON.stringify(
      { title: 'Documentation', pages: [...mods.map((m) => m.id), 'glossary'] },
      null,
      2,
    ) + '\n',
  );
}

/**
 * The glossary page.
 *
 * The terms themselves are rendered by a component that reads `glossary.json`, so the page is a
 * one-line file and the list cannot disagree with the definitions the hover cards use. The page has to
 * be generated rather than authored because a route has to exist, and routes under `content/` are all
 * generated.
 */
function writeGlossaryPage() {
  write(
    join(CONTENT, 'glossary.mdx'),
    frontmatter('Glossary', 'Terms used across the mods, each defined in the file that owns it.') +
      'Every term here is also available in any page as a hover definition: write `[[quest]]`.\n\n' +
      '<Glossary />\n',
  );
}

/**
 * A mod's published schemas, served from `public/`.
 *
 * A schema's `$id` is a promise that the URL answers -- a pack's `"$schema"` names it and an editor
 * fetches it. The docs walker reads markdown only, deliberately, so `_schema/*.schema.json` can
 * never reach the site through it; they are copied file-for-file instead, and the copy is asserted
 * to be exactly the source set: a schema added upstream but not copied would 404 from every editor,
 * and one deleted upstream but left here would answer forever.
 *
 * The target is `public/<mod>/_schema/`, because that is the path the `$id`s already name and Next
 * copies `public/` wholesale into the build. `docs/*.schema.json` -- the one-file format's schema --
 * lands under `_legacy/` for the same reason.
 */
function copySchemas(mod) {
  const { dir, source } = materialise(mod, problems);
  if (!dir) return;

  const kindsDir = join(dir, 'tools', 'quests', '_schema');
  const docsDir = join(dir, 'docs');
  const kinds = existsSync(kindsDir)
    ? readdirSync(kindsDir)
        .filter((name) => name.endsWith('.schema.json'))
        .sort()
    : [];
  const legacy = existsSync(docsDir)
    ? readdirSync(docsDir)
        .filter((name) => name.endsWith('.schema.json'))
        .sort()
    : [];
  if (kinds.length === 0 && legacy.length === 0) return; // a mod with no schemas publishes none

  // Rule 1 applies here too: the copy is wiped before it is rebuilt, or a schema deleted upstream
  // survives as a URL that still answers.
  const target = join(PUBLIC, mod.id);
  rmSync(target, { recursive: true, force: true });

  for (const name of kinds) {
    write(join(target, '_schema', name), readFileSync(join(kindsDir, name), 'utf8'));
  }
  for (const name of legacy) {
    write(join(target, '_legacy', name), readFileSync(join(docsDir, name), 'utf8'));
  }

  if (kinds.length > 0) {
    const copied = readdirSync(join(target, '_schema')).sort();
    if (copied.join('\n') !== kinds.join('\n')) {
      problems.push(`${mod.id}: copied ${copied.length} schema(s) where the checkout has ${kinds.length}`);
      return;
    }
  }
  console.log(
    `  + ${mod.id.padEnd(10)} ${kinds.length} schema(s) + ${legacy.length} legacy -> /${mod.id}/_schema/ (${source})`,
  );
}

/* ------------------------------------------------------------------ */

function main() {
  rmSync(CONTENT, { recursive: true, force: true });
  mkdirSync(CONTENT, { recursive: true });

  // Next cannot import a module from outside its own project directory, so the manifest is copied in.
  // The glossary is written later, merged from every source once the checkouts are known.
  writeFileSync(join(SITE, 'apps', 'docs', 'manifest.json'), readFileSync(join(SITE, 'manifest.json'), 'utf8'));

  // Pass 1: discover. Nothing is written until every page is known, because a cross-mod link needs the
  // list of targets to resolve against.
  const active = manifest.suite.filter((m) => m.status === 'active');
  const planned = manifest.suite.filter((m) => m.status !== 'active');

  console.log(
    `sync: ${manifest.suite.length} mod(s) in the manifest, docs/ only` +
      (USE_PINS ? ' — pins forced' : ''),
  );
  for (const mod of active) {
    const section = discover(mod);
    const mark = section.status === 'synced' ? '+' : '-';
    const detail =
      section.status === 'synced'
        ? `${section.pages.length} page(s) from ${section.source}`
        : section.note;
    console.log(`  ${mark} ${mod.id.padEnd(10)} ${detail}`);
    if (section.status === 'synced') sections.push(section);
  }
  for (const mod of planned) {
    console.log(`  . ${mod.id.padEnd(10)} planned, no page -- listed in the catalog only`);
  }

  if (sections.length === 0) {
    console.error('\nsync: nothing was synced. Check `localPath` and that each mod has a docs/ folder.');
    process.exitCode = 1;
    return;
  }

  // Pass 2: write, with the whole page index in hand. The vocabulary is merged first, because every
  // page resolves its `[[term]]`s against it and the generated copy is what the components import.
  glossary = { terms: mergeGlossaries(glossarySources(sections), problems) };
  write(join(SITE, 'apps', 'docs', 'glossary.json'), generatedGlossary(glossary.terms));

  for (const section of sections) writeMod(section);

  // The schemas, beside the pages: the URLs a pack's `$schema` names have to answer.
  for (const section of sections) copySchemas(section.mod);

  writeDocsIndex(sections.map((s) => s.mod));
  writeGlossaryPage();

  // Where the vocabulary came from, in one line: the shared file and then each mod that defines terms.
  if (glossary.terms.length > 0) {
    const counts = new Map();
    for (const term of glossary.terms) counts.set(term.source, (counts.get(term.source) ?? 0) + 1);
    console.log(`sync: glossary -- ${[...counts].map(([label, n]) => `${n} ${label}`).join(', ')}`);
  }

  // Terms defined but never used are reported, not failed: the glossary is partly a reference in its
  // own right, and a term may be waiting for the page that needs it. The source is named so the
  // author knows which file to open.
  const unused = glossary.terms.filter((t) => !usedTerms.has(t.id));
  if (unused.length > 0) {
    console.log(
      `sync: ${unused.length} glossary term(s) defined but not yet referenced: ${unused.map((t) => `${t.id} (${t.source})`).join(', ')}`,
    );
  }

  if (problems.length > 0) {
    console.error(
      `\nsync: ${problems.length} problem(s). A cross-mod link or a glossary term that cannot resolve is a build failure, because the author cannot see the other file while writing:\n`,
    );
    for (const problem of problems) console.error(`  ${problem}`);
    process.exitCode = 1;
    return;
  }

  const pages = sections.reduce((n, s) => n + s.pages.length, 0);
  console.log(`sync: ${pages} page(s) across ${sections.length} section(s), ${usedTerms.size} term(s) referenced`);
}

main();
