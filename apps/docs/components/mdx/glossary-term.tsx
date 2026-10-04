import glossary from '@/glossary.json';

type Entry = { id: string; term: string; definition: string; see?: string[] };

const TERMS = (glossary as { terms: Entry[] }).terms;
const BY_ID = new Map(TERMS.map((entry) => [entry.id, entry]));

/**
 * A glossary term, with its definition on hover.
 *
 * Written in a document as `[[quest]]` and rewritten into this component by `scripts/sync.mjs`, which
 * also fails the build if the term is not defined -- so the "not found" branch below is unreachable
 * from a page and exists only so a missing definition degrades to plain text instead of throwing.
 *
 * **The definition is always in the DOM, and is revealed rather than created.** That is what makes it
 * work for a screen reader: `aria-describedby` can only point at something that exists, so a tooltip
 * injected on hover would be announced as nothing at all. The default styling hides it the way
 * `.sr-only` does — clipped, not `display: none` — and hover or focus moves it into place.
 *
 * `tabIndex={0}` so the definition is reachable by keyboard. Without it the only way to a definition
 * would be a mouse, which is the usual reason tooltips are useless.
 */
/**
 * How the term reads *inside a sentence*.
 *
 * **The entry's own `term` is a heading, and this is not.** `Quest`, `Canvas` and `Chapter group` are
 * written that way in the glossary list and in the tooltip's title, where they are the name of an
 * entry and a capital is right. Inline, in the middle of a sentence, the capital made the prose
 * disagree with itself: the same page said "a pannable Canvas" and, two paragraphs later, "a pannable
 * canvas". The lowercase form was already winning everywhere it was not a glossary term.
 *
 * It is derived from the `id` rather than stored, so there is nothing to keep in step. Every entry's
 * id is required to be lowercase letters, digits and hyphens -- both glossary sources state that as
 * the rule -- so `chapter-group` becomes `chapter group`, which is the form the prose already used.
 * `term` remains the fallback for the case the contract does not cover.
 */
function inlineForm(entry: Entry): string {
  return entry.id ? entry.id.replace(/-/g, ' ') : entry.term;
}

export function GlossaryTerm({ term, children }: { term: string; children?: React.ReactNode }) {
  const entry = BY_ID.get(term) as Entry | undefined;
  if (!entry) return <>{children ?? term}</>;

  const id = `glossary-${entry.id}`;

  return (
    <span className="term" tabIndex={0} aria-describedby={id}>
      {children ?? inlineForm(entry)}
      <span className="term-def" id={id}>
        <span className="term-def-name">{entry.term}</span>
        {entry.definition}
        {entry.see?.length ? (
          <span className="term-def-see">
            See also{' '}
            {entry.see.map((other, i) => (
              <span key={other}>
                {i > 0 ? ', ' : ''}
                <a href={`/docs/glossary/#glossary-${other}`}>{BY_ID.get(other)?.term ?? other}</a>
              </span>
            ))}
          </span>
        ) : null}
      </span>
    </span>
  );
}
