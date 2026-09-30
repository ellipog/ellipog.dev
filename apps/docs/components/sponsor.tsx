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
 * **Four things about this are deliberate, and three of them are not about design.**
 *
 * 1. **It says "Sponsored".** The label is in the band head, plainly, in the same place a section's label
 *    goes. An affiliate link that does not say so is a link pretending to be a recommendation, and a
 *    reader who finds out later is right to be annoyed. The discount code makes the arrangement obvious
 *    anyway — saying it up front costs nothing and is simply honest.
 * 2. **`rel="sponsored"`** on the link. That is the correct value for a paid or affiliate link, and it is
 *    what search engines expect; `noreferrer noopener` come along for the same reason they do on every
 *    outbound link here.
 * 3. **The mark is inlined by `<BrandMark>`, not loaded as an `<img>`.** It takes its ink from
 *    `currentColor` and its knockouts from `var(--icon-ground)`, neither of which an `<img>` can see.
 *    `components/brand-mark.tsx` has the full reason; the short version is that an image would be black on
 *    a dark page with its hexagon filled in, and would look fine in light mode.
 * 4. **`alt=""` is not needed on the mark** because it is an `<svg aria-hidden>`. The host's name is in
 *    the band head as text, so a screen reader gets it once. It used to be `alt=""` on two `<img>`s for
 *    the same reason.
 *
 * The name appears twice — once in the head and once inside the mark's own wordmark — and that is
 * intended. The head is a label; the mark is the host's logo, which happens to contain its name.
 *
 * **It is a `<section>` rather than a `<div>`**, so it appears in a screen reader's landmark list as a
 * region called "Sponsored" and the reader can skip it deliberately, which a plain div would not allow.
 */
export function SponsorBanner() {
  const s = (manifest as { sponsor?: Sponsor }).sponsor;

  // A site with no arrangement simply has no banner. The manifest is the switch.
  if (!s) return null;

  return (
    <section className="sponsor" aria-label="Sponsored">
      <div className="sponsor-head">
        <span className="label">Sponsored</span>
        <span className="sponsor-host mono">
          {s.name}
          {/*
           * A small trust mark beside the name it belongs to, which is where such a mark conventionally
           * goes and the one place in the band that is already a label strip.
           *
           * **The wording is deliberately not "Verified".** BisectHosting run a `Partner Program` and
           * separately an `Affiliate Program`, and neither of their pages uses the word *verified* —
           * so it would be asserting a status the host does not confer. `Partner` is their own term and
           * it is true. The label lives in the manifest so the wording is one edit, and `check.mjs`
           * asserts what renders matches what is written there.
           *
           * `title` rather than a tooltip component: this is a decoration nobody has to interact with,
           * and the native tooltip costs nothing. The reader who cares gets the full sentence.
           *
           * The tick is `aria-hidden` because the word beside it already says what the mark means;
           * announcing it too would make a screen reader read the same thing twice. That mirrors
           * `alt=""` on the brand logos.
           */}
          {s.badge ? (
            <span className="sponsor-badge" title={s.badge.note}>
              <span aria-hidden="true">✓</span>
              {s.badge.label}
            </span>
          ) : null}
        </span>
      </div>

      <a className="sponsor-link" href={s.url} target="_blank" rel="sponsored noreferrer noopener">
        <BrandMark height={41} />

        <span className="sponsor-copy">
          <span className="sponsor-tagline">{s.tagline}</span>
          <span className="sponsor-offer">
            {s.discount} with code{' '}
            {/* A code is an identifier, so it is monospace and set apart — the same rule that makes a
                path or a mod id monospace everywhere else on this site. It also makes it obviously
                copyable rather than part of the sentence. */}
            <code className="sponsor-code">{s.code}</code>
          </span>
        </span>

        <span className="sponsor-cta">
          {s.url.replace(/^https?:\/\//, '').replace(/\/mcstellar$/, '')} <Arrow />
        </span>
      </a>
    </section>
  );
}
