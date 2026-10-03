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
 * 2. THE FOLDER NESTING IS THE URL. `docs/guides/tasks.md` becomes `/docs/tasked/guides/tasks/`.
 * 3. A DOCUMENT'S OWN TITLE IS CONSUMED, NOT REPEATED. The first `# heading` sets the page title and is
 *    removed from the body, because the template renders the title. Otherwise the same words appear
 *    twice, once at 24px and again immediately below.
 * 4. A MOD WITH NO `docs/index.md` STILL GETS A LANDING PAGE, generated from the manifest. An authored
 *    `index` always wins.
 * 5. EVERY PAGE IS DISCOVERED BEFORE ANY IS WRITTEN. Cross-mod links need the whole site's page list,
 *    so the sync is two passes: discover everything, then write with the index in hand.
 */

import { execFileSync } from 'node:child_process';
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
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, '..');
const CONTENT = join(SITE, 'apps', 'docs', 'content', 'docs');

/** Where a pinned checkout lands. Gitignored, and safe to delete. */
const CACHE = join(SITE, '.cache');

/**
 * Force the pinned commit even when the repository is present beside this one.
 *
 * Off by default, because a local build should show local edits — that is the whole reason the sibling
 * read exists. On in CI, where there are no siblings to read. It is also how the pin path is tested on
 * a machine that *does* have the repos, which otherwise could not exercise it at all.
 */
const USE_PINS = process.env.ELLIPOG_USE_PINS === '1';

const manifest = JSON.parse(readFileSync(join(SITE, 'manifest.json'), 'utf8'));
const glossary = JSON.parse(readFileSync(join(SITE, 'glossary.json'), 'utf8'));

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

function repoPath(mod) {
  return resolve(SITE, mod.localPath);
}

/**
 * A checkout of one commit, into `.cache/<mod>`.
 *
 * **Why this exists, in one sentence: on a build server there are no sibling folders.** A clone of this
 * repository contains `.gitignore`, `AGENT.md`, `apps`, `manifest.json`, `package.json` and `scripts` —
 * and nothing else. `../tasked` does not exist, so the sibling read finds nothing, every mod is skipped
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
function checkoutPin(mod) {
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
function materialise(mod) {
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

function discover(mod) {
  const where = materialise(mod);

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
    writeMeta(dir, target, rel ? humanise(rel.split(sep).pop()) : mod.name);
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
    frontmatter('Glossary', 'Terms used across the mods, defined once.') +
      'Every term here is also available in any page as a hover definition: write `[[quest]]`.\n\n' +
      '<Glossary />\n',
  );
}

/* ------------------------------------------------------------------ */

function main() {
  rmSync(CONTENT, { recursive: true, force: true });
  mkdirSync(CONTENT, { recursive: true });

  // Next cannot import a module from outside its own project directory, so these are copied in.
  writeFileSync(join(SITE, 'apps', 'docs', 'manifest.json'), readFileSync(join(SITE, 'manifest.json'), 'utf8'));
  writeFileSync(join(SITE, 'apps', 'docs', 'glossary.json'), readFileSync(join(SITE, 'glossary.json'), 'utf8'));

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

  // Pass 2: write, with the whole page index in hand.
  for (const section of sections) writeMod(section);

  writeDocsIndex(sections.map((s) => s.mod));
  writeGlossaryPage();

  // Terms defined but never used are reported, not failed: the glossary is partly a reference in its
  // own right, and a term may be waiting for the page that needs it.
  const unused = glossary.terms.filter((t) => !usedTerms.has(t.id));
  if (unused.length > 0) {
    console.log(`sync: ${unused.length} glossary term(s) defined but not yet referenced: ${unused.map((t) => t.id).join(', ')}`);
  }

  if (problems.length > 0) {
    console.error(`\nsync: ${problems.length} unresolved link(s). A cross-mod link that cannot resolve is a build failure, because the author cannot see the target while writing it:\n`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exitCode = 1;
    return;
  }

  const pages = sections.reduce((n, s) => n + s.pages.length, 0);
  console.log(`sync: ${pages} page(s) across ${sections.length} section(s), ${usedTerms.size} term(s) referenced`);
}

main();
