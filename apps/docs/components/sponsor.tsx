import { Arrow } from '@/components/arrow';
import { BrandMark } from '@/components/brand-mark';
import manifest from '@/manifest.json';

/** What both cells in the band have: a name, a line about it, and a mark. */
type Cell = {
  name: string;
  tagline: string;
  url: string;
  logo: string;
  logoWidth?: number;
  logoHeight?: number;
};

type Sponsor = Cell & {
  code: string;
  discount: string;
  badge?: { label: string; note?: string };
};

/**
 * A URL as a reader would write it: no scheme, no trailing slash.
 *
 * Derived from `url` rather than typed beside it, so the words on the page and the destination cannot
 * disagree — the rule the colophon's domain already follows.
 */
const bare = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');

/**
 * The band at the foot of every page: **two cells in one row**, the host at two parts and the tip jar at
 * one.
 *
 * **Why a row rather than two bands.** The host's cell and Ko-fi's are the same kind of fact — who this
 * page's reader is being sent to, and what the arrangement is — so stacking them as two full-width bands
 * would read as two sections that happen to sit together. Side by side they read as one row with two
 * answers, which is what they are. The ratio is measured rather than preferred: the host's cell needs
 * about 660px before `25% off with code mcstellar · Affiliate link` breaks, and Ko-fi's needs about 330,
 * which is where `2fr 1fr` and the 1000px collapse in `global.css` come from.
 *
 * **The two cells are separate landmarks, and that is the load-bearing part.** The host's section is
 * `aria-label="Sponsored: …"` and Ko-fi's is `aria-label="Support: …"`, because a region labelled
 * `Sponsored` that also contains an unpaid tip jar is exactly the misattribution the band's history is
 * made of — the `SPONSORED` label that sat above the colophon and made the studio look like part of the
 * sponsorship. A reader can now skip the paid row and not the other, or the other and not the paid one.
 *
 * **Nothing here is one link any more than one cell is.** Each cell is its own `<a>` and there is no
 * outer anchor to nest inside, so both are whole-cell destinations without the stretched-link trick the
 * catalog's cells need.
 *
 * A site with neither object in the manifest renders nothing at all — and with only one of them, the row
 * is one full-width cell, because `flex` grow fills whatever it is given. The manifest is the switch.
 */
export function SponsorBanner() {
  const s = (manifest as { sponsor?: Sponsor }).sponsor;
  const k = (manifest as { support?: Cell }).support;

  if (!s && !k) return null;

  return (
    <div className="band-row">
      {s ? <SponsorCell s={s} /> : null}
      {k ? <SupportCell k={k} /> : null}
    </div>
  );
}

/**
 * The host, and the first cell in the row.
 *
 * **One row, and everything it says is in that row.** It used to be two: a head strip carrying the host's
 * name and its `Partner` chip, then the link beneath it. The head was doing the job a section label does,
 * and it cost a full band of height to say the host's name a second time — the name is already in the
 * mark's own wordmark, which sits at the left of the row. So the strip is gone and the chip moved inside,
 * beside the tagline it qualifies.
 *
 * **The chip reads `Hosting partner` now rather than `Partner`, and the note beside it below says why.**
 * The rename is a wording change rather than part of the strip's removal — the two arrived together and
 * are separate decisions, which is worth knowing if one of them is ever revisited alone.
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
 *    outbound link here. **The cell beside this one deliberately does not carry it** — see `SupportCell`.
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
function SponsorCell({ s }: { s: Sponsor }) {
  return (
    /*
     * The `aria-label` carries the host's name, and it is now the only place the name is written as a
     * string — the visible naming is the mark's wordmark at the left of the row and the domain in the CTA.
     * That is the right division: a screen reader gets one clear label for the region, and the sighted
     * reader gets the host's own wordmark rather than the site's spelling of it.
     */
    <section className="sponsor" aria-label={`Sponsored: ${s.name}`}>
      <a className="sponsor-link" href={s.url} target="_blank" rel="sponsored noreferrer noopener">
        <BrandMark entry={s} />

        <span className="sponsor-copy">
          {/*
           * The tagline carries the chip, because the chip qualifies *this host* and the tagline is the
           * line that describes it. It used to sit in the head strip opposite the host's name, which is
           * where a chip beside a name conventionally goes — and the name went with the strip, so the chip
           * came here to stay next to the thing it is about.
           *
           * **The wording is `Hosting partner`, and two other candidates were rejected on purpose.** It was
           * `Partner` alone, which stated that there is an arrangement without saying what the arrangement
           * is about: the tagline beside it already names the host's business, so the chip's job is to name
           * the *relationship*, and "partner of what?" is the question a two-word chip can answer and a
           * one-word one cannot.
           *
           * `Infrastructure` names a category this is not. BisectHosting is somewhere a server can be run,
           * which is neither what the chip is doing in this row nor a claim the arrangement supports — and
           * a label that makes the arrangement sound larger than it is, is the same fault as one that
           * makes it sound better than it is.
           *
           * `Verified`/`Verified partner` is the one to keep out entirely. BisectHosting run a
           * `Partner Program` and separately an `Affiliate Program`, and neither of their pages uses the
           * word *verified* — so it would assert a status the host does not confer. A trust mark that
           * overstates is worse than no mark, because it is the one kind of claim a reader is entitled to
           * take literally.
           *
           * The label lives in the manifest so the wording is one edit, and `check.mjs` asserts what
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
                stacked labels read as one heading over both rows, which put the studio's name under a paid
                heading. Here it is a property of this offer, which is what it actually is. */}
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

/**
 * The tip jar, and the second cell in the row.
 *
 * **It is not a sponsorship, and everything about it follows from that.** No `rel="sponsored"` — this
 * link is not paid for and marking it as though it were would be a false declaration to exactly the
 * crawler the host's `rel` is there for. No `Affiliate link` note, because there is no affiliate
 * arrangement. No chip, because a chip names a relationship and this one has none to name: the tagline
 * says what the link is in words, which is the job the host's `Hosting partner` chip does for its cell.
 * And its **own** landmark rather than the host's — see `SponsorBanner` for why that is the part that
 * cannot be got wrong.
 *
 * **The handle sits under the tagline rather than at the right-hand edge**, which is where the host's
 * domain goes. At one part of the row there is not room for a right-aligned CTA and a tagline beside a
 * wordmark, and the URL is the whole of this cell's second line rather than a detail appended to an
 * offer — so it is the offer line. It is set in mono and faint, because it is an identifier rather
 * than prose: the same treatment `.link-handle` and `.colophon-domain` get.
 *
 * **The mark is drawn smaller than the host's — 124x34 against 123x41 — and that is optical rather than
 * arbitrary.** The host's mark is a hexagon with a two-line wordmark inside it, so its ink fills about
 * half its box; Ko-fi's is one line of fat lettering that fills nearly all of it, and at the same 41px
 * the tip jar out-weighed the cell it was introducing. The size lives in the manifest with the mark, so
 * there is one place to change it.
 *
 * **`target="_blank"` and `rel="noreferrer noopener"`**, like every other outbound link on the site. The
 * reader leaves this page either way; the pair only says they come back to it.
 */
function SupportCell({ k }: { k: Cell }) {
  return (
    <section className="support" aria-label={`Support: ${k.name}`}>
      <a className="support-link" href={k.url} target="_blank" rel="noreferrer noopener">
        {/* The mark is `aria-hidden`, so the cell is named by its own words: the tagline and the handle.
            The section's `aria-label` names it for a screen reader's landmark list, which is where a
            reader decides whether to skip this row. */}
        <BrandMark entry={k} />

        <span className="support-copy">
          <span className="support-tagline">{k.tagline}</span>
          <span className="support-offer">{bare(k.url)}</span>
        </span>
      </a>
    </section>
  );
}
