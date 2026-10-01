import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './global.css';
import { Colophon } from '@/components/colophon';
import { SponsorBanner } from '@/components/sponsor';
import { ThemeToggle } from '@/components/theme-toggle';
import { SITE } from '@/lib/metadata';
import manifest from '@/manifest.json';

export const metadata: Metadata = {
  /*
   * The base every absolute URL in the metadata is resolved against — the canonical links, the
   * icons' hrefs, and the share card.
   *
   * Without it Next emits paths, and a path is not a URL to anything that reads a link from
   * somewhere else. It comes through `SITE`, which reads the domain from the manifest, so
   * `robots.txt`, `sitemap.xml` and the canonical links cannot disagree about where the site lives.
   */
  metadataBase: new URL(SITE.url),

  /*
   * The tab title: the site's name, then the page.
   *
   * `ellipog.dev` alone on the home page, and `ellipog.dev | Tasked documentation` on a docs page. The
   * site comes first because a reader with a dozen tabs open is looking for the *site* before the page,
   * and a tab truncated at twenty characters still says which site it is.
   *
   * **`%s` was never substituted until this was wired up, and that is worth knowing before touching it.**
   * The template has been here all along, but no page in the app exported `metadata.title` and none
   * defined a `generateMetadata` — so every page on the site rendered the bare default: the home page,
   * the docs index, both mods' pages, the glossary, and the 404. A template with nothing to substitute is
   * invisible in the built HTML, because the default it falls back to is a plausible title for every page
   * at once.
   *
   * `app/docs/[[...slug]]/page.tsx` is now the one place that supplies it, and `check.mjs` asserts a docs
   * page differs from the home page — which is the specific thing that was false.
   */
  title: { default: SITE.title, template: `${SITE.title} | %s` },
  description: SITE.description,

  /*
   * The tab icon — the site's own identity, and deliberately **not** one of the mod marks.
   *
   * The marks in `components/mod-icon.tsx` belong to the mods and appear beside their names, where a
   * reader can tell which is which; a tab showing Armature's glyph while the reader is on Tasked's page
   * would be saying something untrue.
   *
   * **It is the same pair of files the masthead draws from**, in `public/site/`, copied by hand from
   * `aaenz/public/assets/`. There used to be a third file — `public/favicon.svg`, the same drawing
   * hand-built with heavier strokes and a paper plate — and it is gone, because one mark with two jobs is
   * one thing to keep in step instead of two.
   *
   * **Two `media` queries rather than one file, because a favicon cannot use CSS.** The masthead's mark
   * switches on `[data-theme='dark']`, which a `<link>` has no way to read; a media query is the only
   * lever there is. It is resolved before first paint, from the same OS preference the theme toggle falls
   * back to, so the tab gets the legible ink without a byte of script.
   *
   * **It does not follow the toggle**, and it cannot: a reader who has overridden their OS preference gets
   * a tab matching their OS and a page matching the toggle. A `<link>` cannot be styled, so there is no
   * fix — the inconsistency is small and permanent, and AGENT.md records it rather than leaving it to be
   * found.
   *
   * **The light-ground file is listed last, deliberately.** A consumer that ignores `media` — anything
   * before Safari 15, and some crawlers — takes the last icon it can use, so the dark-ink file becomes the
   * accidental default. The failure mode is a mark on the wrong ground rather than no mark at all, which
   * is the one to prefer.
   *
   * What this costs is a thinner line, and it is a measured trade: the drawing it replaced was built
   * for the tab with heavier strokes, while this one is the masthead's drawing used as-is — a mean ink
   * coverage of 9.0% of the box — so a 16px tab renders it lighter than a plated glyph would. AGENT.md
   * has the measurement, and the reason it was judged worth making.
   */
  icons: {
    icon: [
      { url: '/site/mark-on-dark.png', type: 'image/png', media: '(prefers-color-scheme: dark)' },
      { url: '/site/mark-on-light.png', type: 'image/png', media: '(prefers-color-scheme: light)' },
    ],
  },
};

/**
 * Set the theme before first paint.
 *
 * Inline and blocking on purpose: a stylesheet that ran after paint would show white for a frame
 * before switching to dark, and a flash of the wrong theme is worse than a few bytes of script.
 * `light` stays the default when nothing is stored, which is what the design asks for.
 */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');if(t!=='dark'&&t!=='light'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <div className="shell">
          <header className="masthead">
            <a className="brand" href="/">
              {/* The mark, as a background image rather than an `<img>`: two files, one per theme, chosen
                  by CSS, which is the only way to fetch one of them. `.site-mark` in `global.css` carries
                  the whole of that reasoning. Nothing to write an `alt` for either way — the wordmark
                  beside it already says who this is — and the element has no content to hide, so the
                  `aria-hidden` is there to say "decorative" rather than to hide anything. */}
              <span className="site-mark" aria-hidden="true" />
              ellipog
            </a>
            {/* Named, because a page can carry more than one navigation region and "Primary" is the
                one thing a reader cannot work out from the links themselves. */}
            <nav aria-label="Primary">
              <a href="/docs/">Docs</a>
              {/* These two are the only external links on the site without the `↗` that says a link
                  leaves and opens a tab, because the mark in the masthead is deliberately wordless —
                  so the announcement is made to assistive tech instead of drawn. The accessible name
                  contains the visible text, which is what label-in-name requires. */}
              {manifest.author.links.map((link) => (
                <a
                  key={link.id}
                  className="nav-secondary"
                  href={link.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={`${link.label} (opens in a new tab)`}
                >
                  {link.label}
                </a>
              ))}
              <ThemeToggle />
            </nav>
          </header>

          {children}

          {/* The host, and the studio's signature beneath it.

              The band was given its own row so it would not read as part of the site's colophon, and it
              used to be the last thing on the page because there was nothing else after it. The colophon
              changes that for the better: the site now ends in its own voice rather than on a paid row,
              and the band is no more part of the signature than it was part of the footer. Neither of
              those is a row that repeats a row — which is the test the old footer failed. */}
          <SponsorBanner />
          <Colophon />
        </div>
      </body>
    </html>
  );
}
