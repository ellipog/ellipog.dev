import type { MetadataRoute } from 'next';

import { SITE } from '@/lib/metadata';

/*
 * `robots.txt`, generated rather than typed — same construction as
 * `apps/docs/app/robots.ts`.
 *
 * It has to name the sitemap's absolute address, and a `public/robots.txt`
 * would be a second copy of the domain — the copy that keeps saying the old
 * domain after a move. Everything is allowed: no staging area, no accounts;
 * the 404 already carries `noindex` of its own.
 *
 * `force-static` because this is an export: the route has to become a file at
 * build time, not something a server renders on request.
 */
export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
