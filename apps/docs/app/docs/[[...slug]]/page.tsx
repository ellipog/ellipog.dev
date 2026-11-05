import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Arrow } from '@/components/arrow';
import { DocsContents } from '@/components/docs-contents';
import { DocsFooter } from '@/components/docs-footer';
import { TableOfContents } from '@/components/toc';
import { VersionSelector } from '@/components/version-selector';
import { mdxComponents } from '@/components/mdx';
import {
  canonicalSlugsOf,
  descriptionOf,
  maturityOf,
  neighboursOf,
  prerequisiteFacts,
  sectionLabelOf,
  sectionOf,
  tocOf,
  versionLabelOf,
  versionOf,
} from '@/lib/docs';
import { SITE, absoluteUrl, plainTitle, social } from '@/lib/metadata';
import { source } from '@/lib/source';

type Props = { params: Promise<{ slug?: string[] }> };

/**
 * A page's name, plain text, qualified with its game version on an older manual's pages.
 *
 * **The version is what stops two manuals sharing every title.** `/docs/tenet/authoring/quests/` and
 * `/docs/tenet/1.21.1/authoring/quests/` are both `Quests`, and two dozen pairs of identical titles is
 * what a crawler reads as duplicate pages and what a reader cannot tell apart in a result list. The
 * default version's pages stay unqualified: they are the manual a search should land on. The
 * description carries the same version (`descriptionOf`), from the same helper. The breadcrumb uses
 * this form; the `<title>` uses `headTitleOf`, which builds on it.
 */
function versionedTitleOf(slugs: string[], title: string): string {
  const version = versionLabelOf(slugs);
  const plain = plainTitle(title);
  return version ? `${plain} (${version})` : plain;
}

/**
 * The `<title>`'s page half.
 *
 * **A front page says what game it is for.** `Tenet` is also a film, and `Tenet documentation` alone
 * gives a search engine nothing that ties it to Minecraft -- and the front pages are the ones a search
 * for a mod's name lands on. So the docs index reads `Documentation for Minecraft mods`, a section's front
 * page `Tenet documentation for Minecraft`, and an older manual's `Tenet documentation for Minecraft
 * 1.21.1`. Only the head changes; the page's own heading is still `Tenet documentation`. Every other page
 * is already qualified with its mod, and the masthead above it says the rest.
 */
function headTitleOf(slugs: string[], title: string): string {
  const plain = plainTitle(title);
  if (slugs.length === 0) return `${plain} for Minecraft mods`;
  const version = versionLabelOf(slugs);
  const front = sectionOf(slugs) !== undefined && slugs.length === (version ? 2 : 1);
  if (front) return version ? `${plain} for Minecraft ${version}` : `${plain} for Minecraft`;
  return versionedTitleOf(slugs, title);
}

/**
 * A title as the page's heading shows it: inline code rendered as code.
 *
 * A source document may title itself ``JSON `clickEvent` research``. The head drops the backticks
 * (`plainTitle`), and the heading should not show them either -- they are markdown, and the body's own
 * inline code is already set as `<code>` by the MDX compiler. The title arrives as a plain string from
 * frontmatter, so nothing else would render them.
 */
function TitleText({ title }: { title: string }) {
  const parts = title.split(/`([^`]+)`/);
  return <>{parts.map((part, i) => (i % 2 === 1 ? <code key={i}>{part}</code> : part))}</>;
}

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
  const facts = prerequisiteFacts(mod, versionOf(resolved));
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

  /*
   * The trail a crawler reads: Home → Documentation → … → this page.
   *
   * Intermediate names come from the pages themselves (`source.getPage` on each prefix), so a
   * renamed section renames its crumb by construction rather than by remembering. URLs are the
   * canonicals via `absoluteUrl`, which is what keeps the trail and the `<link rel="canonical">`
   * from naming two identities for one page. Deliberately no richer per-page schema: a
   * `SoftwareApplication` or `TechArticle` node without ratings, offers or dates would be marking
   * up claims nobody made — the same judgement that keeps the sponsor's badge from saying
   * "verified".
   *
   * **A prefix with no page of its own is left out of the trail.** Tenet's `authoring/` folder has
   * no front page, so `/docs/tenet/authoring/` is a 404; a crumb pointing there is a step a crawler
   * follows to nothing, and its name was the bare slug `authoring`. Skipping it leaves a shorter
   * trail of real pages, which is what a breadcrumb is.
   *
   * An older manual's front page is named with its version (`Tenet documentation (1.21.1)`), which
   * is what stops it repeating the crumb before it. The steps after it are not: the trail has
   * already said which manual they are in, so `Conditions (1.21.1)` would say it twice.
   */
  const crumbs = [
    { name: 'Home', url: absoluteUrl('/') },
    { name: 'Documentation', url: absoluteUrl('/docs') },
    ...resolved.flatMap((_, i) => {
      const prefix = resolved.slice(0, i + 1);
      const target = source.getPage(prefix);
      if (!target) return [];
      const title = target.data.title ?? prefix[i];
      const isVersionRoot = prefix.length === 2 && versionOf(prefix) !== undefined;
      return [
        {
          name: isVersionRoot ? versionedTitleOf(prefix, title) : plainTitle(title),
          url: absoluteUrl(`/docs/${prefix.join('/')}`),
        },
      ];
    }),
  ];
  const BREADCRUMBS = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      item: crumb.url,
    })),
  };

  return (
    <div className={rail.length >= 2 ? 'docs-page docs-page-with-rail' : 'docs-page'}>
      {/* Parsed back out of the built HTML by `check.mjs`, like the home page's own block: a
          malformed trail is invisible in a browser. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMBS) }} />
      {/* The way out to the browser migrator, on Tenet pages only. It lives here
          rather than in any document because synced content is wiped by sync.mjs,
          and outside the article so the search index never sees it. */}
      {mod?.id === 'tenet' ? (
        <a
          className="migrator-band"
          href="https://tenet.ellipog.dev/"
          target="_blank"
          rel="noreferrer noopener"
          aria-label="FTB Quests to Tenet migrator (opens in a new tab)"
        >
          <span className="label">FTB Quests → Tenet</span>
          <span className="migrator-go">
            Have an FTB quest book? Convert it with one button <Arrow />
          </span>
        </a>
      ) : null}
      <article className="prose" {...searchMeta}>
        <div className="page-head">
          <h1>
            <TitleText title={page.data.title} />
          </h1>
          {maturity ? <span className={`maturity maturity-${maturity}`}>{maturity}</span> : null}
        </div>
        {/* The facts, before the prose. From the manifest, so they cannot drift. One chip each,
            because a reader is looking for a version rather than reading a sentence. The version
            switcher sits beside them, so the manual being read always names its game version twice:
            once as a fact, once as the selected switch position. */}
        {facts.length > 0 ? (
          <p className="prereq">
            {facts.map((fact) => (
              <span className="fact" key={fact}>
                {fact}
              </span>
            ))}
          </p>
        ) : null}
        <VersionSelector slugs={resolved} />
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
 * tab that could belong to any site, so it becomes `Tenet — Design preview`. `Tenet documentation`
 * already names Tenet, so prefixing it would give `Tenet — Tenet documentation`.
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

  const title = headTitleOf(resolved, page.data.title ?? resolved.at(-1) ?? 'Documentation');
  const mod = sectionOf(resolved);
  const qualified = !mod || title.toLowerCase().includes(mod.name.toLowerCase()) ? title : `${mod.name} — ${title}`;

  /*
   * The rest of the head — canonical URL, description, the social card — from `social()`, so the
   * docs pages cannot end up with different site facts from the home page. `page.url` is the
   * page's own address, which is the one thing here that must not be reconstructed by hand.
   *
   * The description is the page's own sentence — frontmatter when the author wrote one, an excerpt
   * of the opening prose otherwise (see `descriptionOf`) — so a search result and the page it
   * points at say the same thing. Only a page with no readable prose at all falls back to the
   * site's description, rather than every undescribed page sharing it.
   */
  /*
   * The canonical: the page's own address, unless it is an older manual's word-for-word copy of the
   * latest page, in which case the latest (`canonicalSlugsOf` has the rule, and why it is "identical"
   * rather than "similar"). The copy keeps its own title and description -- it is still a page a reader
   * can be on -- and leaves the sitemap, which lists canonical pages only.
   */
  const canonical = source.getPage(canonicalSlugsOf(resolved)) ?? page;

  return {
    title: qualified,
    ...social({
      title: qualified,
      description: descriptionOf(resolved) ?? SITE.description,
      path: canonical.url,
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
