#!/usr/bin/env node
/**
 * sync.mjs -- bring every mod's documentation into this site, from the repository that owns it.
 *
 * Run by `bun run build` and `bun run dev`, so it is never a step anybody has to remember. That is
 * the whole reason it exists: the failure this site is built to avoid is a document that lives in two
 * places and disagrees with itself, and the way to avoid it is to have exactly one place and copy from
 * it every time, never by hand.
 *
 * WHAT SYNCS, AND WHAT DOES NOT
 *
 * Only `<mod>/docs/**`. **The README is deliberately not documentation** and never reaches this site.
 * A README is a front door for somebody who has just landed in the repository -- what it is, how to
 * build it, which jars to install. Docs are the manual for somebody who has already installed it.
 * They overlap a little and are not the same document, and a site that mirrors the README is a site
 * that shows a build guide to a player.
 *
 * Because only docs sync, `docs/` may be full MDX. Nothing there is rendered by GitHub, so there is
 * no compatibility to preserve and no reason to write around it.
 *
 * Four rules:
 *
 * 1. THE COPY IS WIPED BEFORE IT IS REBUILT. `apps/docs/content/` is deleted outright, not merged
 *    into. A deleted document must disappear from the site, and a stale file surviving a re-sync is
 *    exactly the drift this is here to prevent.
 *
 * 2. THE FOLDER NESTING IS THE URL. `docs/guides/tasks.md` in the Tasked repo becomes
 *    `/docs/tasked/guides/tasks/` here. A subfolder is a section; there is no mapping table to keep
 *    in step with the filesystem.
 *
 * 3. A DOCUMENT'S OWN TITLE IS CONSUMED, NOT REPEATED. The first `# heading` sets the page title and
 *    is then removed from the body, because the template renders the title itself. Without this the
 *    same words appear twice, once at 24px and again immediately below -- seen on the first real page.
 *
 * 4. A MOD WITH NO `docs/index.md` STILL GETS A LANDING PAGE, generated from the manifest. A section
 *    that exists but has no front page is a dead end; one sentence from the manifest is better than
 *    a 404, and an authored `index.md` always wins.
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
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, '..');
const WORKSPACE = resolve(SITE, '..');
const CONTENT = join(SITE, 'apps', 'docs', 'content', 'docs');

const manifest = JSON.parse(readFileSync(join(SITE, 'manifest.json'), 'utf8'));

/** Where a mod's repository is on this machine. `localPath` is relative to this site's folder. */
function repoPath(mod) {
  return resolve(SITE, mod.localPath);
}

function write(file, body) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body, 'utf8');
}

/**
 * Frontmatter for a page.
 *
 * The title is passed in rather than parsed here, because the caller has already had to look at the
 * document to decide where its heading went.
 */
function frontmatter(title, description) {
  const escape = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const lines = ['---', `title: "${escape(title)}"`];
  if (description) lines.push(`description: "${escape(description)}"`);
  lines.push('---', '');
  return lines.join('\n') + '\n';
}

/**
 * The first heading of a markdown file, or null.
 *
 * Anchored to the start of the file, so a document that opens with a banner image or a badge row and
 * *then* has its title keeps that title -- it is there deliberately, and removing it would be taking
 * something the author wrote.
 */
function leadingHeading(markdown) {
  const match = markdown.match(/^\s*#\s+(.+?)\s*(?:\n|$)/);
  return match ? match[1].trim() : null;
}

/** The same heading, removed from the body. See rule 3. */
function stripLeadingHeading(markdown) {
  return markdown.replace(/^\s*#\s+[^\n]+\n+/, '');
}

/**
 * Turn GFM alerts into `<Callout>` components.
 *
 * A blockquote written as
 *
 *     > [!NOTE]
 *     > Something worth knowing.
 *
 * is a callout, and GitHub renders it as one. Doing the same here means the source stays plain
 * markdown -- readable in an editor, readable on GitHub, no import needed -- while the site gets a
 * component with a label and its own weight.
 *
 * Done as a text transform rather than a remark plugin, and deliberately: it keeps the build config
 * as it is, needs no AST library, and sits with the other things this script already rewrites
 * (frontmatter, the leading heading). The limit is that it reads contiguous `>` lines, so a
 * blockquote with a lazy continuation -- a paragraph line with no `>` marker -- ends the callout
 * early. Nothing in these docs is written that way, and a callout that swallows too little is a
 * cosmetic failure rather than a broken page.
 */
function convertAlerts(markdown) {
  const lines = markdown.split('\n');
  const out = [];

  for (let i = 0; i < lines.length; i += 1) {
    const opening = /^>\s*\[!(NOTE|TIP|WARNING|CAUTION|IMPORTANT)\]\s*$/i.exec(lines[i]);

    if (!opening) {
      out.push(lines[i]);
      continue;
    }

    const kind = opening[1].toLowerCase();
    const body = [];
    let j = i + 1;
    for (; j < lines.length && /^>/.test(lines[j]); j += 1) {
      body.push(lines[j].replace(/^>\s?/, ''));
    }
    while (body.length > 0 && body[body.length - 1].trim() === '') body.pop();

    // Blank lines around the body: MDX only parses the contents of a JSX block element as markdown
    // when they are set off that way. Without them the callout renders as literal text.
    out.push(`<Callout kind="${kind}">`, '', ...body, '', '</Callout>');
    i = j - 1;
  }

  return out.join('\n');
}

/** `config-reference.md` -> `Config reference`, for a page with no heading of its own. */
function humanise(filename) {
  const base = filename.replace(/\.(md|mdx)$/i, '').replace(/[-_]+/g, ' ');
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/**
 * Walk a directory, returning every markdown file under it.
 *
 * Sorted, so the order is the same on every machine and a page cannot move around the sidebar because
 * of a filesystem quirk somewhere else.
 */
function markdownFiles(dir) {
  const found = [];
  const walk = (current) => {
    for (const entry of readdirSync(current).sort()) {
      const path = join(current, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
      } else if (/\.(md|mdx)$/i.test(entry)) {
        found.push(path);
      }
    }
  };
  walk(dir);
  return found;
}

/** Every directory a set of files lives in, including the root of `docs/`. */
function directoriesOf(files, root) {
  const dirs = new Set([root]);
  for (const file of files) dirs.add(dirname(file));
  return [...dirs].sort();
}

/**
 * Write the `meta.json` that decides a directory's page order.
 *
 * Fumadocs reads this to order the sidebar and to give a section its heading. Written rather than
 * committed for the same reason as everything else here: a hand-maintained ordering file is a second
 * place the page list is written down, and it would silently disagree the first time a page is added.
 */
function writeMeta(dir, targetDir, title) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const pages = entries
    .filter((e) => e.isFile() && /\.(md|mdx)$/i.test(e.name))
    .map((e) => e.name.replace(/\.(md|mdx)$/i, '').toLowerCase())
    // `index` first: it is the section's own page, not one of its children.
    .sort((a, b) => (a === 'index' ? -1 : b === 'index' ? 1 : a.localeCompare(b)));

  const subsections = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  write(
    join(targetDir, 'meta.json'),
    JSON.stringify({ title, pages: [...pages, ...subsections] }, null, 2) + '\n',
  );
}

/**
 * Sync one mod's `docs/` folder. Returns a line for the run log.
 */
function syncMod(mod) {
  const repo = repoPath(mod);

  if (!existsSync(repo)) {
    return { id: mod.id, status: 'skipped', note: `no repository at ${mod.localPath}` };
  }

  const docsDir = join(repo, mod.docsPath ?? 'docs');
  if (!existsSync(docsDir) || !statSync(docsDir).isDirectory()) {
    return { id: mod.id, status: 'skipped', note: 'no docs/ folder' };
  }

  const files = markdownFiles(docsDir);
  if (files.length === 0) {
    return { id: mod.id, status: 'skipped', note: 'docs/ is empty' };
  }

  const out = join(CONTENT, mod.id);
  let written = 0;

  for (const file of files) {
    const rel = relative(docsDir, file); // e.g. `guides/tasks.md`
    const parts = rel.split(sep);
    const filename = parts.pop();
    const slugged = filename.replace(/\.(md|mdx)$/i, '').toLowerCase();
    const isIndex = slugged === 'index';

    const body = readFileSync(file, 'utf8');
    // The title comes from the heading; for an index with no heading it is the mod's own name, since
    // that page is the section's front door rather than one of its children.
    const title = leadingHeading(body) ?? (isIndex ? mod.name : humanise(filename));

    const targetParts = isIndex ? [...parts, 'index'] : [...parts, slugged];
    write(
      join(out, ...targetParts) + '.mdx',
      frontmatter(title, '') + convertAlerts(stripLeadingHeading(body)),
    );
    written += 1;
  }

  // A landing page if the repository does not provide one. See rule 4.
  if (!existsSync(join(out, 'index.mdx'))) {
    write(
      join(out, 'index.mdx'),
      frontmatter(mod.name, mod.summary) +
        `This section has no overview page yet. Its documentation lives in the\n` +
        `[${mod.name} repository](${mod.repo ?? '#'}), and the pages below are what it has so far.\n`,
    );
  }
  for (const dir of directoriesOf(files, docsDir)) {
    const rel = relative(docsDir, dir);
    const target = rel ? join(out, rel) : out;
    mkdirSync(target, { recursive: true });
    const title = rel ? humanise(rel.split(sep).pop()) : mod.name;
    writeMeta(dir, target, title);
  }

  return {
    id: mod.id,
    status: 'synced',
    note: `${written} page(s)${existsSync(join(docsDir, 'index.md')) || existsSync(join(docsDir, 'index.mdx')) ? '' : ' + generated landing'}`,
  };
}

/**
 * The `/docs/` landing page.
 *
 * Intro then contents. The intro is authored here because it is the same sentence for every build;
 * the contents are deliberately *not* written into the file -- they are rendered from what actually
 * synced, so a page that does not exist cannot be listed and a page that does cannot be missed.
 */
function writeDocsIndex(mods) {
  const lines = [
    '---',
    'title: "Documentation"',
    `description: "${(manifest.site?.description ?? 'Manuals for the mods.').replace(/"/g, '\\"')}"`,
    '---',
    '',
    'Every page here is written in the repository that owns the mod and copied in when this site',
    'builds. Nothing is authored on this site, which is the whole reason it cannot drift from the',
    'code it describes.',
    '',
  ];
  write(join(CONTENT, 'index.mdx'), lines.join('\n'));
  write(
    join(CONTENT, 'meta.json'),
    JSON.stringify({ title: 'Documentation', pages: ['index', ...mods.map((m) => m.id)] }, null, 2) + '\n',
  );
}

function main() {
  rmSync(CONTENT, { recursive: true, force: true });
  mkdirSync(CONTENT, { recursive: true });

  // The catalog page reads the manifest, and Next cannot resolve a module outside its own project
  // directory -- so it is copied in rather than imported across the workspace root.
  writeFileSync(
    join(SITE, 'apps', 'docs', 'manifest.json'),
    readFileSync(join(SITE, 'manifest.json'), 'utf8'),
  );

  const active = manifest.suite.filter((m) => m.status === 'active');
  const planned = manifest.suite.filter((m) => m.status !== 'active');

  console.log(`sync: ${manifest.suite.length} mod(s) in the manifest, docs/ only`);
  const synced = [];
  for (const mod of active) {
    const result = syncMod(mod);
    console.log(`  ${result.status === 'synced' ? '+' : '-'} ${result.id.padEnd(10)} ${result.note}`);
    if (result.status === 'synced') synced.push(mod);
  }
  for (const mod of planned) {
    console.log(`  . ${mod.id.padEnd(10)} planned, no page -- listed in the catalog only`);
  }

  writeDocsIndex(synced);

  if (synced.length === 0) {
    console.error('\nsync: nothing was synced. Check `localPath` and that each mod has a docs/ folder.');
    process.exitCode = 1;
    return;
  }
  console.log(`sync: ${synced.length} mod section(s) written to apps/docs/content/docs/`);
}

main();
