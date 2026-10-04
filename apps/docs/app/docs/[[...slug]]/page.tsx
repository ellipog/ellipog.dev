import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { DocsContents } from '@/components/docs-contents';
import { DocsFooter } from '@/components/docs-footer';
import { TableOfContents } from '@/components/toc';
import { mdxComponents } from '@/components/mdx';
import { maturityOf, neighboursOf, prerequisiteFacts, sectionLabelOf, sectionOf, tocOf } from '@/lib/docs';
import { SITE, social } from '@/lib/metadata';
import { source } from '@/lib/source';

type Props = { params: Promise<{ slug?: string[] }> };

/**
 * One documentation page.
 *
 * Three columns: the section nav on the left (`app/docs/layout.tsx`), the prose here, and the contents
 * rail on the right. The right rail only appears when a page has more than a couple of headings —
 * a contents list for a three-line page is furniture.
 *
 * The contents come from `tocOf`, which reads the generated file. The reason is in `lib/docs.ts`:
 * Fumadocs computes a table of contents and then the page schema drops it, so there is nothing on
 * `page.data` to read.
 */
export default async function DocsPage({ params }: Props) {
  const { slug } = await params;
  const resolved = slug ?? [];
  const page = source.getPage(resolved);

  if (!page) notFound();

  const Mdx = page.data.body;
  const toc = tocOf(resolved);
  const isIndex = resolved.length === 0;
  const mod = sectionOf(resolved);
  const { prev, next } = neighboursOf(resolved);
  const facts = prerequisiteFacts(mod);
  const sectionLabel = sectionLabelOf(resolved);

  /*
   * What the search index is allowed to see, and what it should call it.
   *
   * `data-pagefind-body` is the boundary: Pagefind indexes this element and ignores everything outside
   * it, which is what keeps the rail, the masthead and the "On this page" list out of the results. The
   * alternative is not "index a bit more" -- a page with no such element is indexed *whole*, so the
   * rail's every link would be a search hit on every page.
   *
   * **Every attribute is built here rather than written into the JSX, because `mod` is optional.**
   * `sectionOf` is a lookup by first slug, so it returns nothing for `/docs/` and `/docs/glossary/` --
   * pages that are real, built, and would have thrown on `mod.id` during the build. The two keys are
   * also not always both present: a section's front page sits in no folder, so there is no `section`
   * to name, and `sectionLabelOf` returns nothing rather than an empty string so no attribute is
   * written at all. A result with no section renders a plain breadcrumb rather than a dangling one.
   */
  const searchMeta: Record<string, string> = {
    'data-pagefind-body': '',
    'data-pagefind-meta': mod ? 'mod[data-mod], section[data-section]' : 'section[data-section]',
  };
  if (mod) {
    searchMeta['data-pagefind-filter'] = `mod:${mod.id}`;
    searchMeta['data-mod'] = mod.name;
  }
  if (sectionLabel) searchMeta['data-section'] = sectionLabel;

  // The one frontmatter key a document may set for itself. Read from the file rather than from
  // `page.data` because the page schema strips unknown keys — see `maturityOf`.
  const maturity = maturityOf(resolved);

  // Depth 1 items are the page title and are not worth listing; two is the point where a rail earns
  // its width.
  const rail = toc.filter((item) => item.depth > 1);

  return (
    <div className={rail.length >= 2 ? 'docs-page docs-page-with-rail' : 'docs-page'}>
      <article className="prose" {...searchMeta}>
        <div className="page-head">
          <h1>{page.data.title}</h1>
          {maturity ? <span className={`maturity maturity-${maturity}`}>{maturity}</span> : null}
        </div>
        {/* The facts, before the prose. From the manifest, so they cannot drift. One chip each,
            because a reader is looking for a version rather than reading a sentence. */}
        {facts.length > 0 ? (
          <p className="prereq">
            {facts.map((fact) => (
              <span className="fact" key={fact}>
                {fact}
              </span>
            ))}
          </p>
        ) : null}
        {page.data.description ? <p className="lede">{page.data.description}</p> : null}

        {/* The contents list, on the docs index only. Rendered rather than authored, so it cannot
            list a page that does not exist or miss one that does. */}
        {isIndex ? <DocsContents /> : null}

        <Mdx components={mdxComponents} />

        <DocsFooter mod={mod} prev={prev} next={next} />
      </article>

      {rail.length >= 2 ? (
        <aside className="docs-rail">
          <TableOfContents items={rail} />
        </aside>
      ) : null}
    </div>
  );
}

/**
 * What goes after the site's name in the tab: `ellipog.dev | <this>`.
 *
 * **The root layout owns the half that never changes and this supplies the rest.** It is the only place
 * on the site that sets a title, and before it existed nothing did — the layout's `title.template` had
 * no `%s` to substitute anywhere, so every page rendered the bare `ellipog`, docs pages included. That is
 * the bug this fixes, and it is worth knowing because a dead template looks identical to a working one
 * from the outside: the fallback is a plausible title for every page at once.
 *
 * **A sub-page is qualified with its mod; a section front page is not.** `Design preview` on its own is a
 * tab that could belong to any site, so it becomes `Tasked — Design preview`. `Tasked documentation`
 * already names Tasked, so prefixing it would give `Tasked — Tasked documentation`.
 *
 * The test is whether the title *already contains* the mod's name, rather than whether the page is a
 * section index. That way a section front page retitled `Overview` picks up its mod automatically instead
 * of quietly losing it — the same trap `sectionOf` and `tocOf` each document once already in this app,
 * where a rule that happens to hold for today's five files stops holding the first time one is renamed.
 *
 * `—` rather than a second `|`: the pipe already marks the boundary between the site and the page, so a
 * repeat would read as another peer of the site's name rather than as a qualifier of the page's.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const resolved = slug ?? [];
  const page = source.getPage(resolved);

  // No page means `notFound()` is about to run; the 404 carries the site's own title, not this one.
  if (!page) return {};

  const title = page.data.title ?? resolved.at(-1) ?? 'Documentation';
  const mod = sectionOf(resolved);
  const qualified = !mod || title.toLowerCase().includes(mod.name.toLowerCase()) ? title : `${mod.name} — ${title}`;

  /*
   * The rest of the head — canonical URL, description, the social card — from `social()`, so the
   * docs pages cannot end up with different site facts from the home page. `page.url` is the
   * page's own address, which is the one thing here that must not be reconstructed by hand.
   *
   * The description is the page's frontmatter line — the same sentence the page renders as its
   * lede — so a search result and the page it points at say the same thing. A page with none falls
   * back to the site's own description rather than to an empty `og:description`, which is a card
   * with a title and nothing else.
   */
  return {
    title: qualified,
    ...social({
      title: qualified,
      description: page.data.description ?? SITE.description,
      path: page.url,
    }),
  };
}

/**
 * Every page, enumerated at build time.
 *
 * Required by `output: 'export'` — there is no server to resolve a path at request time, so the full
 * list has to exist before the HTML is written.
 */
export function generateStaticParams() {
  return source.generateParams();
}
