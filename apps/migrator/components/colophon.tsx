import { Arrow } from '@/components/arrow';
// The repo's manifest, two levels up: the studio sentence on the page and the
// sentence in the data cannot drift. (Docs copies this file into its own app
// via sync.mjs; the migrator reads the source directly — same data, no copy.)
import manifest from '../../../manifest.json';

type Studio = {
  name: string;
  label: string;
  url: string;
};

/**
 * Who engineers and maintains this site: the studio's signature, last on the page.
 *
 * Same construction as the docs colophon — a labelled row with the studio's own
 * mark pair (the eye over the A-frame, not the tab mark), the domain derived
 * from the URL, selected on hover by the corner brackets like every
 * destination here. A site with no `studio` in the manifest renders nothing.
 */
export function Colophon() {
  const s = (manifest as { studio?: Studio }).studio;

  if (!s) return null;

  return (
    <footer className="colophon" aria-label={`${s.label} ${s.name}`}>
      <a className="colophon-link" href={s.url} target="_blank" rel="noreferrer noopener">
        <span className="colophon-mark" aria-hidden="true" />
        <span className="colophon-label">
          <span className="label">{s.label}</span>
          {s.name}
        </span>
        <span className="colophon-domain mono">
          {s.url.replace(/^https?:\/\//, '')} <Arrow />
        </span>
      </a>
    </footer>
  );
}
