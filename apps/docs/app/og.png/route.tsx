import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import { CARD, SITE } from '@/lib/metadata';

/*
 * The card a link to this site shows.
 *
 * **A route, not a file convention.** `app/opengraph-image.tsx` was tried first and attached the
 * image to the home page only — a page that sets its own `openGraph` replaces the injected one
 * rather than merging with it, so every `/docs` page shipped without an `og:image` and nothing about
 * them looked wrong. A plain route at a stable path, named by `social()` for every page, cannot be
 * dropped by a page that has not heard of it. `lib/metadata.ts` carries the rest of that reasoning,
 * and `CARD` is where this file and the `og:image` tags agree on the size.
 *
 * **It is built at build time, not drawn by hand.** `next/og` renders JSX to a PNG as part of the
 * build, so the card is a function of the manifest and the stylesheet: change the description and
 * the card changes with it. A committed PNG, like the site's two marks, is a copy somebody has to
 * remember to update — and this is the one asset where staleness is invisible, because a share card
 * is only ever seen somewhere else.
 *
 * **It appears in link previews and nowhere on the site.** Nothing here changes how a page looks;
 * it changes what Discord, Slack, X and a search result show when somebody pastes a URL.
 *
 * **The fonts are `next/og`'s own, and that is a knowing compromise.** The site uses system font
 * stacks deliberately — no build-time font fetch, so the build works offline — and there is no
 * `@font-face` or font file in the repository to hand Satori. Committing a font just for the card
 * would be a dependency the site's own typography does not have, so the card is set in the bundled
 * font and this note is the record of it.
 *
 * The path has a dot in it on purpose: `/og.png` is served as an image by extension, where the
 * convention's extensionless `/opengraph-image` left the content type to the host's guess.
 */

export const dynamic = 'force-static';

/**
 * The three colours, read from the stylesheet the site paints with.
 *
 * A hex copied into this file would be a second place a colour lives, and this site's colours live
 * in `global.css`'s tokens — where the dark theme overrides them and where `check.mjs` already
 * looks. Satori cannot read CSS variables, so the values are read instead, out of the same `:root`
 * block the site itself resolves them from.
 *
 * **A missing token throws rather than falling back.** A card quietly painted `undefined` is a
 * failure that ships; a build that stops names the token. The regexes anchor on the colon so
 * `--bg:` cannot be satisfied by `--bg-sunken:`.
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

  // The mark that is drawn on a light ground — this card is always light, so it is always this one,
  // and it is the same committed file the masthead uses rather than a second drawing of it.
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
          <div style={{ fontSize: 34, letterSpacing: -0.5 }}>ellipog</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ fontSize: 96, letterSpacing: -3, lineHeight: 1 }}>Minecraft mods.</div>
          <div style={{ fontSize: 33, lineHeight: 1.35, color: muted, maxWidth: 900 }}>{SITE.description}</div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 26, color: muted }}>
          <div>Fabric + NeoForge · Minecraft 1.21.1</div>
          <div>{SITE.domain}</div>
        </div>
      </div>
    ),
    { width: CARD.width, height: CARD.height },
  );
}
