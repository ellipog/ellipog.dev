import { Arrow } from '@/components/arrow';
import manifest from '@/manifest.json';

type Sponsor = {
  name: string;
  tagline: string;
  url: string;
  code: string;
  discount: string;
  logoLight: string;
  logoDark: string;
  logoWidth: number;
  logoHeight: number;
};

/**
 * The host, at the foot of every page.
 *
 * **Four things about this are deliberate, and three of them are not about design.**
 *
 * 1. **It says "Sponsored".** The label is in the band head, plainly, in the same place a section's
 *    label goes. An affiliate link that does not say so is a link that is pretending to be a
 *    recommendation, and a reader who finds out later is right to be annoyed. The discount code makes
 *    the arrangement obvious anyway — saying it up front costs nothing and is simply honest.
 * 2. **`rel="sponsored"`** on the link. That is the correct value for a paid or affiliate link, and it
 *    is what search engines expect; `noreferrer noopener` come along for the same reason they do on
 *    every outbound link here.
 * 3. **Both logos are in the DOM**, and CSS shows one. The site's theme is a `data-theme` attribute
 *    rather than `prefers-color-scheme`, so a `<picture media="...">` cannot switch on it — and a
 *    `<picture>` keyed on the system preference would show the wrong logo to anybody who had overridden
 *    the theme. Two `<img>` elements and a `display` toggle is the only version that respects the
 *    reader's actual choice.
 * 4. **`alt=""` on both.** The link's own text names BisectHosting, so an alt describing the image
 *    would make a screen reader say the name twice. It is a decoration beside the word, which is exactly
 *    what an empty alt means.
 *
 * `width` and `height` are set from the manifest because the SVGs declare no dimensions of their own —
 * only a `viewBox`. Without them the box collapses to nothing until the image loads and the whole page
 * shifts under the reader. The aspect ratio comes from the attributes, so the CSS can resize freely.
 *
 * **It is a `<section>` rather than a `<div>`**, so it appears in a screen reader's landmark list as a
 * region called "Sponsored" — the reader can skip it deliberately, which a plain div would not allow.
 */
export function SponsorBanner() {
  const s = (manifest as { sponsor?: Sponsor }).sponsor;

  // A site with no arrangement simply has no banner. The manifest is the switch.
  if (!s) return null;

  return (
    <section className="sponsor" aria-label="Sponsored">
      <div className="sponsor-head">
        <span className="label">Sponsored</span>
        <span className="sponsor-host mono">{s.name}</span>
      </div>

      <a
        className="sponsor-link"
        href={s.url}
        target="_blank"
        rel="sponsored noreferrer noopener"
      >
        {/* Which one shows is decided in CSS, by the ground colour. Both are harmless when hidden —
            they are small SVGs, and the browser caches them together. */}
        <img
          className="sponsor-logo sponsor-logo-light"
          src={s.logoLight}
          alt=""
          width={s.logoWidth}
          height={s.logoHeight}
        />
        <img
          className="sponsor-logo sponsor-logo-dark"
          src={s.logoDark}
          alt=""
          width={s.logoWidth}
          height={s.logoHeight}
        />

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
