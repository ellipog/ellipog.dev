import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import './global.css';
import './migrator.css';
import { ThemeToggle } from '@/components/theme-toggle';
import { Colophon } from '@/components/colophon';

export const metadata: Metadata = {
  title: { default: 'tenet migrator', template: 'tenet migrator | %s' },
  description:
    'Client-side FTB Quests → Tenet config migrator. Files never leave the browser.',
  /*
   * The tab icon: ellipog.dev's own mark pair, copied by hand like everything
   * under public/site/. A favicon cannot read [data-theme], so the pair switches
   * on prefers-color-scheme instead — resolved before first paint, same OS
   * preference the theme toggle falls back to. Last file wins for consumers
   * that ignore media, so the dark-ink mark is the accidental default.
   */
  icons: {
    icon: [
      { url: '/site/mark-on-dark.png', type: 'image/png', media: '(prefers-color-scheme: dark)' },
      { url: '/site/mark-on-light.png', type: 'image/png', media: '(prefers-color-scheme: light)' },
    ],
    apple: [{ url: '/site/mark-on-light.png', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#09090b' },
  ],
};

/** Set the theme before first paint (same construction as apps/docs). */
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
              <span className="brand-mark" aria-hidden="true" />
              ftbq&nbsp;→&nbsp;tenet migrator
            </a>
            <nav aria-label="Primary">
              <a href="/reference/">Reference</a>
              <a
                href="https://ellipog.dev/docs/tenet/"
                className="nav-secondary"
                target="_blank"
                rel="noreferrer noopener"
              >
                Tenet docs <span className="arrow">↗</span>
              </a>
              <ThemeToggle />
            </nav>
          </header>

          {children}

          <footer className="band">
            <div className="band-head">
              <span className="label">Private by default</span>
              <span className="faint mono">
                parsing + conversion run in this page — no upload, no telemetry
              </span>
            </div>
          </footer>
          {/* The studio's signature, last on the page — same construction as docs. */}
          <Colophon />
        </div>
      </body>
    </html>
  );
}
