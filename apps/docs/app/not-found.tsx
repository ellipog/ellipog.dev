import type { Metadata } from 'next';

import { PixelCreeper } from '@/components/pixel-creeper';

/*
 * The 404, rendered to `404.html` by the static export.
 *
 * **It exists so the head has exactly one `<title>`.** Without it, Next renders the layout's
 * default title *and* its own `404: This page could not be found.` into the same head — two
 * `<title>` elements, which is invalid markup that ships silently because the page also carries
 * `noindex` and no crawler ever complains. The title below goes through the layout's template
 * (`ellipog.dev | Not found`), so the tab names the site like every other page.
 *
 * `noindex` is restated rather than relied upon: the one thing this page must do for crawlers is
 * stay out of the index, and an assertion in `check.mjs` holds it to both halves — one title,
 * still noindex.
 *
 * Its styles are in `global.css` (`.lost`) rather than the docs' `.prose`: this page renders outside
 * `app/docs/layout.tsx`, so `docs.css` is never loaded here. The second cell holds the creeper.
 */
export const metadata: Metadata = {
  title: 'Not found',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main>
      <section className="lost">
        <div className="lost-copy">
          <p className="eyebrow">404</p>
          <h1>Not found.</h1>
          <p className="sub">
            Nothing lives at this address. <a href="/">Back to ellipog.dev</a>
          </p>
        </div>
        <div className="lost-figure">
          <PixelCreeper />
        </div>
      </section>
    </main>
  );
}
