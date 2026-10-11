import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import './global.css';
import './migrator.css';
import { ThemeToggle } from '@/components/theme-toggle';
import { Colophon } from '@/components/colophon';
import { SITE, social } from '@/lib/metadata';

const HOME_TITLE = 'FTB Quests → Tenet migrator';

export const metadata: Metadata = {
  /*
   * The base every absolute URL in the metadata is resolved against — the canonical links, the
   * icons' hrefs, and the share card. Without it Next emits paths, and a path is not a URL to
   * anything that reads a link from somewhere else. The domain is tenet.ellipog.dev: this app is
   * its own Vercel project (Root Directory apps/migrator), not a path on ellipog.dev.
   */
  metadataBase: new URL(SITE.url),

  title: { default: HOME_TITLE, template: 'tenet migrator | %s' },
  ...social({ title: HOME_TITLE, description: SITE.description, path: '/' }),
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

/*
 * What this site is, for a crawler that reads schema.org.
 *
 * One `WebApplication` node: the tool is free, runs in the browser, and makes
 * no claims worth a rich result — so no ratings, no offers beyond free, and
 * no SoftwareApplication-per-mod markup. Lives in the layout (a server
 * component) so it is in the static HTML, not injected by script. The home
 * page is 'use client' and cannot carry this itself.
 */
const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: HOME_TITLE,
  url: SITE.url,
  description: SITE.description,
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Web',
  browserRequirements: 'Requires JavaScript. Requires HTML5.',
  offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
  author: { '@type': 'Person', name: 'Ellipog' },
  sameAs: [
    'https://modrinth.com/user/Ellipog',
    'https://www.curseforge.com/members/ellipog/projects',
    'https://github.com/ellipog',
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }} />
        <div className="shell">
          <header className="masthead">
            <a className="brand" href="/">
              <span className="brand-mark" aria-hidden="true" />
              ftbq&nbsp;→&nbsp;tenet migrator
            </a>
            <nav aria-label="Primary">
              <a href="/ftb-quests-alternative/">Alternative</a>
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
              <span className="label">Something looks wrong?</span>
              <span className="faint mono">
                <a href="https://github.com/ellipog/tenet/issues" target="_blank" rel="noreferrer noopener">Report it on GitHub ↗</a>
                {' · '}
                <a href="https://discord.gg/uy9QFaQWR7" target="_blank" rel="noreferrer noopener">Ask on Discord ↗</a>
              </span>
            </div>
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
