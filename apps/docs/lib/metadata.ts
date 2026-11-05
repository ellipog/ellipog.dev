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
const TAGLINE = 'Minecraft mods for Fabric and NeoForge';

export const SITE = {
  domain: manifest.site.domain,
  url: `https://${manifest.site.domain}`,
  title: 'ellipog.dev',
  /**
   * What the home page is about, in the words somebody would search for. It follows the site's name
   * in the home page's title (`ellipog.dev | Minecraft mods for Fabric and NeoForge`): a home page
   * titled only with the domain gives a search engine one brand word and nothing else to match, on
   * the page with the most links pointing at it. The share card's alt text says the same thing.
   */
  tagline: TAGLINE,
  description:
    'Tenet, Armature and Stature: Minecraft mods for Fabric and NeoForge. A questing engine, a UI library, and a scale and anatomy API, plus earlier work.',
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
  alt: `ellipog — ${TAGLINE}`,
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
    // Fenced code blocks are examples, not summaries. Each leaves a marker behind, because a sentence
    // that introduced one ends on a colon ("where it starts and where it ends:"), and without the block
    // the next sentence runs on from it mid-line.
    .replace(/```[\s\S]*?```/g, ' \u0001 ')
    // `import`/`export` lines are scaffolding, never prose.
    .replace(/^(?:import|export)\s.*$/gm, ' ')
    // A self-closing glossary term *is* a word of the sentence: `<GlossaryTerm term="quest" />` renders
    // as "quest" (`inlineForm` in `components/mdx/glossary-term.tsx`). Stripped as a tag, it left
    // descriptions reading "A is one file" and "separate from s".
    .replace(/<GlossaryTerm\s[^<>]*?term="([^"]+)"[^<>]*?\/>/g, (_m, term: string) => term.replace(/-/g, ' '))
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
    // A colon that introduced a removed code block ends its sentence; any other marker is just a gap.
    .replace(/:\s*\u0001/g, '.')
    .replace(/\s*\u0001\s*/g, ' ')
    // Tags were replaced with a space so block elements cannot run two words together; an inline one
    // just before punctuation leaves "the envelope ." instead, so the space is taken back.
    .replace(/\s+([.,;:!?)])/g, '$1')
    .replace(/\(\s+/g, '(')
    .trim();

  if (!text) return undefined;
  if (text.length <= maxLength) return text;

  /*
   * Whole sentences first. A snippet cut at a word boundary ends mid-clause ("…wait for the player
   * to claim them: the"), and a search result that stops mid-thought reads as broken rather than as
   * a summary. In order of preference:
   *
   * 1. the longest run of whole sentences that fits, when it is at least 70 characters;
   * 2. otherwise a word-boundary cut, **ending in an ellipsis**. This used to end bare, on the theory
   *    that an ellipsis reads as trailing content; but a search result already truncates with one, so
   *    it reads as exactly what it is, a sentence that continues on the page, where a bare cut reads
   *    as an error. The ellipsis is counted inside `maxLength`.
   *
   * The opening sentence alone is deliberately not an option when it is short. "A rig gives anatomy
   * names to model paths." is 41 characters, and a search engine shown that little tends to write
   * its own snippet from the page instead; the same sentence carried on into the next one says more.
   */
  const ends = [...text.slice(0, maxLength + 1).matchAll(/[.!?](?=\s)/g)].map((m) => (m.index ?? 0) + 1);
  const longest = ends.filter((end) => end <= maxLength && end >= 70).at(-1);
  if (longest) return text.slice(0, longest).trim();

  const budget = maxLength - 1;
  const cut = text.lastIndexOf(' ', budget);
  const head = (cut > budget * 0.5 ? text.slice(0, cut) : text.slice(0, budget)).replace(/[\s,;:—–-]+$/, '').trim();
  return head ? `${head}…` : undefined;
}

/**
 * A title as plain text: markdown's inline-code backticks removed.
 *
 * A source document may title itself ``JSON `clickEvent` research``, which the page's own heading
 * shows as written. In a `<title>`, an `og:title` or a breadcrumb the backticks are not markup any
 * more, just two stray characters in a search result.
 */
export function plainTitle(title: string): string {
  return title.replace(/`([^`]*)`/g, '$1');
}

/**
 * A site path in the form the export serves: with its trailing slash, query and fragment kept.
 *
 * `trailingSlash: true` in `next.config.mjs` means `/docs/tenet/` is the address the export writes.
 * Vercel also answers `/docs/tenet` with the same file and a 200, so the slashless spelling is a
 * second URL for the same page rather than a redirect. The canonical tag says which one is the
 * page, and **every internal link has to agree with it**: a rail of forty links per page pointing at
 * the other spelling tells a crawler the opposite of what the canonical does.
 *
 * Only site paths are touched. External URLs, bare fragments and anything with a file extension
 * (`/og.png`, `/llms.txt`) are returned as they are; a docs path's version segment (`1.21.1`) is not
 * mistaken for an extension because docs paths are matched by prefix first.
 */
export function canonicalPath(href: string): string {
  if (!href.startsWith('/')) return href;
  const split = /^([^?#]*)(.*)$/.exec(href);
  const path = split?.[1] ?? href;
  const rest = split?.[2] ?? '';
  if (path.endsWith('/')) return href;
  const isDocs = path === '/docs' || path.startsWith('/docs/');
  if (!isDocs && /\.[a-z0-9]+$/i.test(path)) return href;
  return `${path}/${rest}`;
}

/**
 * A route's absolute URL, with the trailing slash the export actually serves.
 *
 * The canonical link, the sitemap entry and the share card each need the same answer to "what is
 * this page's URL", so they all ask this function rather than each appending their own slash, and
 * this function asks `canonicalPath`, which is the same answer every internal link gets.
 */
export function absoluteUrl(path: string): string {
  return `${SITE.url}${canonicalPath(path.startsWith('/') ? path : `/${path}`)}`;
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
    // `en_GB` rather than `en`: Open Graph spells a locale language_TERRITORY, and a bare language code
    // is not one of its values. British, because the prose is ("colour", "normalise").
    openGraph: { type: 'website', siteName: SITE.title, locale: 'en_GB', title, description, url, images },
    twitter: { card: 'summary_large_image', title, description, images: [CARD.path] },
  };
}
