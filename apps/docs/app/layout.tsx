import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './global.css';
import { SponsorBanner } from '@/components/sponsor';
import { ThemeToggle } from '@/components/theme-toggle';
import manifest from '@/manifest.json';

export const metadata: Metadata = {
  title: { default: 'ellipog', template: '%s · ellipog' },
  description: 'Minecraft mods for Fabric and NeoForge — a UI library and a questing engine in development, plus earlier work.',

  /*
   * The tab icon, and it is deliberately **not** one of the mod marks.
   *
   * A favicon is the *site's* identity, not any one mod's. The marks in `components/mod-icon.tsx` belong
   * to the mods and appear beside their names, where a reader can tell which is which; a tab showing
   * Armature's glyph while the reader is on Tasked's page would be saying something untrue.
   *
   * It is the same file as the studio site's, copied byte for byte from `aaenz/public/favicon.svg` — the
   * same document at `apps/docs/public/favicon.svg`, not redrawn in the same spirit. **That copy is the
   * one arrangement here with no guard, and it cannot be asserted away:** `aaenz` is a separate
   * repository this build has no route into, so there is nothing to regenerate the file from and nothing
   * to compare it against when both exist. What `check.mjs` can prove is that it is committed, that it
   * ships, that the pages ask for it, and that the build copied it through unchanged — the last of which
   * is the only thing standing between "the two sites agree" and "they agreed the day this was written".
   * Change one and change the other.
   *
   * `public/` rather than the `app/icon.svg` convention, because that is the arrangement `aaenz` already
   * uses. The same file in the same place in both repositories is the one that can be diffed by eye, and
   * the convention would additionally hash the URL, which is a worse thing to compare.
   *
   * **The masthead's mark is a different pair of files from the same folder** — `public/site/`, copied by
   * hand from `aaenz/public/assets/`. A tab icon wants a paper plate and a drawing simplified for 16px;
   * the mark beside a wordmark wants neither. So this file is the tab's and those two are the masthead's,
   * and all three are copies from the studio repository that no assertion here can reach back into.
   */
  icons: { icon: '/favicon.svg' },
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

          {/* Its own band, and now the last row on every page. There used to be a footer beneath it --
              the domain, then the outbound links and Docs, which the masthead's own nav already carries
              on every page and the catalog's "Elsewhere" band carries with a handle each. A row that
              repeats a row is furniture, and a paid band's only job here is to not read as part of a
              list the site keeps about itself. */}
          <SponsorBanner />
        </div>
      </body>
    </html>
  );
}
