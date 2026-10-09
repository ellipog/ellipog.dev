import type { Metadata } from 'next';

import manifest from '@/manifest.json';
import stats from '@/stats.json';
import { Arrow } from '@/components/arrow';
import { ModIcon } from '@/components/mod-icon';
import { ShuffledNumber } from '@/components/shuffled-number';
import { SITE, social } from '@/lib/metadata';
import { source } from '@/lib/source';

type SuiteMod = {
  id: string;
  name: string;
  /**
   * Which brand the mod belongs to: `stellar` for the developer suite, `ellipog` for the gameplay
   * portfolio. The catalog's bands group by it, so a mod without one renders in neither band and
   * disappears from the page without an error — which is why `check.mjs` asserts every entry has it.
   */
  brand?: string;
  status?: string;
  summary: string;
  /**
   * Where the code lives, and it is the cell's second destination.
   *
   * Optional: a mod can be certain enough to list and still have no public repository. The cell renders
   * the link only when the field is there, so adding a mod to the manifest without one cannot produce a
   * link to nothing.
   */
  repo?: string;
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

type StatsFile = {
  modrinth: Record<string, { downloads: number; url: string }>;
  curseforge: Record<string, { downloads: number; url: string }>;
  totals: { modrinth: number; curseforge: number; all: number };
  notes: string[];
};

const s = stats as StatsFile;
const n = (v: number) => v.toLocaleString('en-US');

/** The author's code host. One spelling, because the Elsewhere band and the structured data both link it. */
const GITHUB = 'https://github.com/ellipog';

/**
 * The home page's canonical URL and its share card.
 *
 * The tab title is left to the layout's default — this page is the site, so it needs no `%s`. What
 * it does need is the head's other half: without a canonical, `/` and any future `/index.html` are
 * two URLs for one page, and without this the home card would be the only page with no card.
 */
export const metadata: Metadata = social({
  title: SITE.title,
  description: SITE.description,
  path: '/',
});

/**
 * Who and what this site is, for a crawler that reads schema.org.
 *
 * Two nodes and no more. Deliberately **not** a `SoftwareApplication` per mod: a rich result for
 * software is built from ratings or an offer, and inventing either would be marking up claims
 * nobody made — the same judgement the sponsor's badge makes about not saying "verified".
 *
 * `sameAs` is derived from the manifest's author links plus the GitHub profile the Elsewhere band
 * already links, so it cannot point at a profile this page does not show.
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
 * Which mods actually have documentation.
 *
 * **Derived from what was synced, not from `status: "active"`.** A mod that is active but has no
 * `docs/` folder produces no pages, and linking its catalog cell to `/docs/<id>/` would be a 404 --
 * a link that looks like a destination and is not one. Reading the built pages makes the cell and the
 * site agree by construction: if there is nothing to read, the cell is not a link.
 */
const documented = new Set(source.getPages().map((page) => page.slugs[0]));

/**
 * One project's downloads across both platforms.
 *
 * Summed rather than picked, because a project on two platforms is one project and showing only the
 * Modrinth figure would undercount the bigger one by more than half. Returns null when neither
 * platform has a number, so a cell can say nothing rather than say zero.
 */
function combined(item: Selected) {
  const mr = item.modrinth ? s.modrinth[item.modrinth]?.downloads : undefined;
  const cf = item.curseforge ? s.curseforge[item.curseforge]?.downloads : undefined;
  if (mr === undefined && cf === undefined) return null;

  const parts: string[] = [];
  if (mr !== undefined) parts.push(`${n(mr)} Modrinth`);
  if (cf !== undefined) parts.push(`${n(cf)} CurseForge`);
  return { total: (mr ?? 0) + (cf ?? 0), breakdown: parts.join(' · ') };
}

/** How many placeholder cells a grid needs to close its last row. */
function fillers(count: number, cols: number) {
  return (cols - (count % cols)) % cols;
}

function Filler() {
  return <div className="grid-filler" aria-hidden />;
}

/**
 * A mod in the catalog, and the one cell on the site with two destinations in it.
 *
 * **This used to be a single `<a>` around the whole cell, and an `<a>` cannot contain an `<a>`.** That
 * was fine while the cell had one destination. It stopped being fine when the cell gained a second one:
 * a link to the mod's repository, so a visitor can read the code without the documentation being the
 * only way through. Nesting is not an option the browser forgives — it closes the outer anchor at the
 * inner one and the rest of the cell silently stops being clickable.
 *
 * **So the cell is a `<div>` and the docs link is stretched over it.** `cell-link`'s `::after` is an
 * absolutely positioned box covering the cell's own padding box, which is why `.grid-cell` carries
 * `position: relative` in `global.css`. Nothing about the surface changes for a reader: every pixel that
 * navigated to the docs page before still does. The repository link is raised above that overlay by one
 * z-index, so it stays its own destination rather than being swallowed by the link underneath it.
 *
 * **The one thing this costs, stated rather than discovered:** text inside the cell can no longer be
 * selected by dragging, because the overlay sits over it. Inside an `<a>` it could. That is the trade the
 * stretched-link pattern always makes, it is invisible unless somebody tries to copy the summary, and the
 * alternative — two links and no whole-cell target — makes the commonest action on the page (open the
 * docs) require aiming at a 40px label.
 *
 * **Both links are derived, not written.** The repository comes from the manifest's `repo` and the docs
 * link from what actually synced, so a mod with no repository or no `docs/` folder renders exactly the
 * links it has rather than a link to a page that does not exist. The docs branch is unchanged in that
 * respect; the repository branch follows the same rule for the same reason.
 */
function SuiteCell({ mod }: { mod: SuiteMod }) {
  const hasDocs = documented.has(mod.id);

  const body = (
    <>
      <div className="cell-top">
        <span className="cell-index">{mod.minecraft ?? ''}</span>
        <span className="kind">{(mod.loaders ?? []).join(' · ')}</span>
      </div>
      {/* The mark sits with the name rather than in the cell's corner: it is part of how the thing is
          identified, and the corner is where the version already is. */}
      <div className="name">
        <ModIcon id={mod.id} size="md" />
        {mod.name}
      </div>
      <p className="summary">{mod.summary}</p>
      <div className="meta">
        {/* The one status a listed mod can have. `planned` is not a state this page knows: a mod that is
            not certain to exist is not in the manifest, so there is no cell for it to describe -- see
            `Home` below, and `manifest.json`'s own note. */}
        <span className="faint">in development</span>
        {hasDocs || mod.repo ? (
          <span className="cell-links faint">
            {mod.repo ? (
              /*
               * Named per mod rather than left as the bare word `github`.
               *
               * This was a `<span>` inside one big anchor when the cell had a single destination, so a
               * screen reader announced the whole cell — "Tenet, A questing engine…, in development,
               * docs" — and the words here were only ever a signpost for the eye. Now that they are a
               * link of their own, "github" on its own is a link with no subject: a reader tabbing
               * through the catalog hears one identical name per cell.
               *
               * The accessible name contains the visible text, which is what WCAG's label-in-name asks
               * for — the same reason a bare "read more" is a bad link name and "Read the Tenet manual"
               * is a good one.
               */
              <a
                className="cell-repo"
                href={mod.repo}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={`${mod.name} on GitHub`}
              >
                github <Arrow />
              </a>
            ) : null}
            {mod.repo && hasDocs ? (
              // Punctuation, not content, and no class: a screen reader announcing "middle dot" between
              // two links is noise, so it is hidden — and it needs no styling of its own, because
              // `.cell-links` already spaces its children apart. A class here would be a selector in the
              // stylesheet that does nothing, which is the thing that file's own header warns about.
              <span aria-hidden="true">·</span>
            ) : null}
            {hasDocs ? (
              // Same reason as the repository link above: `docs` alone would be one of a row of identical
              // link names on this page. The visible text is inside the accessible one.
              <a className="cell-link" href={`/docs/${mod.id}/`} aria-label={`${mod.name} documentation`}>
                docs <Arrow />
              </a>
            ) : null}
          </span>
        ) : null}
      </div>
    </>
  );

  /*
   * The `grid-cell` class is what inverts on hover, and it is put on the cell only when the cell is a
   * destination for the docs — the same condition as before, on a different element. A mod with no docs
   * is a `<div class="pub-cell">` and does not invert, which is `global.css`'s `a.grid-cell` becoming
   * `.grid-cell`: the qualifier had to go, or every cell in the first band would have quietly stopped
   * responding to the pointer.
   */
  return hasDocs ? (
    <div className="grid-cell pub-cell">{body}</div>
  ) : (
    <div className="pub-cell">{body}</div>
  );
}

function SelectedCell({ item, index }: { item: Selected; index: number }) {
  const count = combined(item);
  return (
    <a className="grid-cell pub-cell" href={item.url} target="_blank" rel="noreferrer noopener">
      <div className="cell-top">
        <span className="cell-index">{item.kind}</span>
      </div>
      <div className="name">
        {item.name} <Arrow />
      </div>
      <p className="summary">{item.summary}</p>
      {count ? (
        <div className="meta">
          <span className="nums">
            {/* Staggered by position, so the three settle in sequence rather than at once. The
                breakdown beside it is left alone on purpose: four numbers shuffling in one cell is
                noise, and the headline figure is the one worth the flourish. */}
            <b>
              <ShuffledNumber value={n(count.total)} delay={100 + index * 90} />
            </b>{' '}
            downloads
          </span>
          <span className="faint">{count.breakdown}</span>
        </div>
      ) : null}
    </a>
  );
}

/**
 * One brand band — and **nothing at all when it has no cells**.
 *
 * A band is a label, a hairline and a row of cells. With no cells it is a label and a hairline, which
 * reads as a section that failed to load rather than as a section with nothing in it. That state is
 * reachable the moment the manifest holds no mod of one brand, and it is the state today: the gameplay
 * portfolio's first mod is not certain to exist, so it is not in the manifest, so there is no band for it
 * until there is something to put in one. **No "coming soon" slot** — the same rule the stack plan states
 * for empty tiers, and the reason this is a component rather than a condition written twice: the band
 * that is empty first is not always the same one.
 *
 * `check.mjs` asserts it in both directions — the band is absent while it holds nothing, and comes back
 * the day the manifest gives it a mod — because "no band" and "an empty band" are one edit apart and only
 * one of them is right.
 */
function Band({ label, note, mods }: { label: string; note: string; mods: SuiteMod[] }) {
  if (mods.length === 0) return null;

  return (
    <section className="band">
      <div className="band-head">
        <span className="label">{label}</span>
        <span className="faint mono">{note}</span>
      </div>
      <div className="grid" style={{ ['--cols' as string]: '3' }}>
        {mods.map((mod) => (
          <SuiteCell key={mod.id} mod={mod} />
        ))}
        {/* The placeholders that close the last row are their own list inside their own grid, so their
            keys only have to be unique among themselves -- which is why one band's do not need a prefix
            to stay clear of the other's. */}
        {Array.from({ length: fillers(mods.length, 3) }, (_, i) => (
          <Filler key={`f${i}`} />
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  /*
   * NOTHING IS LISTED UNLESS IT IS CERTAIN TO EXIST, AND THAT IS THE FILTER RATHER THAN THE MANIFEST.
   *
   * The manifest holds only active mods today (see its own note, and AGENT.md), so this changes nothing
   * about today's page. It is here because the two failure modes are not the same size: a stale manifest
   * entry is one line somebody forgot to delete, and the cell it would render states a mod, a summary and
   * a Minecraft version for something that may never ship. Reading the status at the point of rendering
   * means the leak cannot happen whatever the data says -- a mod is on this page when it is `active` and
   * at no other time, and the assertion in `check.mjs` holds the manifest to the same rule.
   */
  const suite = (manifest.suite as SuiteMod[]).filter((mod) => mod.status === 'active');
  /*
   * Brand inside that, and the status word stays off the band.
   *
   * The bands used to be status-first — "In development" and "Planned" — which answered *how far along*
   * before *whose is this*. The architecture says whose first: Stellar is the developer suite, ellipog is
   * the gameplay portfolio, and a reader who arrives for one mod should see which family it belongs to.
   * Status did not disappear: every cell states it in its own footer, which is where a reader looks after
   * the name. What changed is which question the band answers — *whose is this* before *how far along is
   * it*. `check.mjs` asserts every entry declares a brand, because one without it would render in neither
   * band — and AGENT.md carries the reasoning.
   */
  const stellar = suite.filter((m) => m.brand === 'stellar');
  const gameplay = suite.filter((m) => m.brand === 'ellipog');
  const selected = manifest.selected as Selected[];

  const total = s.totals?.all ?? 0;

  return (
    <main>
      {/* The one script on this page that is data rather than markup. `check.mjs` parses it back
          out of the built HTML and asserts it still says WebSite and Person — a `JSON.parse` is the
          only way to catch a stray character, and a malformed block is invisible in a browser. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }} />

      <section className="hero">
        <p className="eyebrow">fabric + neoforge · minecraft</p>
        <h1>Minecraft mods.</h1>
        <p className="sub">
          Some released, some still being built. Everything published is on Modrinth and CurseForge.
        </p>
        {total > 0 ? (
          <p className="hero-total">
            <b>
              <ShuffledNumber value={n(total)} />
            </b>
            {/* The label, as a direct child of `.hero-total`. The stylesheet depends on that: the
                figure's own spans are nested inside `<b>`, and a descendant selector would paint them
                too -- which is exactly what it did. */}
            <span>downloads · modrinth + curseforge</span>
          </p>
        ) : null}
      </section>

      <Band label="Stellar" note="the developer suite" mods={stellar} />
      <Band label="ellipog" note="gameplay" mods={gameplay} />

      <section className="band">
        <div className="band-head">
          <span className="label">Earlier work</span>
          <span className="faint mono">
            addons &amp; packs ·{' '}
            <a href={manifest.author.links[0].url} target="_blank" rel="noreferrer noopener">
              everything else <Arrow />
            </a>
          </span>
        </div>
        <div className="grid" style={{ ['--cols' as string]: '3' }}>
          {selected.map((item, i) => (
            <SelectedCell key={item.id} item={item} index={i} />
          ))}
          {Array.from({ length: fillers(selected.length, 3) }, (_, i) => (
            <Filler key={`s${i}`} />
          ))}
        </div>
      </section>

      <section className="band">
        <div className="band-head">
          <span className="label">Elsewhere</span>
        </div>
        <div className="about">
          <div>
            <p>{manifest.author.bio}</p>
            <p>
              Download counts are fetched from both platform APIs at build time, and the site rebuilds
              automatically on a schedule.
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
