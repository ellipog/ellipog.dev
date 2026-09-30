import { Arrow } from '@/components/arrow';
import manifest from '@/manifest.json';

type Studio = {
  name: string;
  label: string;
  url: string;
};

/**
 * Who presents this site: the studio's signature, and the last row on every page.
 *
 * **It is not the footer coming back, and the difference is the whole reason it can exist.** The footer
 * removed from this site said `ellipog.dev` and then repeated the two platform links and `Docs` — every
 * one of which the masthead's own nav already carries on every page. A row that repeats a row is
 * furniture. This says something no other part of the page says: who publishes it. That is the test, and
 * `check.mjs` asserts it directly, by requiring that the platform domains appear nowhere inside this row.
 *
 * **It sits below the sponsor band, which is a change worth naming.** The band was placed so it would not
 * read as part of the site's own colophon, and it used to be the last thing on the page because there was
 * nothing else. Now the site signs off in its own voice instead of ending on a paid row, which is the
 * better arrangement for both: the band is still plainly its own band, and it is no longer the last word.
 *
 * **The mark is the masthead's, not a second copy of it.** It renders the same `<span class="site-mark">`,
 * so the studio's mark appears at the top and the foot of every page and follows the theme in both places
 * from the one pair of files. On hover the row inverts like every other clickable surface here, and the
 * mark swaps to the other file for it — `global.css` has that reasoning, since the swap is the one part
 * of this that is easy to get wrong.
 *
 * **A `<footer>`, while the class `.footer` stays retired.** The element is the right one: it is the
 * page's footer and it becomes the `contentinfo` landmark, so a screen reader can jump to it. What was
 * wrong with the old row was its contents, not its semantics — and an `aria-label` names the landmark for
 * the same reason the sponsor band's does.
 *
 * A site with no `studio` in the manifest renders nothing at all. The manifest is the switch.
 */
export function Colophon() {
  const s = (manifest as { studio?: Studio }).studio;

  if (!s) return null;

  return (
    <footer className="colophon" aria-label={`${s.label} ${s.name}`}>
      <a className="colophon-link" href={s.url} target="_blank" rel="noreferrer noopener">
        {/* Same element, same class as the masthead's mark: one pair of files, two places, and the theme
            switch in `global.css` covers both without a second rule. */}
        <span className="site-mark" aria-hidden="true" />

        {/*
         * The wording is the site's usual construction for a labelled row: a micro-label in the same 11px
         * uppercase mono as `Sponsored` and `Elsewhere`, then the name in the prose face. Both come from
         * the manifest, so the sentence on the page and the sentence in the data cannot drift.
         */}
        <span className="colophon-label">
          <span className="label">{s.label}</span>
          {s.name}
        </span>

        {/*
         * The domain, pushed to the far end, which is the pattern the "Elsewhere" rows already use — a
         * name on the left, a handle on the right. Derived from the URL rather than typed beside it, so
         * there is one string to change and no way for the label and the destination to disagree.
         */}
        <span className="colophon-domain mono">
          {s.url.replace(/^https?:\/\//, '')} <Arrow />
        </span>
      </a>
    </footer>
  );
}
