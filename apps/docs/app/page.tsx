import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import manifest from '@/manifest.json';
import stats from '@/stats.json';
import { Arrow } from '@/components/arrow';
import {
  LiveBar,
  LiveBreakdown,
  LiveCount,
  LiveDelta,
  LivePolled,
  LiveShare,
  LiveStats,
  LiveStatus,
  LiveTotal,
} from '@/components/live-stats';
import { ModIcon } from '@/components/mod-icon';
import { World } from '@/components/world';
import { combined } from '@/lib/downloads';
import { SITE, social } from '@/lib/metadata';
import { slim, type Stats } from '@/lib/platforms.mjs';
import { source } from '@/lib/source';

type SuiteMod = {
  id: string;
  name: string;
  /**
   * Which brand the mod belongs to: `stellar` for the developer suite, `ellipog` for the gameplay
   * portfolio. The bands group by it, so a mod without one renders in neither band and disappears from
   * the page without an error -- which is why `check.mjs` asserts every entry has it.
   */
  brand?: string;
  status?: string;
  summary: string;
  /** Released version. Absent while unreleased, in which case the row says `unreleased`. */
  version?: string;
  /** CurseForge slug, linked from the row as a destination of its own. */
  curseforge?: string;
  modrinth?: string;
  /** Where the code lives. Optional: the row renders the link only when the field is there. */
  repo?: string;
  /** Documented game versions, latest first. The row names every line the mod ships. */
  versions?: { minecraft: string }[];
  minecraft?: string;
  loaders?: string[];
};

type Selected = {
  id: string;
  name: string;
  kind: string;
  summary: string;
  url: string;
  modrinth?: string;
  curseforge?: string;
};

/*
 * The build's snapshot. It is what the static HTML says, and the live figures start from it -- so a
 * reader without JavaScript, and the first frame for everybody else, sees real numbers. `slim` drops the
 * titles and URLs before it is handed to the client provider, because whatever crosses that boundary is
 * serialised into the page a second time.
 */
const s = stats as Stats;

/** The author's code host. One spelling, because the Elsewhere band and the structured data both link it. */
const GITHUB = 'https://github.com/ellipog';

/**
 * The home page's canonical URL and its share card. The tab title is left to the layout's default: this
 * page is the site, so it needs no `%s`.
 */
export const metadata: Metadata = social({
  title: SITE.title,
  description: SITE.description,
  path: '/',
});

/**
 * Who and what this site is, for a crawler that reads schema.org. Two nodes and no more -- deliberately not
 * a `SoftwareApplication` per mod, whose rich result is built from ratings or an offer nobody made.
 * `sameAs` is the manifest's author links plus the GitHub profile the Elsewhere band links.
 */
const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebSite', name: SITE.title, url: SITE.url },
    {
      '@type': 'Person',
      name: manifest.author.handle,
      url: SITE.url,
      sameAs: [...manifest.author.links.map((link) => link.url), GITHUB],
    },
  ],
};

/**
 * Which mods actually have documentation -- derived from what was synced, not from `status: "active"`, so
 * a row links to `/docs/<id>/` only when there is something there to read.
 */
const documented = new Set(source.getPages().map((page) => page.slugs[0]));

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * A mod, as one row of a spec sheet -- and the one element on the site with three destinations in it.
 *
 * **The row is a `<div>` and the docs link is stretched over it**, because an `<a>` cannot contain an
 * `<a>`: nesting closes the outer anchor at the inner one and the rest of the row silently stops being a
 * link. `cell-link`'s `::after` covers the row (which is why `.grid-cell` is `position: relative`), and the
 * repository and CurseForge links are raised one z-index above it, so each stays its own destination. The
 * cost, stated: the summary cannot be selected by dragging, because the overlay is on top of it.
 *
 * **All three links are derived, not written** -- the repository from `repo`, CurseForge from its slug, the
 * docs from what synced -- so a row renders exactly the links it has. Each is named for its mod (`Tenet on
 * GitHub`), so a reader tabbing through hears a subject rather than a column of identical `github`s, and the
 * visible word is inside the accessible name, which is what label-in-name asks for.
 */
function ModRow({ mod, no }: { mod: SuiteMod; no: number }) {
  const hasDocs = documented.has(mod.id);
  const cfUrl = mod.curseforge ? `https://www.curseforge.com/minecraft/mc-mods/${mod.curseforge}` : null;
  // Latest-first in the manifest; oldest-first here, the way the CurseForge pages name the lines.
  const minecrafts = (
    Array.isArray(mod.versions) && mod.versions.length > 0
      ? [...mod.versions].reverse().map((v) => v.minecraft)
      : [mod.minecraft]
  ).filter(Boolean);

  // Separators are punctuation, not content: hidden, so a screen reader does not announce "middle dot".
  const links = [
    mod.repo ? (
      <a key="repo" className="cell-repo" href={mod.repo} target="_blank" rel="noreferrer noopener" aria-label={`${mod.name} on GitHub`}>
        github <Arrow />
      </a>
    ) : null,
    hasDocs ? (
      <a key="docs" className="cell-link" href={`/docs/${mod.id}/`} aria-label={`${mod.name} documentation`}>
        docs <Arrow within />
      </a>
    ) : null,
    cfUrl ? (
      <a key="cf" className="cell-repo" href={cfUrl} target="_blank" rel="noreferrer noopener" aria-label={`${mod.name} on CurseForge`}>
        curseforge <Arrow />
      </a>
    ) : null,
  ].filter(Boolean);

  /*
   * `grid-cell` is what responds to the pointer, and a row has it only when the docs link is stretched over
   * it. A mod with no docs is a plain `pub-cell` and stays still, which `.pub-cell:not(.grid-cell)` in
   * `global.css` keys on -- by class, because the row is never an `<a>` any more.
   */
  return (
    <div className={hasDocs ? 'grid-cell pub-cell mod' : 'pub-cell mod'}>
      <span className="row-no" aria-hidden="true">
        {pad(no)}
      </span>
      <div className="mod-head">
        <ModIcon id={mod.id} size="md" />
        <h3 className="mod-name">{mod.name}</h3>
      </div>
      <p className="mod-summary">{mod.summary}</p>
      <dl className="specs">
        <div>
          <dt>minecraft</dt>
          <dd>{minecrafts.join(' · ')}</dd>
        </div>
        <div>
          <dt>loaders</dt>
          <dd>{(mod.loaders ?? []).join(' · ')}</dd>
        </div>
        <div>
          <dt>state</dt>
          {/* A shipped mod states its version; anything else is `unreleased`. There is no third word: a
              mod that is not certain to exist is not in the manifest, so there is no row to describe. */}
          <dd>{mod.version ? `released · v${mod.version}` : 'unreleased'}</dd>
        </div>
      </dl>
      {links.length > 0 ? (
        <span className="cell-links">
          {links.flatMap((link, i) => (i === 0 ? [link] : [<span key={`sep${i}`} aria-hidden="true">·</span>, link]))}
        </span>
      ) : null}
    </div>
  );
}

/** A release from before the suite: a link out, its live download count, and a bar against its peers. */
function WorkRow({ item, no, peers }: { item: Selected; no: number; peers: Selected[] }) {
  // Whether the row has a figure at all is decided by the snapshot; the figure itself is live.
  const count = combined(s, item.modrinth, item.curseforge);
  return (
    <a className="grid-cell pub-cell work" href={item.url} target="_blank" rel="noreferrer noopener">
      <span className="row-no" aria-hidden="true">
        {pad(no)}
      </span>
      <span className="work-head">
        <span className="work-name">
          {item.name} <Arrow />
        </span>
        <span className="work-kind">{item.kind}</span>
      </span>
      <span className="work-summary">{item.summary}</span>
      {count ? (
        <span className="work-figures">
          <LiveBar
            modrinth={item.modrinth}
            curseforge={item.curseforge}
            peers={peers.map(({ modrinth, curseforge }) => ({ modrinth, curseforge }))}
          />
          <span className="work-count">
            {/* Staggered by position, so the three settle in sequence rather than at once. */}
            <b>
              <LiveCount modrinth={item.modrinth} curseforge={item.curseforge} delay={500 + no * 90} />
            </b>{' '}
            downloads
          </span>
          <span className="work-split">
            <LiveBreakdown modrinth={item.modrinth} curseforge={item.curseforge} />
          </span>
        </span>
      ) : null}
    </a>
  );
}

/**
 * A band's heading, numbered like a sheet in a set of drawings, with the rule between name and note drawn
 * as a dimension line. `.label` stays a span holding only the name, because `check.mjs` finds each brand
 * band by that exact markup.
 */
function BandHead({ no, label, note }: { no: string; label: string; note?: ReactNode }) {
  return (
    <div className="band-head">
      <h2 className="band-title">
        <span className="band-no" aria-hidden="true">
          {no}
        </span>
        <span className="label">{label}</span>
      </h2>
      <span className="band-rule" aria-hidden="true" />
      {note ? <span className="band-note">{note}</span> : null}
    </div>
  );
}

/**
 * One brand band, and **nothing at all when it has no mods**: a heading over nothing reads as a section
 * that failed to load. `check.mjs` asserts it both ways -- absent while empty, back the day the manifest
 * gives it a mod.
 */
function Band({ no, label, note, mods }: { no: string; label: string; note: string; mods: SuiteMod[] }) {
  if (mods.length === 0) return null;
  return (
    <section className="band">
      <BandHead no={no} label={label} note={note} />
      <div className="rows">
        {mods.map((mod, i) => (
          <ModRow key={mod.id} mod={mod} no={i + 1} />
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  /*
   * Nothing is listed unless it is certain to exist, and that is the filter rather than the manifest: a
   * stale entry is one forgotten line, and the row it would render states a mod and a Minecraft version for
   * something that may never ship. `check.mjs` holds the manifest to the same rule.
   */
  const suite = (manifest.suite as SuiteMod[]).filter((mod) => mod.status === 'active');
  // Whose before how far along: the bands are the brands, and each row states its own status.
  const stellar = suite.filter((m) => m.brand === 'stellar');
  const gameplay = suite.filter((m) => m.brand === 'ellipog');
  const selected = manifest.selected as Selected[];

  const total = s.totals?.all ?? 0;

  // Sheet numbers for the bands that render: an empty band must not leave a gap in the count.
  let sheet = 0;
  const no = () => pad(++sheet);
  const stellarNo = stellar.length > 0 ? no() : '';
  const gameplayNo = gameplay.length > 0 ? no() : '';
  const earlierNo = no();
  const elsewhereNo = no();

  return (
    <main className="home">
      {/* Parsed back out of the built HTML by `check.mjs`: a malformed block is invisible in a browser. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }} />

      <LiveStats initial={slim(s)} built={s.fetched}>
        <section className="hero">
          <div className="hero-side">
            <div className="hero-copy">
              <p className="kicker">ellipog.dev / mods</p>
              <h1>Minecraft mods.</h1>
              <p className="sub">Everything I release is on Modrinth and CurseForge, for Fabric and NeoForge.</p>
              <p className="hero-links">
                <a className="button" href="/docs/">
                  Read the docs <Arrow within />
                </a>
                {/* Both profiles, from the manifest's author links: the sentence above names both platforms. */}
                {manifest.author.links.map((link) => (
                  <a key={link.id} className="button button-quiet" href={link.url} target="_blank" rel="noreferrer noopener">
                    {link.label} <Arrow />
                  </a>
                ))}
              </p>
            </div>

            {/*
             * The counter is an instrument rather than a headline: it says where its numbers come from,
             * whether they are live, and when it last read -- and it sits under the words, in the same
             * column, so the first screen is the claim and the evidence for it.
             */}
            {total > 0 ? (
              <div className="tracker" role="group" aria-label="Downloads">
                <div className="tracker-head">
                  <span className="label">Downloads · all platforms</span>
                  <LiveStatus />
                </div>
                <p className="hero-total">
                  <b>
                    <LiveTotal of="all" />
                  </b>
                  <LiveDelta />
                </p>
                <LiveShare />
                {/* The split settles silently on load -- one flourish, on the headline figure, is the
                    gesture -- and then ticks like the total when a poll moves it. */}
                <dl className="tracker-split">
                  <div>
                    <dt>
                      <i className="key key-dark" aria-hidden="true" />
                      Modrinth
                    </dt>
                    <dd>
                      <LiveTotal of="modrinth" still />
                    </dd>
                  </div>
                  <div>
                    <dt>
                      <i className="key" aria-hidden="true" />
                      CurseForge
                    </dt>
                    <dd>
                      <LiveTotal of="curseforge" still />
                    </dd>
                  </div>
                  <div>
                    <dt>Read</dt>
                    <dd>
                      <LivePolled />
                    </dd>
                  </div>
                </dl>
              </div>
            ) : null}
          </div>

          <World />
        </section>

        <Band no={stellarNo} label="Stellar" note="the developer suite" mods={stellar} />
        <Band no={gameplayNo} label="ellipog" note="gameplay" mods={gameplay} />

        <section className="band">
          <BandHead
            no={earlierNo}
            label="Earlier work"
            note={
              <>
                addons &amp; packs ·{' '}
                <a href={manifest.author.links[0].url} target="_blank" rel="noreferrer noopener">
                  everything else <Arrow />
                </a>
              </>
            }
          />
          <div className="rows">
            {selected.map((item, i) => (
              <WorkRow key={item.id} item={item} no={i + 1} peers={selected} />
            ))}
          </div>
        </section>
      </LiveStats>

      <section className="band">
        <BandHead no={elsewhereNo} label="Elsewhere" />
        <div className="about">
          <div className="about-copy">
            <p>{manifest.author.bio}</p>
            <p>
              Download counts are read live from Modrinth and CurseForge while this page is open. The
              CurseForge figures come through a mirror that refreshes about once an hour.
            </p>
          </div>
          <div className="links">
            {manifest.author.links.map((link) => (
              <a key={link.id} href={link.url} target="_blank" rel="noreferrer noopener">
                <span className="link-label">
                  {link.label} <Arrow />
                </span>
                <span className="link-handle">{link.handle}</span>
              </a>
            ))}
            <a href={GITHUB} target="_blank" rel="noreferrer noopener">
              <span className="link-label">
                GitHub <Arrow />
              </span>
              <span className="link-handle">ellipog</span>
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
