import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './global.css';
import { Colophon } from '@/components/colophon';
import { SponsorBanner } from '@/components/sponsor';
import { ThemeToggle } from '@/components/theme-toggle';
import manifest from '@/manifest.json';

export const metadata: Metadata = {
  title: { default: 'ellipog', template: '%s · ellipog' },
  description: 'Minecraft mods for Fabric and NeoForge — a UI library and a questing engine in development, plus earlier work.',

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
   * What this costs is a thinner line: the file it replaces drew 2.4px strokes on a 64px viewBox, where
   * this one's median stroke is 21px on 879px — 3.75% of the box against 2.39%. AGENT.md has the
   * measurement, and the reason it was judged worth making.
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
            <nav>
              <a href="/docs/">Docs</a>
              {manifest.author.links.map((link) => (
                <a
                  key={link.id}
                  className="nav-secondary"
                  href={link.url}
                  target="_blank"
                  rel="noreferrer noopener"
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
