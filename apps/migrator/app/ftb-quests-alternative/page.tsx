import type { Metadata } from 'next';

import { absoluteUrl, SITE, social } from '@/lib/metadata';

const TITLE = 'FTB Quests alternative';
const DESCRIPTION =
  'Tenet is a free FTB Quests alternative for Minecraft 1.21.1 on Fabric and NeoForge: JSON quest files, server-authoritative progress, and a one-click migrator.';

export const metadata: Metadata = {
  title: TITLE,
  ...social({ title: `tenet migrator | ${TITLE}`, description: DESCRIPTION, path: '/ftb-quests-alternative/' }),
};

/*
 * Where this page sits, for a crawler that reads schema.org — same pattern
 * as the reference page. The `SoftwareApplication` node carries only
 * verifiable facts (name, url, loaders, price): no ratings, no invented
 * claims. Breadcrumb trails home so the page is never an orphan to a crawler.
 */
const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebPage',
      name: `tenet migrator | ${TITLE}`,
      url: absoluteUrl('/ftb-quests-alternative/'),
      description: DESCRIPTION,
      isPartOf: { '@type': 'WebSite', name: SITE.title, url: SITE.url },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: SITE.title, item: `${SITE.url}/` },
        { '@type': 'ListItem', position: 2, name: TITLE, item: absoluteUrl('/ftb-quests-alternative/') },
      ],
    },
    {
      '@type': 'SoftwareApplication',
      name: 'Tenet',
      url: 'https://ellipog.dev/docs/tenet/',
      applicationCategory: 'Game',
      operatingSystem: 'Windows, macOS, Linux',
      softwareVersion: '0.2.0',
      offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
      author: { '@type': 'Person', name: 'Ellipog' },
    },
  ],
};

function Table({ head, rows }: { head: [string, string, string]; rows: Array<[string, string, string]> }) {
  return (
    <div className="refwrap">
      <table className="reftable">
        <thead>
          <tr>
            <th>{head[0]}</th>
            <th>{head[1]}</th>
            <th>{head[2]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([a, b, c]) => (
            <tr key={`${a}-${b}`}>
              <td>
                <code>{a}</code>
              </td>
              <td>
                <code>{b}</code>
              </td>
              <td>{c}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AlternativePage() {
  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }} />

      <section className="hero">
        <p className="eyebrow">ftb quests alternative · minecraft 1.21.1</p>
        <h1>An FTB Quests alternative.</h1>
        <p className="sub">
          Tenet is a visual questing engine for Fabric and NeoForge that ships no questlines of its own — JSON
          files in, a pannable canvas out, and the server decides what counts as done. Free, open source, and
          with a migrator that converts your FTB Quests export in the browser.
        </p>
        <div className="btnrow">
          <a className="btn" data-primary="true" href="/">
            Migrate your quests →
          </a>
          <a
            className="btn"
            href="https://ellipog.dev/docs/tenet/"
            target="_blank"
            rel="noreferrer noopener"
          >
            Read the Tenet docs ↗
          </a>
        </div>
      </section>

      <section className="band">
        <div className="band-head">
          <span className="label">Why switch</span>
          <span className="faint mono">what changes on day one</span>
        </div>
        <div className="refwrap">
          <div className="prose">
            <p>
              FTB Quests stores its books as SNBT (<span className="mono">data.snbt</span>) — a format only
              Minecraft tooling reads. Tenet stores the same quests as JSON under{' '}
              <span className="mono">config/tenet/quests/</span>: diffable in git, editable in any text editor,
              and validated against a published JSON Schema on <span className="mono">/tenet reload</span>.
            </p>
            <p>
              Progress is server-authoritative, and parties are your existing parties: Tenet reads FTB Teams
              when it is installed, then Open Parties and Claims, then its own stored fallback — no re-forming,
              no migration step for teams. The quest book renders full EMI pages (with JEI/REI fallback), chapters
              can be edited in game with per-chapter undo, and counting is per-party: one member, pooled, or
              owner-only. On NeoForge, KubeJS scripts can drive quests directly.
            </p>
          </div>
        </div>
      </section>

      <section className="band">
        <div className="band-head">
          <span className="label">FTB Quests vs Tenet</span>
          <span className="faint mono">the honest version</span>
        </div>
        <div>
          <Table
            head={['Question', 'FTB Quests', 'Tenet']}
            rows={[
              ['quest files', 'SNBT (data.snbt)', 'JSON in config/tenet/quests/'],
              ['editing', 'in-game editor', 'in-game editor, per-chapter undo'],
              ['team play', 'FTB Teams parties', 'same parties — FTB Teams, then OPAC, then stored'],
              ['editions', 'separate Forge, Fabric, NeoForge editions', 'one mod: Fabric + NeoForge'],
              ['recipe viewers', 'EMI / JEI / REI', 'full EMI pages, JEI/REI fallback'],
              ['scripting', 'KubeJS on all loaders', 'KubeJS on NeoForge'],
              ['license', 'FTB license', 'MIT, source on GitHub'],
              ['price', 'free', 'free'],
            ]}
          />
          <div className="refwrap">
            <div className="prose">
              <p className="muted">
                Tenet is ours — this page is written by its authors, and the FTB column describes the mod as its{' '}
                <a href="https://github.com/FTBTeam/FTB-Quests" target="_blank" rel="noreferrer noopener">
                  public repository
                </a>{' '}
                and{' '}
                <a href="https://www.curseforge.com/minecraft/mc-mods/ftb-quests-forge" target="_blank" rel="noreferrer noopener">
                  CurseForge pages
                </a>{' '}
                present it. Corrections welcome on{' '}
                <a href="https://github.com/ellipog/tenet/issues" target="_blank" rel="noreferrer noopener">
                  GitHub
                </a>
                . Last updated October 2026.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="band">
        <div className="band-head">
          <span className="label">Switching takes minutes</span>
          <span className="faint mono">the migrator does the dull half</span>
        </div>
        <div className="refwrap">
          <div className="prose">
            <p>
              Export your quest book, drop the folder or <span className="mono">.zip</span> into{' '}
              <a href="/">the migrator</a>, and download a Tenet tree: quests, chapters, rewards, dependencies
              and locales remapped, everything approximated listed in a report. ATM10 converts with zero
              errors. Merge the result into <span className="mono">config/tenet/quests/</span> and run{' '}
              <span className="mono">/tenet reload</span> in game. The full field-by-field contract is on the{' '}
              <a href="/reference/">mapping reference</a>.
            </p>
          </div>
        </div>
      </section>

      <section className="band">
        <div className="band-head">
          <span className="label">When to stay</span>
          <span className="faint mono">no churn for its own sake</span>
        </div>
        <div className="refwrap">
          <div className="prose">
            <p>
              A stable pack on an older Minecraft version has nothing to gain from moving — Tenet targets
              1.21.1. Heavy KubeJS quest scripting on Fabric should stay put too, since Tenet&rsquo;s KubeJS
              support is NeoForge-only. And a playthrough in progress should finish what it started. Switch
              for your next pack, not this one.
            </p>
          </div>
        </div>
      </section>

      <section className="band">
        <div className="band-head">
          <span className="label">Questions</span>
          <span className="faint mono">short answers</span>
        </div>
        <div className="refwrap">
          <div className="prose">
            <p>
              <strong>Which Minecraft versions?</strong> Tenet targets 1.21.1 on Fabric and NeoForge. Older
              versions stay on FTB Quests.
            </p>
            <p>
              <strong>Do my FTB teams carry over?</strong> Yes — keep FTB Teams (or Open Parties and Claims)
              installed and Tenet reads those parties automatically, in that order, before its own stored
              fallback. Counting is per party: one member by default, pooled, or owner-only FTB-style. The{' '}
              <a href="https://ellipog.dev/docs/armature/api/teams/" target="_blank" rel="noreferrer noopener">
                team resolution order
              </a>{' '}
              is documented.
            </p>
            <p>
              <strong>What does it cost?</strong> Nothing — Tenet is MIT open source and the migrator runs
              entirely in your browser, no upload, no account.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
