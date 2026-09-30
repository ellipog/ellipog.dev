import manifest from '@/manifest.json';
import stats from '@/stats.json';
import { Arrow } from '@/components/arrow';
import { ShuffledNumber } from '@/components/shuffled-number';
import { source } from '@/lib/source';

type SuiteMod = {
  id: string;
  name: string;
  status?: string;
  summary: string;
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

function SuiteCell({ mod }: { mod: SuiteMod }) {
  const body = (
    <>
      <div className="cell-top">
        <span className="cell-index">{mod.minecraft ?? ''}</span>
        <span className="kind">{(mod.loaders ?? []).join(' · ')}</span>
      </div>
      <div className="name">{mod.name}</div>
      <p className="summary">{mod.summary}</p>
      <div className="meta">
        <span className="faint">{mod.status === 'active' ? 'in development' : 'planned'}</span>
        {documented.has(mod.id) ? (
          <span className="faint">
            docs <Arrow />
          </span>
        ) : null}
      </div>
    </>
  );

  return documented.has(mod.id) ? (
    <a className="grid-cell pub-cell" href={`/docs/${mod.id}/`}>
      {body}
    </a>
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

export default function Home() {
  const suite = manifest.suite as SuiteMod[];
  const active = suite.filter((m) => m.status === 'active');
  const planned = suite.filter((m) => m.status !== 'active');
  const selected = manifest.selected as Selected[];

  const total = s.totals?.all ?? 0;

  return (
    <main>
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

      <section className="band">
        <div className="band-head">
          <span className="label">In development</span>
          <span className="faint mono">1.21.1</span>
        </div>
        <div className="grid" style={{ ['--cols' as string]: '2' }}>
          {active.map((mod) => (
            <SuiteCell key={mod.id} mod={mod} />
          ))}
          {Array.from({ length: fillers(active.length, 2) }, (_, i) => (
            <Filler key={`a${i}`} />
          ))}
        </div>
      </section>

      <section className="band">
        <div className="band-head">
          <span className="label">Planned</span>
          <span className="faint mono">after the 26.x port</span>
        </div>
        <div className="grid" style={{ ['--cols' as string]: '4' }}>
          {planned.map((mod) => (
            <SuiteCell key={mod.id} mod={mod} />
          ))}
          {Array.from({ length: fillers(planned.length, 4) }, (_, i) => (
            <Filler key={`p${i}`} />
          ))}
        </div>
      </section>

      <section className="band">
        <div className="band-head">
          <span className="label">Released</span>
          <span className="faint mono">
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
              Download counts are fetched from both platform APIs when this site builds, so they are
              whatever those APIs said that day rather than a number typed into a file.
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
            <a href="https://github.com/ellipog" target="_blank" rel="noreferrer noopener">
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
