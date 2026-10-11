import type { Metadata } from 'next';

import { absoluteUrl, SITE, social } from '@/lib/metadata';

const TITLE = 'Minecraft questing mods';
const DESCRIPTION =
  'Questing mods for Minecraft compared: FTB Quests, Tenet, and the legacy options. Which quest mod fits your pack, and how to switch.';

export const metadata: Metadata = {
  title: TITLE,
  ...social({ title: `tenet migrator | ${TITLE}`, description: DESCRIPTION, path: '/minecraft-questing-mods/' }),
};

/*
 * Same pattern as the sibling pages: WebPage + BreadcrumbList, absolute URLs
 * throughout. Ranked how the page ranks them — actively maintained for modern
 * versions first — and the ranking criteria are stated on the page itself.
 */
const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebPage',
      name: `tenet migrator | ${TITLE}`,
      url: absoluteUrl('/minecraft-questing-mods/'),
      description: DESCRIPTION,
      isPartOf: { '@type': 'WebSite', name: SITE.title, url: SITE.url },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: SITE.title, item: `${SITE.url}/` },
        { '@type': 'ListItem', position: 2, name: TITLE, item: absoluteUrl('/minecraft-questing-mods/') },
      ],
    },
  ],
};

export default function QuestingModsPage() {
  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }} />

      <section className="hero">
        <p className="eyebrow">minecraft questing mod · compared</p>
        <h1>Minecraft questing mods.</h1>
        <p className="sub">
          Every serious questing mod for modern Minecraft on one page: what each one is for, and which pack
          should pick it. Tenet is ours — the ranking below says so where it matters.
        </p>
      </section>

      <section className="band">
        <div className="band-head">
          <span className="label">How this is ranked</span>
          <span className="faint mono">the criteria, stated</span>
        </div>
        <div className="refwrap">
          <div className="prose">
            <p>
              Maintained for current versions first, loader coverage second, migration path third. A mod nobody
              maintains can still be the right answer for an old pack — and the wrong answer for a new one.
              Last updated October 2026.
            </p>
          </div>
        </div>
      </section>

      <section className="band">
        <div className="band-head">
          <span className="label">1 · FTB Quests</span>
          <span className="faint mono">the incumbent</span>
        </div>
        <div className="refwrap">
          <div className="prose">
            <p>
              The questing mod most packs ship: team-based questing with an in-game editor, separate Forge,
              Fabric and NeoForge editions, and hundreds of millions of CurseForge downloads behind it. Pick
              it for an established pack on any version, or when you want the biggest library of existing
              questlines and addon mods to borrow from:{' '}
              <a href="https://www.curseforge.com/minecraft/mc-mods/ftb-quests-forge" target="_blank" rel="noreferrer noopener">
                FTB Quests on CurseForge
              </a>
              .
            </p>
          </div>
        </div>
      </section>

      <section className="band">
        <div className="band-head">
          <span className="label">2 · Tenet</span>
          <span className="faint mono">ours — for new 1.21.1 packs</span>
        </div>
        <div className="refwrap">
          <div className="prose">
            <p>
              A visual questing engine that ships no questlines of its own: JSON files in, a pannable canvas
              out, progress decided by the server. One mod covering Fabric and NeoForge on 1.21.1, MIT open
              source, with an in-game editor, EMI pages, and parties through Armature teams. Pick it when you
              want quest files that live happily in git — and when you are coming from FTB Quests, read{' '}
              <a href="/ftb-quests-alternative/">the FTB Quests alternative guide</a> and convert with{' '}
              <a href="/">the migrator</a>. Docs at{' '}
              <a href="https://ellipog.dev/docs/tenet/" target="_blank" rel="noreferrer noopener">
                ellipog.dev/docs/tenet/
              </a>
              .
            </p>
          </div>
        </div>
      </section>

      <section className="band">
        <div className="band-head">
          <span className="label">3 · The legacy options</span>
          <span className="faint mono">for old packs only</span>
        </div>
        <div className="refwrap">
          <div className="prose">
            <p>
              Hardcore Questing Mode and Better Questing defined the genre on older Minecraft versions. They
              are worth knowing about when maintaining a pack from that era — and not a starting point for a
              new one, where neither is maintained for current versions. If your legacy book is FTB Quests on
              a modern version instead, <a href="/">the migrator</a> moves it to Tenet.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
