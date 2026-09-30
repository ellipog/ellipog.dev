import { Arrow } from '@/components/arrow';
import { BrandMark } from '@/components/brand-mark';
import manifest from '@/manifest.json';

type Sponsor = {
  name: string;
  tagline: string;
  url: string;
  code: string;
  discount: string;
  badge?: { label: string; note?: string };
};

/**
 * The host, at the foot of every page.
 *
 * **One row, and everything it says is in that row.** It used to be two: a head strip carrying the host's
 * name and its `Partner` chip, then the link beneath it. The head was doing the job a section label does,
 * and it cost a full band of height to say the host's name a second time — the name is already in the
 * mark's own wordmark, which sits at the left of the row. So the strip is gone and the chip moved inside,
 * beside the tagline it qualifies. The band is roughly half the height it was.
 *
 * **Four things about this are deliberate, and three of them are not about design.**
 *
 * 1. **It says it is a paid link — beside the offer, not above the band.** It used to be an uppercase
 *    `SPONSORED` label in the band head, and that placement was the bug: it sat directly above the
 *    colophon's own `ENGINEERED & MAINTAINED BY` strip, and two small uppercase labels stacked at the foot
 *    of a page read as one heading over both rows — which put the studio's name under a paid heading. A
 *    disclosure that misattributes itself is not much of a disclosure, so it moved into the row it
 *    describes. The section still carries `aria-label="Sponsored: <host>"` and the link still carries
 *    `rel="sponsored"`, so it is declared to a screen reader and to a crawler either way.
 * 2. **`rel="sponsored"`** on the link. That is the correct value for a paid or affiliate link, and it is
 *    what search engines expect; `noreferrer noopener` come along for the same reason they do on every
 *    outbound link here.
 * 3. **The mark is inlined by `<BrandMark>`, not loaded as an `<img>`.** It takes its ink from
 *    `currentColor` and its knockouts from `var(--icon-ground)`, neither of which an `<img>` can see.
 *    `components/brand-mark.tsx` has the full reason; the short version is that an image would be black on
 *    a dark page with its hexagon filled in, and would look fine in light mode.
 * 4. **`alt=""` is not needed on the mark** because it is an `<svg aria-hidden>`. The host is named in
 *    text twice over regardless — the CTA carries its domain, and the section's own `aria-label` names it
 *    — so a screen reader does not need the mark to know whose band this is. It used to be `alt=""` on two
 *    `<img>`s for the same reason.
 *
 * **It is a `<section>` rather than a `<div>`**, so it appears in a screen reader's landmark list as a
 * region called "Sponsored" and the reader can skip it deliberately, which a plain div would not allow.
 */
export function SponsorBanner() {
  const s = (manifest as { sponsor?: Sponsor }).sponsor;

  // A site with no arrangement simply has no banner. The manifest is the switch.
  if (!s) return null;

  return (
    /*
     * The `aria-label` carries the host's name, and it is now the only place the name is written as a
     * string — the visible naming is the mark's wordmark at the left of the row and the domain in the CTA.
     * That is the right division: a screen reader gets one clear label for the region, and the sighted
     * reader gets the host's own wordmark rather than the site's spelling of it.
     */
    <section className="sponsor" aria-label={`Sponsored: ${s.name}`}>
      <a className="sponsor-link" href={s.url} target="_blank" rel="sponsored noreferrer noopener">
        <BrandMark height={41} />

        <span className="sponsor-copy">
          {/*
           * The tagline carries the chip, because the chip qualifies *this host* and the tagline is the
           * line that describes it. It used to sit in the head strip opposite the host's name, which is
           * where a chip beside a name conventionally goes — and the name went with the strip, so the chip
           * came here to stay next to the thing it is about.
           *
           * **The wording is deliberately not "Verified".** BisectHosting run a `Partner Program` and
           * separately an `Affiliate Program`, and neither of their pages uses the word *verified* — so it
           * would be asserting a status the host does not confer. `Partner` is their own term and it is
           * true. The label lives in the manifest so the wording is one edit, and `check.mjs` asserts what
           * renders matches what is written there.
           *
           * `title` rather than a tooltip component: this is a decoration nobody has to interact with, and
           * the native tooltip costs nothing. The reader who cares gets the full sentence.
           *
           * The tick is `aria-hidden` because the word beside it already says what the mark means;
           * announcing it too would make a screen reader read the same thing twice. That mirrors `alt=""`
           * on the brand logos.
           */}
          <span className="sponsor-tagline">
            {s.tagline}
            {s.badge ? (
              <span className="sponsor-badge" title={s.badge.note}>
                <span aria-hidden="true">✓</span>
                {s.badge.label}
              </span>
            ) : null}
          </span>

          <span className="sponsor-offer">
            {s.discount} with code{' '}
            {/* A code is an identifier, so it is monospace and set apart — the same rule that makes a
                path or a mod id monospace everywhere else on this site. It also makes it obviously
                copyable rather than part of the sentence. */}
            <code className="sponsor-code">{s.code}</code>
            {/* The disclosure, in the row it describes. It was an uppercase `SPONSORED` label in the band
                head, directly above the colophon's own `ENGINEERED & MAINTAINED BY` strip — and two
                stacked labels read as one heading over both rows, which put the studio's name under a
                paid heading. Here it is a property of this offer, which is what it actually is. */}
            <span className="sponsor-disclosure">Affiliate link</span>
          </span>
        </span>

        <span className="sponsor-cta">
          {s.url.replace(/^https?:\/\//, '').replace(/\/mcstellar$/, '')} <Arrow />
        </span>
      </a>
    </section>
  );
}
