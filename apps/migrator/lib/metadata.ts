import type { Metadata } from 'next';

/**
 * The migrator's own facts, written down once.
 *
 * The domain is `tenet.ellipog.dev` — this app is its own Vercel project
 * (Root Directory `apps/migrator`), not a path on ellipog.dev — so the
 * canonical links, `robots.txt`, `sitemap.xml` and the share card all read
 * it from here rather than each typing their own copy. Same arrangement as
 * `apps/docs/lib/metadata.ts`, subdomain values.
 */
export const SITE = {
  domain: 'tenet.ellipog.dev',
  url: 'https://tenet.ellipog.dev',
  title: 'tenet migrator',
  description:
    'Free client-side FTB Quests → Tenet converter for Minecraft 1.21.1. Drop a quest export, get a Tenet tree. Files never leave the browser.',
} as const;

/**
 * The share card: its address, its size, and the sentence that describes it
 * when the image cannot be seen.
 *
 * One image for every page, generated at build time by `app/og.png/route.tsx`
 * — which imports its width and height from here, so the file the build
 * writes and the `og:image` tags the pages emit describe the same picture by
 * construction.
 */
export const CARD = {
  path: '/og.png',
  width: 1200,
  height: 630,
  alt: 'FTB Quests → Tenet migrator — free client-side quest converter',
} as const;

/**
 * A route's absolute URL, with the trailing slash the export actually serves.
 *
 * `trailingSlash: true` in `next.config.mjs` means `/reference/` is the
 * address and `/reference` is a different URL on a static host. The canonical
 * link, the sitemap entry and the share card each need the same answer to
 * "what is this page's URL", so they all ask this function rather than each
 * appending their own slash.
 */
export function absoluteUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${SITE.url}${p.endsWith('/') ? p : `${p}/`}`;
}

/**
 * The social metadata for one page.
 *
 * A function rather than a shared object, because Next replaces `openGraph`
 * rather than merging it. Building the block in one place means the parts
 * that must be identical on every page — site name, type, locale, card — are
 * written once.
 */
export function social({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const url = absoluteUrl(path);
  const images = [{ url: CARD.path, width: CARD.width, height: CARD.height, alt: CARD.alt }];

  return {
    description,
    alternates: { canonical: url },
    openGraph: { type: 'website', siteName: SITE.title, locale: 'en', title, description, url, images },
    twitter: { card: 'summary_large_image', title, description, images: [CARD.path] },
  };
}
