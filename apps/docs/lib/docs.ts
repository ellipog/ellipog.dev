import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getTableOfContents } from 'fumadocs-core/content/toc';
import type { TOCItemType } from 'fumadocs-core/toc';

import { source } from '@/lib/source';
import manifest from '@/manifest.json';

/**
 * Helpers for a docs page. Server-only -- one of these reads the filesystem.
 */

type SuiteMod = {
  id: string;
  name: string;
  summary: string;
  repo?: string;
  issues?: string;
  version?: string;
  minecraft?: string;
  loaders?: string[];
};

export const mods = manifest.suite as SuiteMod[];

/**
 * Loader ids as their own names spell them.
 *
 * **Not derived, and the screenshot is why.** Capitalising the id gives `Neoforge`, which is wrong —
 * the loader is `NeoForge`, with a capital F, and the same is true of `NeoForge` in a mod's own
 * `modLoader` field. The id is an identifier and belongs lowercase in the manifest, where it is
 * compared and not read; the display name is a separate fact and has to be written down.
 *
 * A lookup means an unknown loader id shows through as itself rather than as a wrong capitalisation,
 * which is the right failure: `Quilt` would appear as `quilt` and be obvious, where `Neoforge` looked
 * like a typo somebody had made on purpose.
 */
const LOADER_NAMES: Record<string, string> = {
  fabric: 'Fabric',
  neoforge: 'NeoForge',
  forge: 'Forge',
  quilt: 'Quilt',
};

function loaderName(id: string): string {
  return LOADER_NAMES[id.toLowerCase()] ?? id;
}

/**
 * The one-line facts a page needs before it is read.
 *
 * Nobody should read a page for a version they are not running, and today almost every page needs that
 * caveat. Built from the manifest, so it cannot go stale the way a hand-written "requires 1.21.1" in
 * prose would -- and it disappears entirely for a mod that has none of these fields.
 */
export function prerequisitesOf(mod: SuiteMod | undefined): string | null {
  if (!mod) return null;
  const parts = [
    mod.minecraft ? `Minecraft ${mod.minecraft}` : null,
    mod.loaders?.length ? mod.loaders.map(loaderName).join(' + ') : null,
    mod.version ? `${mod.name} ${mod.version}` : null,
  ].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** The manifest entry a page belongs to, from the first slug segment. */
export function sectionOf(slugs: string[]): SuiteMod | undefined {
  return mods.find((mod) => mod.id === slugs[0]);
}

/**
 * The contents of a page, read from the file this site generated.
 *
 * **This reads from disk rather than from page data, and that is not laziness.** The schema Fumadocs
 * applies to a page has no `toc` field, so the table of contents is computed and then dropped before
 * anything can read it. The file is still on disk under `content/`, so this reads that and asks
 * Fumadocs to derive the contents from it -- the same code path that assigns the heading ids in the
 * first place, which is what keeps the links and the headings in agreement.
 *
 * **A section's front page is `index.mdx`, not `<slug>.mdx`.** `/docs/tasked/` has slugs `['tasked']`,
 * which naively resolves to `tasked.mdx` -- a file that does not exist. This cost a silent failure:
 * every section landing page got an empty contents list and therefore no rail, while every ordinary
 * page worked, so it looked like a styling rule rather than a path bug. The fallback is the same
 * resolution Fumadocs does internally.
 *
 * Returns an empty list rather than throwing when nothing is found: a page with no contents rail is a
 * smaller failure than a page that will not build.
 */
export function tocOf(slugs: string[]): TOCItemType[] {
  const base = join(process.cwd(), 'content', 'docs', ...slugs);
  const file = existsSync(`${base}.mdx`) ? `${base}.mdx` : join(base, 'index.mdx');

  let raw: string;
  try {
    if (!existsSync(file)) return [];
    raw = readFileSync(file, 'utf8');
  } catch {
    return [];
  }

  // The frontmatter would be parsed as prose and could contribute a heading of its own.
  const body = raw.replace(/^---\n[\s\S]*?\n---\n/, '');
  return getTableOfContents(body);
}

/**
 * A page's maturity marker, read from the generated file.
 *
 * **Read from disk rather than from `page.data`, because the schema strips it.** Fumadocs applies
 * `pageSchema` to every page, and that schema is built with `z.core.$strip` — so an unknown
 * frontmatter key is silently discarded before anything can read it. `maturity` is not in the schema,
 * so `page.data.maturity` is always `undefined` and the marker never rendered.
 *
 * The alternative was extending the schema (`pageSchema.extend({ maturity: ... })`), which means
 * importing Zod and pinning a schema from a library whose own docs mark the export as version-sensitive
 * — a lot of coupling for one string. `tocOf` already established reading the generated file for
 * exactly this reason, so this follows the same route and the two helpers agree about where a page lives.
 *
 * Returns undefined rather than throwing when the file or the key is missing: a page with no marker is
 * the normal case, not a failure.
 */
export function maturityOf(slugs: string[]): string | undefined {
  const base = join(process.cwd(), 'content', 'docs', ...slugs);
  const file = existsSync(`${base}.mdx`) ? `${base}.mdx` : join(base, 'index.mdx');
  if (!existsSync(file)) return undefined;

  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(file, 'utf8'))?.[1];
  if (!front) return undefined;

  const value = /^maturity:\s*(.+)$/m.exec(front)?.[1]?.trim().replace(/^["']|["']$/g, '');
  // An allowlist, because the class name it becomes goes straight into the markup.
  return value === 'draft' || value === 'stable' || value === 'unreleased' ? value : undefined;
}

export type Neighbour = { url: string; title: string };

/** One page as the rail and the contents list show it. */
export type DocPage = ReturnType<typeof source.getPages>[number];

export type PageGroup = {
  /** The folder's name -- its first path segment, which is what the sync groups by. */
  folder: string;
  /** What the folder is called: the title the sync gave it, which is its own page's title or its name. */
  label: string;
  pages: DocPage[];
};

export type SectionTree = {
  mod: SuiteMod;
  /** The section's front page. */
  overview?: DocPage;
  /** Pages at the section's top level, beside the folders rather than in one. */
  loose: DocPage[];
  groups: PageGroup[];
  /** Every page of the section in the order the rail shows them. */
  ordered: DocPage[];
};

const byUrl = (a: DocPage, b: DocPage) => a.url.localeCompare(b.url);

/**
 * The folders a section actually has, read from the generated tree.
 *
 * **Why the filesystem and not the page list.** Fumadocs reports a folder's front page and an ordinary
 * top-level page with the same shape: `/docs/armature/api/` is `['armature','api']` and
 * `/docs/tasked/commands/` is `['tasked','commands']`, so the pages alone cannot say which second
 * segment is a folder and which is a page. The generated content directory can, and it is the same tree
 * the rail is describing -- `sync.mjs` writes it, and writes a `meta.json` into every folder it makes.
 */
function foldersOf(modId: string): string[] {
  const dir = join(process.cwd(), 'content', 'docs', modId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** What the sync called a folder: its own page's title, or its humanised name. */
function folderLabel(modId: string, folder: string): string {
  try {
    const title = JSON.parse(readFileSync(join(process.cwd(), 'content', 'docs', modId, folder, 'meta.json'), 'utf8'))
      .title;
    if (typeof title === 'string' && title !== '') return title;
  } catch {
    // A folder the sync made always has one; a hand-made tree might not, and the name is the fallback.
  }
  return folder.replace(/[-_]+/g, ' ').replace(/^./, (char) => char.toUpperCase());
}

/**
 * One mod's pages, arranged the way the site shows them.
 *
 * One definition for the rail, the contents list on `/docs/` and the previous/next row, because all
 * three are answering "what order are these pages in" and three answers would drift. The order is: the
 * section's front page, the top-level pages, then one group per folder -- folders in name order, and
 * each folder's pages with its own front page first.
 */
export function sectionTreeOf(mod: SuiteMod): SectionTree {
  const own = source.getPages().filter((page) => page.slugs[0] === mod.id);
  const overview = own.find((page) => page.slugs.length === 1);
  const rest = own.filter((page) => page !== overview);

  const folders = foldersOf(mod.id);
  const loose = rest.filter((page) => !folders.includes(page.slugs[1] ?? '')).sort(byUrl);

  const groups = folders
    .map((folder) => ({
      folder,
      label: folderLabel(mod.id, folder),
      pages: rest
        .filter((page) => page.slugs[1] === folder)
        .sort((a, b) => a.slugs.length - b.slugs.length || byUrl(a, b)),
    }))
    .filter((group) => group.pages.length > 0);

  const ordered = [overview, ...loose, ...groups.flatMap((group) => group.pages)].filter(Boolean) as DocPage[];
  return { mod, overview, loose, groups, ordered };
}

/**
 * Every section with pages, for the rail and the contents list.
 *
 * Derived from `source.getPages()` rather than from the manifest, so it lists what actually built -- a
 * mod whose sync failed does not appear, and a page cannot be listed that does not exist.
 */
export function sectionTrees(): SectionTree[] {
  const pages = source.getPages();
  return mods
    .filter((mod) => pages.some((page) => page.slugs[0] === mod.id))
    .map(sectionTreeOf);
}

/**
 * The previous and next page *within the same mod*.
 *
 * Scoped to the section on purpose: jumping from the last Tasked page into Armature's docs reads as
 * having fallen out of the manual rather than reached the end of it. The order is the one the rail
 * shows, from the same function, so a reader stepping through the pages walks the same path the rail
 * draws.
 */
export function neighboursOf(slugs: string[]): { prev?: Neighbour; next?: Neighbour } {
  const mod = mods.find((entry) => entry.id === slugs[0]);
  if (!mod) return {};

  const pages = sectionTreeOf(mod).ordered;
  const index = pages.findIndex((page) => page.url === `/${['docs', ...slugs].join('/')}`);
  if (index === -1) return {};

  const toNeighbour = (page: DocPage | undefined): Neighbour | undefined =>
    page ? { url: page.url, title: page.data.title } : undefined;

  return { prev: toNeighbour(pages[index - 1]), next: toNeighbour(pages[index + 1]) };
}

/**
 * Top-level pages that belong to no mod.
 *
 * The glossary is the only one today. It has to appear somewhere in the rail, and it is not a section
 * with a `docs/` folder -- so it is collected here and rendered under its own label rather than being
 * quietly unreachable.
 */
export function standalonePages() {
  return source
    .getPages()
    .filter((page) => page.slugs.length === 1 && !mods.some((mod) => mod.id === page.slugs[0]))
    .sort((a, b) => a.url.localeCompare(b.url));
}
