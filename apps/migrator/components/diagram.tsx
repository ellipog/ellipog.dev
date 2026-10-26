import { Fragment } from 'react';

/**
 * A figure drawn in box-drawing characters: a file tree, or two of them with the conversion between.
 *
 * Each line is plain text. The run of tree glyphs at its start is set faint, a line that is nothing but a
 * path (a tree's root) is set in ink, and the rest is the page's muted grey -- so the structure recedes
 * and the names carry the reading. It is text rather than an image so it scales, selects and copies like
 * the paths it shows.
 */
export function Diagram({ lines }: { lines: readonly string[] }) {
  return (
    <pre className="diagram">
      {lines.map((line, n) => {
        const [, glyphs = '', rest = ''] = /^([\s├└│▼─┬┐┘]*)(.*)$/u.exec(line) ?? [];
        return (
          <Fragment key={n}>
            {glyphs ? <i>{glyphs}</i> : null}
            {glyphs ? rest : <b>{rest}</b>}
            {'\n'}
          </Fragment>
        );
      })}
    </pre>
  );
}

/** What goes in and what comes out: an FTB Quests book on top, the Tenet tree it becomes underneath. */
export const CONVERSION = [
  'config/ftbquests/quests/',
  '├─ data.snbt',
  '├─ chapter_groups.snbt',
  '├─ chapters/*.snbt',
  '├─ reward_tables/*.snbt',
  '└─ lang/*.snbt',
  '   │',
  '   │  parse · remap · transform · validate',
  '   ▼  here, in a worker; nothing is uploaded',
  'config/tenet/quests/',
  '├─ <group>/group.json',
  '├─ <group>/<chapter>/chapter.json',
  '├─ <group>/<chapter>/<quest>.json',
  '├─ reward_tables/*.json',
  '├─ lang/<locale>.json',
  '└─ _migrator/report.md · ids.json',
] as const;
