import type { MetadataRoute } from 'next';

import { SITE } from '@/lib/metadata';

/*
 * `robots.txt`, generated rather than typed.
 *
 * **The file convention rather than a file in `public/`**, for one reason: it has to name the
 * sitemap's absolute address, and a `public/robots.txt` would be a second copy of the domain — the
 * copy that keeps saying the old domain after a move.
 *
 * **Everything is allowed.** There is no staging area here, no search results and no account pages;
 * a disallow rule would be a claim about pages that do not exist, and the one page a crawler should
 * skip — the 404 — already carries `noindex` of its own.
 *
 * `force-static` because this is an export: the route has to become a file at build time, not
 * something a server renders on request.
 */
export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
