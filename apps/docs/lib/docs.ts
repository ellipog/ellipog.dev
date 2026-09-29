import { existsSync, readFileSync } from 'node:fs';
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
  minecraft?: string;
  loaders?: string[];
};

export const mods = manifest.suite as SuiteMod[];

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
 * first place, which is what guarantees the links match the headings.
 *
 * Returns an empty list rather than throwing when the file is missing: a page with no contents rail
 * is a smaller failure than a page that will not build.
 */
export function tocOf(slugs: string[]): TOCItemType[] {
  const file = join(process.cwd(), 'content', 'docs', ...slugs) + '.mdx';
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

export type Neighbour = { url: string; title: string };

/**
 * The previous and next page *within the same mod*.
 *
 * Scoped to the section on purpose: jumping from the last Tasked page into Armature's docs reads as
 * having fallen out of the manual rather than reached the end of it. Order is the same order the
 * sidebar shows, which is the order `meta.json` sets.
 */
export function neighboursOf(slugs: string[]): { prev?: Neighbour; next?: Neighbour } {
  const section = slugs[0];
  if (!section) return {};

  const pages = source
    .getPages()
    .filter((page) => page.slugs[0] === section)
    .sort((a, b) => a.slugs.length - b.slugs.length || a.url.localeCompare(b.url));

  const index = pages.findIndex((page) => page.url === `/${['docs', ...slugs].join('/')}`);
  if (index === -1) return {};

  const toNeighbour = (page: (typeof pages)[number] | undefined): Neighbour | undefined =>
    page ? { url: page.url, title: page.data.title } : undefined;

  return { prev: toNeighbour(pages[index - 1]), next: toNeighbour(pages[index + 1]) };
}

/**
 * Every page, grouped by mod, for the contents list on `/docs/`.
 *
 * Derived from `source.getPages()` rather than from the manifest, so it lists what actually built --
 * a mod whose sync failed does not appear, and a page cannot be listed that does not exist.
 */
export function contentsByMod() {
  const pages = source.getPages();

  return mods
    .map((mod) => ({
      mod,
      pages: pages
        .filter((page) => page.slugs[0] === mod.id)
        .sort((a, b) => a.slugs.length - b.slugs.length || a.url.localeCompare(b.url)),
    }))
    .filter((group) => group.pages.length > 0);
}
