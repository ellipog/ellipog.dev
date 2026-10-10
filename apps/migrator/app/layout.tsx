import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import './global.css';
import './migrator.css';
import { ThemeToggle } from '@/components/theme-toggle';

export const metadata: Metadata = {
  title: { default: 'ellipog migrator', template: 'ellipog migrator | %s' },
  description:
    'Client-side FTB Quests → Tenet config migrator. Files never leave the browser.',
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
              <span className="site-portrait" aria-hidden="true" />
              migrator
            </a>
            <nav aria-label="Primary">
              <a href="/reference/">Reference</a>
              <a
                href="https://ellipog.dev/docs/tenet/"
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
        </div>
      </body>
    </html>
  );
}
