import type { Metadata } from 'next';

import manifest from '@/manifest.json';

/**
 * The site's own facts, written down once.
 *
 * The domain is read from the manifest rather than typed, because the manifest is where the site's
 * facts already live — the same reason the sponsor's wording and the studio's name are there. The
 * title and the description were in `app/layout.tsx` until the crawler files and the share card
 * needed them too; three readers and one copy is the arrangement that cannot drift, and the domain
 * has one more reader than that (`robots.txt`, `sitemap.xml`, every canonical link).
 *
 * What is deliberately **not** here: the docs pages' titles and descriptions. Those belong to the
 * pages and come from their frontmatter — this file is only about the site.
 *
 * Two descriptions, two jobs — and they must stay different. `SITE.description` below describes the
 * *home* page (what the mods are, where to get them). The *docs index* is described by
 * `manifest.site.description`, which `scripts/sync.mjs` writes into the generated `/docs/` front
 * page. If the two ever read the same, every docs page without its own description falls back to
 * the home sentence and the sitemap ships two dozen duplicate descriptions.
 */
export const SITE = {
  domain: manifest.site.domain,
  url: `https://${manifest.site.domain}`,
  title: 'ellipog.dev',
  description:
    'Tenet and Armature — Minecraft mods for Fabric and NeoForge: a visual questing engine and a UI library in development, plus earlier work.',
} as const;

/**
 * The share card: its address, its size, and the sentence that describes it when the image cannot be
 * seen.
 *
 * One image for every page, generated at build time by `app/og.png/route.tsx` — which imports its
 * width and height from here, so the file the build writes and the `og:image` tags the pages emit
 * are describing the same picture by construction.
 */
export const CARD = {
  path: '/og.png',
  width: 1200,
  height: 630,
  alt: 'ellipog — Minecraft mods for Fabric and NeoForge',
} as const;

/**
 * A meta-description-length excerpt from a docs page's markdown body.
 *
 * The backstop for a page whose frontmatter has no `description`: without it, `generateMetadata`
 * falls back to `SITE.description` and two dozen pages ship the same sentence (which is what the
 * site did until this existed — only `/docs/` and `/docs/glossary/` declared one). A hand-written
 * description always wins; this only runs when there is none.
 *
 * Pure string work, deliberately: the file reading lives beside `tocOf`/`maturityOf` in
 * `lib/docs.ts`, which already established that pattern. Returns undefined when nothing readable
 * survives, so the caller keeps its final `SITE.description` fallback rather than emitting an
 * empty tag.
 */
export function excerptFromMarkdown(markdown: string, maxLength = 155): string | undefined {
  const text = markdown
    // Fenced code blocks are examples, not summaries.
    .replace(/```[\s\S]*?```/g, ' ')
    // `import`/`export` lines are scaffolding, never prose.
    .replace(/^(?:import|export)\s.*$/gm, ' ')
    // Component tags keep their inner text: `<Callout>` wrappers go, the sentence stays.
    .replace(/<\/?[A-Za-z][\w.:-]*(?:\s[^<>]*)?\/?>/g, ' ')
    // `{expression}` fragments are code, not words.
    .replace(/\{[^{}\s]+\}/g, ' ')
    // Wiki links resolve to their label, or the target when they carry none.
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    // Markdown links keep their text; images are dropped outright.
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, (m) => (/^!/.test(m) ? ' ' : m.replace(/^\[([^\]]*)\].*$/, '$1')))
    // Emphasis and inline code leave their words behind.
    .replace(/(`{1,3}|[*_]{1,3})([^`*_]+)\1/g, '$2')
    // Line-level markers (headings, quotes, list bullets, ordered numbers) are not content.
    .replace(/^[ \t]*(?:#{1,6}\s+|>{1,3}\s*|[-*+]\s+|\d+[.)]\s+)/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return undefined;
  if (text.length <= maxLength) return text;
  // Cut on a word boundary so the snippet never ends mid-word; no ellipsis, which reads as
  // trailing content in a meta tag rather than as an abbreviation.
  const cut = text.lastIndexOf(' ', maxLength);
  return (cut > maxLength * 0.5 ? text.slice(0, cut) : text.slice(0, maxLength)).trim() || undefined;
}
/**
 * A route's absolute URL, with the trailing slash the export actually serves.
 *
 * `trailingSlash: true` in `next.config.mjs` means `/docs/tenet/` is the address and `/docs/tenet`
 * is a redirect — which a static host cannot perform, so the slashless form is simply a different
 * URL. The canonical link, the sitemap entry and the share card each need the same answer to "what
 * is this page's URL", so they all ask this function rather than each appending their own slash.
 */
export function absoluteUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${SITE.url}${p.endsWith('/') ? p : `${p}/`}`;
}

/**
 * The social metadata for one page.
 *
 * **A function rather than a shared object, because Next replaces `openGraph` rather than merging
 * it.** A page that sets its own `openGraph` silently drops everything the layout put there —
 * `siteName`, `type`, `locale`, and the file-convention image — so the home page's card and a docs
 * page's card would disagree about the site's name while both looked plausible. Building the block
 * in one place means the parts that must be identical are written once.
 *
 * **`images` is set here and the card is a plain route rather than a file convention, and that is
 * the second half of the same lesson.** `app/opengraph-image.tsx` was tried first, and it attached
 * the image to the home page only: every page under `/docs` sets its own `openGraph`, which replaced
 * the injected one, so five pages shipped with no `og:image` at all and nothing about them looked
 * wrong. A URL named in the one helper every page asks cannot be dropped by a page that has not
 * heard of it — and it gave the file a real `.png` name, which the convention's extensionless
 * output did not.
 */
export function social({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  const url = absoluteUrl(path);
  const images = [{ url: CARD.path, width: CARD.width, height: CARD.height, alt: CARD.alt }];

  return {
    description,
    alternates: { canonical: url },
    openGraph: { type: 'website', siteName: SITE.title, locale: 'en', title, description, url, images },
    twitter: { card: 'summary_large_image', title, description, images: [CARD.path] },
  };
}
