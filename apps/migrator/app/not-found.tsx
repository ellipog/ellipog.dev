import type { Metadata } from 'next';

import { Diagram } from '@/components/diagram';

/*
 * The 404, rendered to `404.html` by the static export — same construction as
 * `apps/docs/app/not-found.tsx`, and the same split: the copy on the left, a
 * figure on the right. Here the figure is the site's own map, drawn as the
 * migrator draws a file tree, with the reader's address as the one entry
 * that is not on it.
 *
 * It exists so the head has exactly one `<title>`: without it, Next renders
 * the layout's default title and its own `404: This page could not be found.`
 * into the same head. The title below goes through the layout's template, so
 * the tab names the site like every other page. And it carries `noindex`,
 * which is why `robots.txt` needs no disallow rule.
 */
export const metadata: Metadata = {
  title: 'Not found',
  robots: { index: false, follow: false },
};

const MAP = [
  'tenet.ellipog.dev/',
  '├─ ftb-quests-alternative/',
  '├─ minecraft-questing-mods/',
  '├─ reference/',
  '└─ ░░░░░░░░   ◂ not on the map',
] as const;

export default function NotFound() {
  return (
    <main>
      <section className="hero lost">
        <div className="hero-copy">
          <p className="eyebrow">404</p>
          <h1>Not found.</h1>
          <p className="sub">
            Nothing lives at this address. <a href="/">Back to the migrator</a>
          </p>
        </div>
        <figure className="hero-figure" aria-hidden="true">
          <figcaption className="figure-label">
            <span>fig. 404</span>
            <span>where you are</span>
          </figcaption>
          <Diagram lines={MAP} />
        </figure>
      </section>
    </main>
  );
}
