import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import { CARD, SITE } from '@/lib/metadata';

/*
 * The card a link to this site shows — same construction as
 * `apps/docs/app/og.png/route.tsx`.
 *
 * A plain route at a stable path, named by `social()` for every page, rather
 * than the `opengraph-image.tsx` file convention: a page that sets its own
 * `openGraph` replaces the injected convention image instead of merging with
 * it, so convention pages ship without an `og:image` and nothing looks wrong.
 * The path has a dot on purpose: `/og.png` is served as an image by
 * extension, where the convention's extensionless output left the content
 * type to the host's guess.
 *
 * Built at build time by `next/og`, from the manifest facts and the
 * stylesheet — never a committed PNG somebody has to remember to update. The
 * fonts are `next/og`'s own: this site uses system stacks with no font files,
 * so there is nothing to hand Satori.
 */

export const dynamic = 'force-static';

/*
 * The three colours, read from the stylesheet the site paints with.
 * Satori cannot read CSS variables, so the values are read out of the same
 * `:root` block the site resolves them from. A missing token throws rather
 * than falling back — a card quietly painted `undefined` ships; a build that
 * stops names the token.
 */
function tokens() {
  const css = readFileSync(join(process.cwd(), 'app', 'global.css'), 'utf8');
  const root = /:root\s*\{([\s\S]*?)\}/.exec(css)?.[1] ?? '';

  const value = (name: string) => {
    const found = new RegExp(`--${name}:\\s*([^;]+);`).exec(root)?.[1]?.trim();
    if (!found) throw new Error(`app/global.css has no --${name} token in :root`);
    return found;
  };

  return { ground: value('bg'), ink: value('fg'), muted: value('fg-muted') };
}

export async function GET() {
  const { ground, ink, muted } = tokens();

  // The mark drawn on a light ground — this card is always light, so it is
  // always this one, and the same committed file the masthead uses.
  const mark = readFileSync(join(process.cwd(), 'public', 'site', 'mark-on-light.png')).toString('base64');

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: ground,
          color: ink,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`data:image/png;base64,${mark}`} width={60} height={60} alt="" />
          <div style={{ fontSize: 34, letterSpacing: -0.5 }}>tenet migrator</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ fontSize: 88, letterSpacing: -3, lineHeight: 1 }}>FTB Quests → Tenet.</div>
          <div style={{ fontSize: 31, lineHeight: 1.35, color: muted, maxWidth: 900 }}>{SITE.description}</div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 26, color: muted }}>
          <div>Free · client-side · Minecraft 1.21.1</div>
          <div>{SITE.domain}</div>
        </div>
      </div>
    ),
    { width: CARD.width, height: CARD.height },
  );
}
