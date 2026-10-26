'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { ShuffledNumber } from '@/components/shuffled-number';
import { combined, formatCount } from '@/lib/downloads';
import type { ProjectCount, Stats } from '@/lib/platforms.mjs';

/**
 * The catalog's download figures, kept current while the page is open.
 *
 * **The first render is the build's snapshot, and that is the property everything else rests on.** The
 * provider starts from `stats.json`, so the static HTML carries real numbers: JavaScript off, a crawler,
 * or an API that is down all get a correct figure that simply does not move. `check.mjs` asserts the
 * snapshot total is in the HTML and that the status starts out saying `snapshot` rather than `live`.
 *
 * Then it polls. **`/api/stats` first** -- a Vercel function with a one-minute edge cache, so every open
 * tab costs one small request a minute however many are open. When that route is not there (`next dev`,
 * or a static host that is not Vercel) it answers 404 or HTML, and the provider switches to fetching the
 * platforms itself through the same `lib/platforms.mjs` the function uses, every five minutes rather than
 * every one, because that path is ~23 requests instead of one.
 *
 * Polling stops while the tab is hidden and catches up the moment it is shown again.
 */

/** How often each source is asked. The API is edge-cached for 60s, so asking more often gains nothing. */
const API_EVERY_MS = 60_000;
const DIRECT_EVERY_MS = 5 * 60_000;

type Status = 'snapshot' | 'live' | 'offline';

type LiveState = {
  stats: Stats;
  status: Status;
  /** When the last successful poll answered. Null until one has. */
  polledAt: Date | null;
  /** The total at the first live answer, so the page can say how much it has moved while open. */
  baseline: number | null;
  /** The snapshot's date, shown until the first poll replaces it. */
  built?: string;
  /** A read is in flight. */
  polling: boolean;
  /** When the next read is due, and the interval it is part of. Null while paused or before the first. */
  nextAt: number | null;
  every: number;
};

const LiveContext = createContext<LiveState | null>(null);

function useLive() {
  const live = useContext(LiveContext);
  if (!live) throw new Error('live figures must be inside <LiveStats>');
  return live;
}

/**
 * Fold a fresh answer into what the page already shows.
 *
 * **A platform that did not answer keeps its figures**, and a project that failed to resolve this time
 * keeps its last count, because both would otherwise read as a drop: cfwidget failing for one project
 * would take 400,000 off the total for a minute and put it back on the next poll. And **a count never
 * goes backwards** -- downloads only accumulate, so a lower figure is a lagging mirror rather than news.
 */
function merge(prev: Stats, next: Stats): Stats {
  const fold = (a: Record<string, ProjectCount>, b: Record<string, ProjectCount> | undefined, answered: boolean) => {
    if (!answered || !b) return a;
    const out = { ...a };
    for (const [slug, project] of Object.entries(b)) {
      out[slug] = { ...a[slug], downloads: Math.max(a[slug]?.downloads ?? 0, project?.downloads ?? 0) };
    }
    return out;
  };

  const answered = (platform: 'modrinth' | 'curseforge') =>
    next.ok ? next.ok[platform] : Object.keys(next[platform] ?? {}).length > 0;

  const modrinth = fold(prev.modrinth, next.modrinth, answered('modrinth'));
  const curseforge = fold(prev.curseforge, next.curseforge, answered('curseforge'));
  const total = (map: Record<string, ProjectCount>) => Object.values(map).reduce((n, p) => n + (p?.downloads ?? 0), 0);
  const totals = { modrinth: total(modrinth), curseforge: total(curseforge), all: 0 };
  totals.all = totals.modrinth + totals.curseforge;

  return { ...prev, modrinth, curseforge, totals };
}

export function LiveStats({ initial, built, children }: { initial: Stats; built?: string; children: ReactNode }) {
  const [state, setState] = useState<LiveState>({
    stats: initial,
    status: 'snapshot',
    polledAt: null,
    baseline: null,
    built,
    polling: false,
    nextAt: null,
    every: API_EVERY_MS,
  });

  useEffect(() => {
    const controller = new AbortController();
    let mode: 'api' | 'direct' = 'api';
    let timer: number | undefined;
    let lastPoll = 0;
    let inFlight = false;

    /** The function's answer, `missing` when there is no function here, or null when it failed. */
    async function viaApi(): Promise<Stats | 'missing' | null> {
      const res = await fetch('/api/stats', { signal: controller.signal, headers: { Accept: 'application/json' } });
      // `next dev` and plain static hosts answer an unknown path with an HTML 404 page.
      if (res.status === 404 || !(res.headers.get('content-type') ?? '').includes('json')) return 'missing';
      if (!res.ok) return null;
      return (await res.json()) as Stats;
    }

    async function viaPlatforms(): Promise<Stats | null> {
      // Loaded only on this path, so a deployment with the function never ships the fetcher to the browser.
      const { collectStats } = await import('@/lib/platforms.mjs');
      const stats = await collectStats({ concurrency: 4, delay: 0 });
      return stats.ok.modrinth || stats.ok.curseforge ? stats : null;
    }

    function schedule() {
      window.clearTimeout(timer);
      if (controller.signal.aborted) return;
      if (document.hidden) {
        setState((prev) => ({ ...prev, nextAt: null }));
        return;
      }
      const every = mode === 'api' ? API_EVERY_MS : DIRECT_EVERY_MS;
      const nextAt = Math.max(Date.now(), lastPoll + every);
      timer = window.setTimeout(poll, nextAt - Date.now());
      setState((prev) => ({ ...prev, nextAt, every }));
    }

    async function poll() {
      if (inFlight) return;
      inFlight = true;
      lastPoll = Date.now();
      setState((prev) => ({ ...prev, polling: true }));
      try {
        let next = mode === 'api' ? await viaApi() : await viaPlatforms();
        if (next === 'missing') {
          mode = 'direct';
          next = await viaPlatforms();
        }
        if (controller.signal.aborted) return;
        const answer = next;
        if (answer && answer.totals) {
          setState((prev) => {
            const stats = merge(prev.stats, answer);
            return { ...prev, stats, status: 'live', polledAt: new Date(), baseline: prev.baseline ?? stats.totals.all };
          });
        } else {
          setState((prev) => ({ ...prev, status: 'offline' }));
        }
      } catch {
        if (!controller.signal.aborted) setState((prev) => ({ ...prev, status: 'offline' }));
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) setState((prev) => ({ ...prev, polling: false }));
        schedule();
      }
    }

    // Hidden: stop asking. Shown: `schedule` works out what is owed, which is "now" after a long absence.
    const onVisibility = () => schedule();

    document.addEventListener('visibilitychange', onVisibility);
    poll();

    return () => {
      controller.abort();
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return <LiveContext.Provider value={state}>{children}</LiveContext.Provider>;
}

/** A platform total, or both. Shuffles into place on load, and again -- only the digits that moved -- on every change. */
export function LiveTotal({ of, delay, still }: { of: 'all' | 'modrinth' | 'curseforge'; delay?: number; still?: boolean }) {
  const { stats } = useLive();
  return <ShuffledNumber value={formatCount(stats.totals[of])} delay={delay} still={still} />;
}

/** One project across both platforms. The cell only renders this when the snapshot had a figure for it. */
export function LiveCount({ modrinth, curseforge, delay }: { modrinth?: string; curseforge?: string; delay?: number }) {
  const { stats } = useLive();
  const count = combined(stats, modrinth, curseforge);
  return count ? <ShuffledNumber value={formatCount(count.total)} delay={delay} /> : null;
}

/** The per-platform split under a cell's figure. Plain text: it updates, but it is not worth a flourish. */
export function LiveBreakdown({ modrinth, curseforge }: { modrinth?: string; curseforge?: string }) {
  const { stats } = useLive();
  return <>{combined(stats, modrinth, curseforge)?.breakdown ?? null}</>;
}

const STATUS_WORD: Record<Status, string> = {
  snapshot: 'snapshot',
  live: 'live',
  offline: 'offline',
};

/**
 * What the figures are: the build's snapshot, a live reading, or the last reading before the source went
 * quiet. Never says `live` in the static HTML -- a page that cannot poll has no business claiming to.
 */
export function LiveStatus() {
  const { status } = useLive();
  return (
    <span className="live-status" data-status={status}>
      <span className="live-mark" aria-hidden="true" />
      {STATUS_WORD[status]}
      <LiveMeter />
    </span>
  );
}

/** Ten cells: the width of the meter, and of the run the bouncer travels while a read is in flight. */
const METER = 10;
const BOUNCER = 3;

/**
 * The poll, drawn in pixels: ten square cells filling toward the next read, and three lit cells bouncing
 * end to end while one is in flight -- the indeterminate bar every installer has drawn since the 90s.
 *
 * Nothing in the static HTML: before the first poll there is no schedule to draw. With reduced motion the
 * bounce is a still checkerboard; the fill stays, because it moves a cell every six seconds and is the
 * only place the page says when it will next read.
 */
function LiveMeter() {
  const { polling, nextAt, every } = useLive();
  const [now, setNow] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches), []);

  useEffect(() => {
    if (!polling && nextAt === null) return;
    // Fast while bouncing; while filling, twice a cell is enough to never look late.
    const step = polling && !reduced ? 70 : 500;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), step);
    return () => window.clearInterval(timer);
  }, [polling, nextAt, reduced]);

  let lit: (i: number) => boolean;
  if (polling) {
    const span = METER - BOUNCER;
    const phase = Math.floor(now / 70) % (span * 2);
    const at = phase <= span ? phase : span * 2 - phase;
    lit = reduced ? (i) => i % 2 === 0 : (i) => i >= at && i < at + BOUNCER;
  } else if (nextAt !== null && now !== 0) {
    const filled = Math.max(0, Math.min(METER, Math.round((1 - (nextAt - now) / every) * METER)));
    lit = (i) => i < filled;
  } else {
    return null;
  }

  return (
    <span className="live-meter" aria-hidden="true">
      {Array.from({ length: METER }, (_, i) => (
        <i key={i} data-on={lit(i) ? '' : undefined} />
      ))}
    </span>
  );
}

/** How far the total has moved since the page was opened, beside the figure. Drawn only once it is above zero. */
export function LiveDelta() {
  const { stats, baseline } = useLive();
  const moved = baseline === null ? 0 : stats.totals.all - baseline;
  return moved > 0 ? <span className="live-delta">+{formatCount(moved)} since you opened this</span> : null;
}

/** When the figures were read: the build date until the first poll, then the time of the last answer. */
export function LivePolled() {
  const { polledAt, built } = useLive();
  if (!polledAt) return <>{built ? `build ${built}` : 'build'}</>;
  return (
    <time dateTime={polledAt.toISOString()}>
      {polledAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
    </time>
  );
}

/** Cells in the platform split and in a project's bar. Enough to read a share to a few percent, few enough to count. */
const SHARE_CELLS = 48;
const BAR_CELLS = 30;

/**
 * Modrinth against CurseForge, as a row of square cells: dark for one, light for the other, in the order
 * the figures beside it are listed. A chart rather than an animation, and it moves only when a poll does.
 */
export function LiveShare() {
  const { stats } = useLive();
  const { modrinth, all } = stats.totals;
  if (!all) return null;
  const dark = Math.round((modrinth / all) * SHARE_CELLS);
  return (
    <span className="share" aria-hidden="true">
      {Array.from({ length: SHARE_CELLS }, (_, i) => (
        <i key={i} data-on={i < dark ? '' : undefined} />
      ))}
    </span>
  );
}

type Ref = { modrinth?: string; curseforge?: string };

/** One project's downloads as cells, scaled to the largest of its peers, so the rows compare at a glance. */
export function LiveBar({ modrinth, curseforge, peers }: Ref & { peers: Ref[] }) {
  const { stats } = useLive();
  const own = combined(stats, modrinth, curseforge)?.total ?? 0;
  const most = Math.max(1, ...peers.map((p) => combined(stats, p.modrinth, p.curseforge)?.total ?? 0));
  const lit = own > 0 ? Math.max(1, Math.round((own / most) * BAR_CELLS)) : 0;
  return (
    <span className="bar" aria-hidden="true">
      {Array.from({ length: BAR_CELLS }, (_, i) => (
        <i key={i} data-on={i < lit ? '' : undefined} style={{ ['--i' as string]: i }} />
      ))}
    </span>
  );
}
