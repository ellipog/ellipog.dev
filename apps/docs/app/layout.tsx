import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './global.css';
import { Arrow } from '@/components/arrow';
import { ThemeToggle } from '@/components/theme-toggle';
import manifest from '@/manifest.json';
import stats from '@/stats.json';

/** Set by scripts/stats.mjs when it managed to download the picture; null otherwise. */
const AVATAR: string | null = (stats as { avatar?: { path: string } | null }).avatar?.path ?? null;

export const metadata: Metadata = {
  title: { default: 'ellipog', template: '%s · ellipog' },
  description: 'Minecraft mods for Fabric and NeoForge — a UI library and a questing engine in development, plus earlier work.',
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
              {/* Empty alt: the name beside it already says who this is, so announcing the picture
                  again would just make a screen reader read the same thing twice. */}
              {AVATAR ? (
                <img className="avatar" src={AVATAR} alt="" width={22} height={22} />
              ) : (
                <span className="dot" />
              )}
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

          <footer className="footer">
            <span>
              <span className="live-dot" />
              ellipog.dev
            </span>
            <nav>
              {manifest.author.links.map((link) => (
                <a key={link.id} href={link.url} target="_blank" rel="noreferrer noopener">
                  {link.label} <Arrow />
                </a>
              ))}
              <a href="/docs/">Docs</a>
            </nav>
          </footer>
        </div>
      </body>
    </html>
  );
}
