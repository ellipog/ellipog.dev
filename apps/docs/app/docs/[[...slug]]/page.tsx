import { notFound } from 'next/navigation';

import { DocsContents } from '@/components/docs-contents';
import { DocsFooter } from '@/components/docs-footer';
import { TableOfContents } from '@/components/toc';
import { mdxComponents } from '@/components/mdx';
import { neighboursOf, sectionOf, tocOf } from '@/lib/docs';
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

  // Depth 1 items are the page title and are not worth listing; two is the point where a rail earns
  // its width.
  const rail = toc.filter((item) => item.depth > 1);

  return (
    <div className={rail.length >= 2 ? 'docs-page docs-page-with-rail' : 'docs-page'}>
      <article className="prose">
        <h1>{page.data.title}</h1>
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
 * Every page, enumerated at build time.
 *
 * Required by `output: 'export'` — there is no server to resolve a path at request time, so the full
 * list has to exist before the HTML is written.
 */
export function generateStaticParams() {
  return source.generateParams();
}
