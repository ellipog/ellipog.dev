import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getTableOfContents } from 'fumadocs-core/content/toc';
import type { TOCItemType } from 'fumadocs-core/toc';

import { source } from '@/lib/source';
import { excerptFromMarkdown } from '@/lib/metadata';
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
  versions?: ModVersion[];
};

export type ModVersion = {
  id: string;
  minecraft?: string;
  loaders?: string[];
  pin?: string;
  branch?: string;
  localPath?: string;
  default?: boolean;
};

export const mods = manifest.suite as SuiteMod[];

/**
 * Every documented game version of a mod, latest first.
 *
 * A mod without a `versions` array is one version: its own top-level fields, marked default.
 * That keeps every reader that never heard of versions working.
 */
export function versionsOf(mod: SuiteMod): ModVersion[] {
  if (Array.isArray(mod.versions) && mod.versions.length > 0) return mod.versions;
  return [{ id: mod.minecraft ?? 'latest', minecraft: mod.minecraft, loaders: mod.loaders, default: true }];
}

/** The version unversioned URLs show: the one marked default, else the first. */
export function defaultVersion(mod: SuiteMod): ModVersion {
  const all = versionsOf(mod);
  return all.find((v) => v.default) ?? all[0];
}

/**
 * The version segment of a slug path, or undefined for the default (unversioned) version.
 *
 * Slugs are `[mod, ...]` for the latest manual and `[mod, <version>, ...]` for older ones, so
 * only the second segment can ever be a version — and only when it names one of the mod's own.
 */
export function versionOf(slugs: string[]): string | undefined {
  const mod = mods.find((m) => m.id === slugs[0]);
  if (!mod || slugs.length < 2) return undefined;
  const ids = versionsOf(mod).map((v) => v.id);
  return ids.includes(slugs[1]) ? slugs[1] : undefined;
}

/** A mod's entry for one version: the named one, else the default. Drives the fact chips. */
export function versionEntryOf(mod: SuiteMod, versionId: string | undefined): ModVersion {
  const all = versionsOf(mod);
  return all.find((v) => v.id === versionId) ?? defaultVersion(mod);
}

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
 * The facts a page needs before it is read, one per chip.
 *
 * Nobody should read a page for a version they are not running, and today almost every page needs that
 * caveat. Built from the manifest, so it cannot go stale the way a hand-written "requires 1.21.1" in
 * prose would -- and it disappears entirely for a mod that has none of these fields.
 *
 * **Returned as a list rather than one joined string, because the three facts are three things.** They
 * used to be run together with `·` separators and rendered as a single monospace line, which made a
 * sentence of them -- something to read -- when the reader is scanning for one value. Split, each
 * becomes a chip the eye can find without reading the row, and the loader list (which is genuinely one
 * fact expressed with a `+`) stays whole.
 */
export function prerequisiteFacts(mod: SuiteMod | undefined, versionId?: string): string[] {
  if (!mod) return [];
  const entry = versionEntryOf(mod, versionId);
  return [
    entry.minecraft ? `Minecraft ${entry.minecraft}` : null,
    entry.loaders?.length ? entry.loaders.map(loaderName).join(' + ') : null,
    mod.version ? `${mod.name} ${mod.version}` : null,
  ].filter(Boolean) as string[];
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
 * **A section's front page is `index.mdx`, not `<slug>.mdx`.** `/docs/tenet/` has slugs `['tenet']`,
 * which naively resolves to `tenet.mdx` -- a file that does not exist. This cost a silent failure:
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

/**
 * A page's meta description, read from the generated file.
 *
 * **Frontmatter first, excerpt second.** The sync writes the source document's own `description`
 * through (see `writeMod` in `scripts/sync.mjs`), so a hand-written sentence always wins. When
 * there is none, the body's opening prose is excerpted via `excerptFromMarkdown` rather than
 * falling back to the site's description — which is what shipped the same sentence on two dozen
 * pages. Read from disk for the same reason as `maturityOf`: the page schema strips unknown keys,
 * so `page.data` cannot be trusted with it.
 *
 * Returns undefined when the file is missing or nothing readable survives, so the caller keeps
 * its final `SITE.description` fallback rather than emitting an empty tag.
 */
export function descriptionOf(slugs: string[]): string | undefined {
  const base = join(process.cwd(), 'content', 'docs', ...slugs);
  const file = existsSync(`${base}.mdx`) ? `${base}.mdx` : join(base, 'index.mdx');
  if (!existsSync(file)) return undefined;

  const raw = readFileSync(file, 'utf8');
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)?.[1];
  const declared = front
    ? /^description:\s*(.+)$/m
        .exec(front)?.[1]
        ?.trim()
        .replace(/^["']|["']$/g, '')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
    : undefined;

  // Older game versions qualify the sentence with their version: two manuals share most of their
  // prose by design, and an unqualified duplicate is both a search result that cannot say which
  // game it describes and a failure in `check.mjs`'s uniqueness assertion. The page's own lede is
  // untouched -- the version is already named twice above it, as a fact chip and as the switcher.
  const versionId = versionOf(slugs);
  const qualifier = (() => {
    if (!versionId) return '';
    const mod = mods.find((entry) => entry.id === slugs[0]);
    const minecraft = versionEntryOf(mod ?? { id: '', name: '', summary: '' }, versionId).minecraft;
    return minecraft ? ` (Minecraft ${minecraft})` : ` (${versionId})`;
  })();

  if (declared) return `${declared}${qualifier}`;

  const excerpt = excerptFromMarkdown(raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, ''));
  return excerpt ? `${excerpt}${qualifier}` : undefined;
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
 * `/docs/tenet/commands/` is `['tenet','commands']`, so the pages alone cannot say which second
 * segment is a folder and which is a page. The generated content directory can, and it is the same tree
 * the rail is describing -- `sync.mjs` writes it, and writes a `meta.json` into every folder it makes.
 */
function foldersOf(modId: string, versionId?: string): string[] {
  const dir = join(process.cwd(), 'content', 'docs', modId, ...(versionId ? [versionId] : []));
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** What the sync called a folder: its own page's title, or its humanised name. */
function folderLabel(modId: string, folder: string, versionId?: string): string {
  try {
    const title = JSON.parse(
      readFileSync(join(process.cwd(), 'content', 'docs', modId, ...(versionId ? [versionId] : []), folder, 'meta.json'), 'utf8'),
    ).title;
    if (typeof title === 'string' && title !== '') return title;
  } catch {
    // A folder the sync made always has one; a hand-made tree might not, and the name is the fallback.
  }
  return folder.replace(/[-_]+/g, ' ').replace(/^./, (char) => char.toUpperCase());
}

/**
 * What the rail calls the folder a page sits in, or nothing when it sits in none.
 *
 * The label is the same string the rail shows -- both go through `folderLabel` -- so a search result's
 * breadcrumb says "Authoring" exactly where the reader last saw that word, rather than a slug or a
 * title-cased guess.
 *
 * **Returns `undefined` rather than an empty string, and callers must treat the two as different.**
 * A section's front page and its top-level pages (`/docs/tenet/`, `/docs/tenet/commands/`) are in no
 * folder, so there is no section to name. An empty string would be written into the markup as an
 * attribute that exists and says nothing, which reads downstream as a section whose name is blank --
 * and a search result then renders a breadcrumb separator with nothing after it.
 */
export function sectionLabelOf(slugs: string[]): string | undefined {
  const [modId, ...rest] = slugs;
  const versionId = versionOf(slugs);
  const tail = versionId ? rest.slice(1) : rest;
  const [segment] = tail;
  if (!modId || !segment) return undefined;
  if (!foldersOf(modId, versionId).includes(segment)) return undefined;
  return folderLabel(modId, segment, versionId);
}

/**
 * One mod's pages for one game version, arranged the way the site shows them.
 *
 * One definition for the rail, the contents list on `/docs/` and the previous/next row, because all
 * three are answering "what order are these pages in" and three answers would drift. The order is: the
 * section's front page, the top-level pages, then one group per folder -- folders in name order, and
 * each folder's pages with its own front page first.
 *
 * Version folders are not groups: on a latest-version page the `1.21.1` folder is invisible, and each
 * older version gets its own tree from its own pages. A reader never walks out of the manual they are
 * reading by following the rail.
 */
export function sectionTreeOf(mod: SuiteMod, versionId?: string): SectionTree {
  const scope = versionId ?? null;
  const own = source.getPages().filter((page) => page.slugs[0] === mod.id && (versionOf(page.slugs) ?? null) === scope);
  const depth = versionId ? 2 : 1;
  const overview = own.find((page) => page.slugs.length === depth);
  const rest = own.filter((page) => page !== overview);

  const seg = versionId ? 2 : 1;
  const folders = foldersOf(mod.id, versionId);
  const loose = rest.filter((page) => !folders.includes(page.slugs[seg] ?? '')).sort(byUrl);

  const groups = folders
    .map((folder) => ({
      folder,
      label: folderLabel(mod.id, folder, versionId),
      pages: rest
        .filter((page) => page.slugs[seg] === folder)
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
 * mod whose sync failed does not appear, and a page cannot be listed that does not exist. Without a
 * version this is the latest manual, which is what `/docs/` lists; pass one for an older manual.
 */
export function sectionTrees(versionId?: string): SectionTree[] {
  const scope = versionId ?? null;
  const pages = source.getPages();
  return mods
    .filter((mod) => pages.some((page) => page.slugs[0] === mod.id && (versionOf(page.slugs) ?? null) === scope))
    .map((mod) => sectionTreeOf(mod, versionId));
}

/**
 * The previous and next page *within the same mod and game version*.
 *
 * Scoped to the section on purpose: jumping from the last Tenet page into Armature's docs reads as
 * having fallen out of the manual rather than reached the end of it -- and the same holds across
 * game versions. The order is the one the rail shows, from the same function, so a reader stepping
 * through the pages walks the same path the rail draws.
 */
export function neighboursOf(slugs: string[]): { prev?: Neighbour; next?: Neighbour } {
  const mod = mods.find((entry) => entry.id === slugs[0]);
  if (!mod) return {};

  const pages = sectionTreeOf(mod, versionOf(slugs)).ordered;
  const index = pages.findIndex((page) => page.url === `/${['docs', ...slugs].join('/')}`);
  if (index === -1) return {};

  const toNeighbour = (page: DocPage | undefined): Neighbour | undefined =>
    page ? { url: page.url, title: page.data.title } : undefined;

  return { prev: toNeighbour(pages[index - 1]), next: toNeighbour(pages[index + 1]) };
}

/**
 * The same page in another game version, as slugs.
 *
 * The same path under the other version when that page exists there, else that version's overview --
 * manuals drift, and a switcher that 404s is worse than one that lands on the section front. Returns
 * undefined only when the other version has no pages at all, in which case there is nothing to offer.
 */
export function siblingOf(slugs: string[], versionId: string | undefined): string[] | undefined {
  const [modId, ...rest] = slugs;
  const tail = versionOf(slugs) ? rest.slice(1) : rest;
  const target = versionId ? [modId, versionId, ...tail] : [modId, ...tail];
  if (source.getPage(target)) return target;
  const overview = versionId ? [modId, versionId] : [modId];
  return source.getPage(overview) ? overview : undefined;
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
