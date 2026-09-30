import type { MetadataRoute } from 'next';

import { absoluteUrl } from '@/lib/metadata';
import { source } from '@/lib/source';

/*
 * Every page, derived from the pages themselves.
 *
 * The list comes from `source.getPages()` — the same loader that gives the docs route its
 * `generateStaticParams` — so a page cannot be in the sitemap and not in the build, or the reverse.
 * A hand-kept list would have to be remembered on the day a page is added, which is the day nobody
 * remembers anything. `check.mjs` asserts the two sets are equal, which is what keeps this honest
 * rather than merely intended: it walks `out/` and compares.
 *
 * **No `lastModified`, and that is deliberate.** The only date the build knows is the day it ran,
 * and stamping every page with it would tell a crawler that all six pages changed this morning,
 * every morning. A date that is always wrong is worse than no date — the same judgement the
 * "numbers come from the APIs" note makes about not typing figures in by hand.
 *
 * **No `priority` and no `changeFrequency` either.** Search engines ignore both, and a value nobody
 * reads is a value nobody keeps true.
 */
export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ['/', ...source.getPages().map((page) => page.url)];

  // A Set because `/docs` arrives from the page list and `/` is added here; neither is a duplicate
  // today, and a duplicate `<loc>` is the kind of thing a crawler reports rather than forgives.
  return [...new Set(paths.map(absoluteUrl))].map((url) => ({ url }));
}
