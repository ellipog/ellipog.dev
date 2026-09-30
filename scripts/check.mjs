/**
 * Does the built site actually contain what it is supposed to?
 *
 * A file rather than `node -e`: the shell has mangled the quotes in every inline script tried this
 * session, and a check that cannot run is worse than no check. This one is worth keeping, unlike the
 * throwaway probes -- it asserts the handful of things that have gone wrong at least once.
 *
 * Run: bun scripts/check.mjs      (or node scripts/check.mjs)
 *
 * Reads `apps/docs/out/`, which is the artifact. The dev server is not a witness: `bun run build`
 * wipes and regenerates `apps/docs/content/` while `bun run dev` watches that same directory, so a
 * running dev server can hold a compile from before a change.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const OUT = 'apps/docs/out';
const CHUNKS = `${OUT}/_next/static/chunks`;

/*
 * The two source files, read once and near the top.
 *
 * **Declared HERE rather than beside the sections that first wanted them, and that is the same lesson
 * twice.** Both `allCss` and this were originally declared further down, next to where they were first
 * used. Every section after them worked; then a new section was added *above* one of them and threw
 * `Cannot access 'X' before initialization` — a temporal-dead-zone error, because `const` is not hoisted
 * the way `function` is. A reader adds sections in whatever order makes sense, so a declaration's
 * position must not depend on which section happens to come first.
 */
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const stats = JSON.parse(readFileSync('apps/docs/stats.json', 'utf8'));

/*
 * THE SHARED READS, ALL OF THEM, AT THE TOP.
 *
 * This file has now thrown `Cannot access 'X' before initialization` three times — `allCss`, then
 * `manifest`, then `home` — and every time the cause was identical: a new section was added *above* an
 * existing `const`. A `const` is not hoisted the way a `function` is, so anything shared between sections
 * has to be declared before the first of them, and "before the first of them" changes every time
 * somebody adds a section.
 *
 * Twice I wrote a comment explaining the trap and left the declaration where it was. That was the wrong
 * fix both times: a comment telling a future reader to be careful is weaker than an arrangement where
 * care is not needed. Every cross-section read now lives here, where no section can be added above it.
 *
 * `read` and `show` are function *declarations*, so they are hoisted and callable from this point.
 */
const home = read(`${OUT}/index.html`);
const docsPage = read(`${OUT}/docs/tasked/index.html`);

const failures = [];
const notes = [];

function check(name, ok, detail = '') {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
}

/** The `<aside class="sidebar">` contents, so an assertion cannot accidentally match the masthead. */
function sidebar(html) {
  const open = html.indexOf('<aside class="sidebar"');
  if (open === -1) return null;
  const close = html.indexOf('</aside>', open);
  return html.slice(open, close === -1 ? undefined : close);
}

function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

/**
 * The page with its `<script>` payloads stripped.
 *
 * **Next serialises its entire render tree into a `<script>` tag**, so every class name and every string
 * on a page appears twice: once as markup, once as JSON. Counting occurrences without removing that first
 * gives roughly double the truth, and — worse — an assertion can pass on the strength of a string that
 * exists only in the payload and never renders.
 *
 * This has now bitten twice. `no unresolved [[...]]` failed on every page ever built because a JSON array
 * of arrays contains `[[]]`... contains `[[`, so a plain `includes` was true everywhere. And the mod-mark
 * placeholder count read 2 for a single placeholder.
 *
 * A function *declaration*, not a `const`, so it is hoisted and callable from any section regardless of
 * where it is written — the ordering trap that produced three `Cannot access 'X' before initialization`
 * failures earlier in this file.
 */
function withoutScripts(html) {
  return html.replace(/<script[\s\S]*?<\/script>/g, '');
}

function headings(html) {
  const open = html.indexOf('<article');
  if (open === -1) return null;
  const close = html.indexOf('</article>', open);
  const scope = html.slice(open, close === -1 ? undefined : close);
  return [...scope.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/g)].map((m) => ({
    level: Number(m[1]),
    text: m[2]
      .replace(/<[^>]+>/g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
  }));
}

console.log('\n== the build exists ==');
for (const p of [
  `${OUT}/index.html`,
  `${OUT}/docs/index.html`,
  `${OUT}/docs/tasked/index.html`,
  `${OUT}/docs/armature/index.html`,
  `${OUT}/404.html`,
]) {
  check(p.replace(`${OUT}/`, ''), existsSync(p));
}

console.log('\n== the title renders exactly once ==');
for (const id of ['tasked', 'armature']) {
  const html = read(`${OUT}/docs/${id}/index.html`);
  if (!html) {
    check(`${id} page`, false, 'missing');
    continue;
  }
  const h = headings(html) ?? [];
  const h1s = h.filter((x) => x.level === 1);
  check(
    `${id}: one h1`,
    h1s.length === 1,
    h1s.length === 1 ? JSON.stringify(h1s[0].text) : `${h1s.length} found: ${JSON.stringify(h1s.map((x) => x.text))}`,
  );
  // The bug this guards: the README's own "# Tasked" rendering beneath the template's title.
  const duplicated = h1s.length > 1 && h1s[0].text === h1s[1].text;
  check(`${id}: title not repeated`, !duplicated);
}

console.log('\n== the sidebar is content only ==');
for (const id of ['tasked', 'armature']) {
  const html = read(`${OUT}/docs/${id}/index.html`);
  if (!html) continue;

  // Scoped to the aside. Checking the whole document would match the masthead's own `Docs` nav cell,
  // which is wanted -- it is the link back to the docs index, and the reason the sidebar no longer
  // needs one of its own.
  const rail = sidebar(html);
  check(`${id}: sidebar found`, rail !== null);
  if (!rail) continue;

  check(`${id}: no home link in the rail`, !rail.includes('sidebar-home'));
  check(`${id}: no "Docs" heading in the rail`, !/>Docs</.test(rail));
  check(`${id}: sections present`, rail.includes('sidebar-section'));
  check(`${id}: lists both mods`, rail.includes('>Tasked<') && rail.includes('>Armature<'));
  // The masthead keeps its Docs link -- removing that was not the request.
  check(`${id}: masthead still links to the docs index`, html.includes('<a href="/docs/">Docs</a>'));
}

console.log('\n== the scrollbar is drawn, not inherited ==');
const cssFiles = existsSync(CHUNKS) ? readdirSync(CHUNKS).filter((f) => f.endsWith('.css')) : [];
const css = cssFiles.map((f) => readFileSync(`${CHUNKS}/${f}`, 'utf8')).join('\n');

/*
 * The concatenated stylesheet, under the name the later sections use — declared HERE rather than where
 * it is first wanted.
 *
 * It was originally declared further down, beside the docs-rail assertions, and every section that came
 * *after* it worked. Then the glossary section was added *above* it and threw
 * `Cannot access 'allCss' before initialization` — a temporal-dead-zone error, because `const` is not
 * hoisted the way `function` is. One declaration, at the top, is the fix; a second one further down
 * would shadow it and throw on the duplicate instead.
 */
const allCss = css;

/** The rule a failure is about, so a failure says what is there instead of only what is not. */
function show(needle) {
  const at = allCss.indexOf(needle);
  return at === -1 ? `"${needle}" absent` : allCss.slice(at, at + 120);
}

check('a stylesheet exists', css.length > 0, `${cssFiles.length} file(s)`);
check('::-webkit-scrollbar sized', /::-webkit-scrollbar\{[^}]*width:11px/.test(css));
check('::-webkit-scrollbar-button suppressed', /::-webkit-scrollbar-button\{[^}]*display:none/.test(css));
check('track has a hairline', /::-webkit-scrollbar-track\{[^}]*border-left:1px solid/.test(css));
check('gutter reserved', css.includes('scrollbar-gutter:stable'));
// The fix: the standard properties must be inside the Gecko guard, or Chromium discards the WebKit
// rules above and draws its own bar.
const guard = css.match(/@supports\s*\(\(?-moz-appearance:none\)?\)\{([^@]*)\}/);
check('standard props are Gecko-guarded', Boolean(guard) && guard[1].includes('scrollbar-color'));
check(
  'standard props NOT loose on html',
  !/html\{[^}]*scrollbar-color/.test(css.replace(/@supports\s*\(\(?-moz-appearance:none\)?\)\{[^}]*\}/g, '')),
);

console.log('\n== the documentation elements ==');
/*
 * `design-preview` is a fixture: it exists so this design could be judged against real content rather
 * than against two short documents, and it is meant to be deleted once the authoring guide covers the
 * same ground. So it is asserted while it is there and skipped politely when it is not -- a check that
 * fails because somebody did the tidy thing is worse than no check.
 */
const SHOWCASE = `${OUT}/docs/tasked/design-preview/index.html`;
if (existsSync(SHOWCASE)) {
  const html = readFileSync(SHOWCASE, 'utf8');
  check('callouts render with a kind', /class="callout callout-/.test(html));
  check(
    'all four callout kinds survive',
    ['note', 'tip', 'warning', 'caution'].every((k) => html.includes(`callout-${k}`)),
    'note tip warning caution',
  );
  check('tabs render as a tablist', html.includes('role="tablist"') && html.includes('role="tab"'));
  check('tab panels render', html.includes('role="tabpanel"'));
  const copies = (html.match(/class="code-copy"/g) ?? []).length;
  check('every code block has a copy button', copies >= 4, `${copies} button(s)`);
  check('code blocks are wrapped for the button', html.includes('class="code"'));
  check('steps render numbered', html.includes('class="step"') && html.includes('step-title'));
  check('collapsed detail stays a <details>', html.includes('<details>'));
  check('headings carry anchors', html.includes('class="heading-anchor"'));
  check('the page has a contents rail', html.includes('class="docs-rail"'));
  check('the rail lists nested headings', html.includes('toc-nested'));

  /*
   * The table bug, asserted so it cannot come back.
   *
   * A wide table has to be scrollable, and the way that was done the first time -- `display: block` on
   * the `<table>` -- took it out of table layout, which made `thead` and `tbody` separate tables with
   * independent column widths. The header stopped lining up with the body. The wrapper is the fix, and
   * these two are the shape of it: the table is wrapped, and nothing has changed its display.
   */
  check('tables are wrapped, not display-blocked', html.includes('class="table-wrap"'));
  check('no rule takes a table out of table layout', !/\.prose table\{[^}]*display:block/.test(css));
  // Nothing is active until the reader scrolls, so a server-rendered marker would be a lie.
  check('no section is marked current before scrolling', !html.includes('aria-current="location"'));

  /*
   * Every contents link must point at a heading that exists on the page.
   *
   * The rail's hrefs are computed from the markdown source while the heading ids are assigned by
   * Fumadocs' own remark plugin. Those are two implementations of the same slug rule, and if they
   * ever disagree the rail looks perfect and does nothing. This is the check that would notice.
   */
  const links = [...html.matchAll(/class="toc"[\s\S]*?<\/nav>/g)]
    .flatMap((block) => [...block[0].matchAll(/href="#([^"]+)"/g)])
    .map((m) => m[1]);
  const ids = new Set([...html.matchAll(/<h[23][^>]*id="([^"]+)"/g)].map((m) => m[1]));
  const orphans = links.filter((link) => !ids.has(link));
  check('every contents link has a heading', links.length > 0 && orphans.length === 0, `${links.length} link(s)` + (orphans.length ? `, orphans: ${orphans.join(', ')}` : ''));
} else {
  console.log('  .   no design-preview page -- skipping the element assertions');
}

/*
 * The real pages, which is where these matter. `tasked/docs/index.md` is authored content rather than
 * a fixture, so an element failing here is a failure in something that is meant to stay.
 */
const taskedIndex = read(`${OUT}/docs/tasked/index.html`);
if (taskedIndex) {
  check('authored page: callout from a GFM alert', taskedIndex.includes('callout-note'));
  check('authored page: h2 carries an anchor', taskedIndex.includes('class="heading-anchor"'));
  check('authored page: table renders', taskedIndex.includes('<table'));
  // The wrapper is what keeps a wide table scrollable without breaking its column alignment.
  check('authored page: table is wrapped for scrolling', taskedIndex.includes('class="table-wrap"'));
  check('authored page: contents rail on a page with sections', taskedIndex.includes('docs-rail'));
  check('authored page: footer names the repository', taskedIndex.includes('ellipog/tasked'));
  check('authored page: footer carries page navigation', taskedIndex.includes('docs-nav'));
  // The sidebar shows "Overview" for a section's front page rather than repeating the page title
  // under a label that already names the mod.
  check('authored page: sidebar says Overview', taskedIndex.includes('>Overview<'));
}

const docsIndex = read(`${OUT}/docs/index.html`);
if (docsIndex) {
  check('/docs/ renders the contents list', docsIndex.includes('class="contents"'));

  /*
   * Scoped to the contents block, and matched loosely.
   *
   * The titles are checked inside the block rather than across the whole document, because "Tasked"
   * appears in the masthead, the sidebar and the prose -- an unscoped `includes` would pass even if
   * the contents list were empty. And the match is on the bare title rather than on `>Title<`, because
   * React inserts a comment between a text node and the element beside it, so the rendered markup is
   * `Tasked documentation<!-- --><span class="arrow">` and no such pattern exists.
   */
  const from = docsIndex.indexOf('class="contents"');
  const contents = from === -1 ? '' : docsIndex.slice(from, docsIndex.indexOf('</article>', from));
  for (const title of ['Tasked documentation', 'Design preview', 'Armature documentation']) {
    check(`/docs/ lists "${title}"`, contents.includes(title));
  }
}

console.log('\n== the README is not documentation ==');
// The whole point of the docs refactor: a README is a front door for the repository, not a manual.
// Neither README's build instructions should reach this site.
for (const id of ['tasked', 'armature']) {
  const html = read(`${OUT}/docs/${id}/index.html`);
  if (!html) continue;
  check(`${id}: no README build section on the site`, !html.includes('Jars land in'));
  check(`${id}: no README profile paths on the site`, !html.includes('testModsDirFabric'));
}

console.log('\n== cross-mod links and the glossary ==');
/*
 * The link syntax resolves at sync time, and an unresolved one fails the build rather than shipping as
 * literal text. This is the belt to that braces.
 *
 * **`<script>` contents are stripped first, and they have to be.** Next embeds its RSC payload as JSON
 * inside script tags, and a JSON array of arrays contains `[[` as a matter of course — so a plain
 * `html.includes('[[')` is true on every Next page ever built and the assertion could never pass. It
 * failed on both files here for exactly that reason, while the rendered page contained no `[[` at all.
 * The question is about visible content, so the check is too.
 */
// `withoutScripts` is declared at the top of the file, as a hoisted function declaration.
for (const path of [`${OUT}/docs/tasked/index.html`, `${OUT}/docs/tasked/design-preview/index.html`]) {
  const html = read(path);
  if (!html) continue;
  const name = path.slice(OUT.length + 1);
  check(`${name}: no unresolved [[...]]`, !withoutScripts(html).includes('[['));
}

if (existsSync(SHOWCASE)) {
  const html = readFileSync(SHOWCASE, 'utf8');

  // A cross-mod link is a real href into another mod's section, with the target's own title as its text.
  check(
    'cross-mod link resolves to the other mod',
    /href="\/docs\/armature\/"/.test(html),
  );
  check('cross-mod link takes its text from the target title', html.includes('Armature documentation'));
  // Custom text and anchors.
  check('cross-mod link honours custom text', html.includes('the Armature manual'));
  check('cross-mod link honours an anchor', /href="\/docs\/tasked\/#/.test(html));

  // Terms: a span with the definition in the DOM, not injected.
  const terms = (html.match(/class="term"/g) ?? []).length;
  const defs = (html.match(/class="term-def"/g) ?? []).length;
  check('glossary terms render as hover spans', terms >= 4, `${terms}`);
  check('every term carries its definition', terms === defs, `${terms} term(s) / ${defs} definition(s)`);
  check('definitions are described to assistive tech', html.includes('aria-describedby="glossary-'));
  check('definitions are in the DOM, not injected', html.includes('class="term-def-name"'));

  // The furniture.
  check('@since chips render', html.includes('class="since"'));
  check('the maturity marker renders', html.includes('maturity-draft'));

  /*
   * `class="prereq` with no closing quote, deliberately.
   *
   * The element renders as `class="prereq mono"`, so asserting on `class="prereq"` — with the quote —
   * can never match. That is exactly how it failed, and the tell was two assertions disagreeing about
   * one element: this one said the strip was missing while `prerequisites name the Minecraft version`
   * passed, because the version string was inside the very element this check could not see.
   */
  check('the prerequisites strip renders', html.includes('class="prereq'));
  check('prerequisites name the Minecraft version', html.includes('Minecraft 1.21.1'));

  /*
   * The loader names, spelled the way the loaders spell them.
   *
   * This shipped as `Neoforge` for as long as the strip has existed, because the name was derived by
   * capitalising the id rather than looked up. Nothing failed — it was just wrong, on every page, in a
   * proper noun. Asserting the correct spelling is the only thing that would have caught it.
   */
  check('loaders are spelled correctly', html.includes('NeoForge'), 'NeoForge');
  check('no derived-capitalisation spelling survives', !html.includes('Neoforge'));
}

const glossaryPage = read(`${OUT}/docs/glossary/index.html`);
if (glossaryPage) {
  check('the glossary page exists', true);
  check('the glossary lists terms', glossaryPage.includes('class="glossary-row"'));
  check('glossary terms are anchorable', glossaryPage.includes('id="glossary-quest"'));

  /*
   * THE CHECK THAT WAS MISSING, AND THE REASON THE GLOSSARY SHIPPED UNSTYLED.
   *
   * Every assertion above passes on markup alone, so they all passed while the page rendered as a raw
   * `<dl>` — browser-default bold term, indented definition, no hairlines. An `edit_file` had failed on
   * a stale anchor and the whole block of CSS never landed, and nothing noticed because nothing was
   * looking at the stylesheet. Presence of a class in the HTML is not evidence that anything styles it.
   */
  check('the glossary is styled', /\.glossary\{[^}]*counter-reset:term/.test(allCss), show('.glossary{'));
  check('glossary rows are a grid', /\.glossary-row\{[^}]*display:grid/.test(allCss), show('.glossary-row{'));

  /*
   * **Assertions against compiled CSS must survive the minifier, and these did not.**
   *
   * Two of them failed against CSS that was correct. Lightning CSS rewrites `::before` to `:before`,
   * and shortens `flex: 1 1 auto` to `flex: auto` — so a regex looking for either one verbatim fails
   * while the rule is right there in the file. `:?` and an alternation cost nothing and are the
   * difference between a test that checks the work and one that checks the formatter.
   *
   * The general rule: match the *property and value* you care about, not the exact syntax you wrote.
   */
  check('the ordinal is generated', /\.glossary-row:?:before\{[^}]*counter\(term/.test(allCss), show('.glossary-row'));
  check(
    'renderers are visible before hover',
    /\.glossary\{/.test(allCss) && /\.glossary-row dd\{[^}]*color:var\(--fg-muted\)/.test(allCss),
    show('.glossary-row dd{'),
  );
  check('glossary terms carry an anchor', glossaryPage.includes('class="glossary-anchor"'));
  check('glossary terms show their identifier', glossaryPage.includes('class="glossary-id"'));
  check('cross-references are rendered', glossaryPage.includes('class="glossary-see"'));
}

/*
 * The whole furniture set, checked in the CSS rather than the markup — for the same reason as above.
 * Each of these rendered as unstyled text at some point.
 */
check('the page head is a flex row', /\.page-head\{[^}]*display:flex/.test(allCss), show('.page-head{'));
/*
 * `flex:auto` rather than `flex:1` -- the minifier shortens `flex: 1 1 auto` to `flex: auto`, so the
 * assertion checks that the heading is *flexible* rather than how it was spelled. See the note on the
 * glossary assertion above; this is the second instance of the same trap.
 */
check(
  'the page heading stretches, so its rule spans',
  /\.page-head h1\{[^}]*flex:(1|auto|1 1 auto)/.test(allCss),
  show('.page-head h1{'),
);
check('the maturity chip is styled', /\.maturity\{[^}]*text-transform:uppercase/.test(allCss), show('.maturity{'));
check('the draft state is distinguished', /\.maturity-draft\{[^}]*border-style:dashed/.test(allCss));
check('the prerequisites line is styled', /\.prereq\{[^}]*letter-spacing/.test(allCss), show('.prereq{'));
check('the @since chip is styled', /\.since\{[^}]*font-family:var\(--font-mono\)/.test(allCss), show('.since{'));
check('inline terms are underlined as terms', /\.term\{[^}]*border-bottom:1px dashed/.test(allCss), show('.term{'));

/*
 * The hover definition must be *hidden*, not *removed*.
 *
 * `display: none` or `visibility: hidden` would take it out of the accessibility tree, and an
 * `aria-describedby` pointing at an element outside that tree announces nothing — so the tooltip would
 * be silent for exactly the readers who cannot hover. The clip trick is what keeps both properties at
 * once, and this asserts the mechanism rather than trusting it.
 */
check(
  'hidden definitions are clipped, not removed',
  /\.term-def\{[^}]*clip-path:inset\(50%\)/.test(allCss) && !/\.term-def\{[^}]*display:none/.test(allCss),
  show('.term-def{'),
);
check('a revealed definition stops being clipped', /\.term:hover \.term-def[^{]*\{[^}]*clip-path:none/.test(allCss));

console.log('\n== the contents rail cannot move on scroll ==');
/*
 * THE BUG THIS GUARDS.
 *
 * A sticky element is positioned from the viewport, but it lives in the flow, and it only pins once its
 * flow position would cross the sticky `top`. So if the two disagree, the rail renders at its flow
 * position on load and *slides upward* into its pinned position over the first screenful of scroll.
 *
 * Which is what happened: two ancestors each added top padding that the sticky offset could not see, so
 * the rail sat 152px below the masthead at rest and 80px once pinned — a visible slide on every page
 * that had a rail.
 *
 * The fix is that one token feeds both sides, and that is what these assertions are: the offset exists,
 * both columns take their top from it, the sticky position is built from it, and nothing in between has
 * grown a top offset of its own again. Checked in the built CSS rather than measured in a browser,
 * because arithmetic does not need a browser and a measurement would need one that can run a script.
 */
/*
 * Every stylesheet, concatenated — **not `cssFiles[0]`**.
 *
 * Next emits more than one CSS chunk and `global.css` and `docs.css` land in different ones. An earlier
 * version of this read only the first file, so `--masthead` was found (it is in `global.css`) while all
 * four `--docs-top` assertions failed (it is in `docs.css`) — with the rules present and correct the
 * whole time. That is the worst kind of failing test: a false alarm that costs a debugging round. `css`
 * above is already the concatenation.
 */
/* `allCss` and `show` are declared beside `css`, at the top of the scrollbar section. */

check('the masthead height is one token', /--masthead:/.test(allCss));
check('the top offset is one token', /--docs-top:/.test(allCss), show('.docs-page{'));
check(
  'the rail takes its top from that token',
  /\.docs-rail\{[^}]*padding:var\(--docs-top\)/.test(allCss),
  show('.docs-rail{'),
);
check(
  'the article takes the same offset',
  /\.docs-page>\.prose\{[^}]*padding-top:var\(--docs-top\)/.test(allCss),
  show('.docs-page>.prose{'),
);
/*
 * The prose must fill its column, not stop at the character cap.
 *
 * `global.css` caps `.prose` at 68ch, which is right for a page of text standing alone. Inside the docs
 * layout the column is already narrower than that on a 1200px shell, so keeping both caps meant the
 * smaller one won and the difference rendered as ~190px of empty space between the text and the
 * contents rail. The override is what closes it.
 */
check(
  'the docs prose fills its column',
  /\.docs-page>\.prose\{[^}]*max-width:none/.test(allCss),
  show('.docs-page>.prose{'),
);
check(
  'the sticky top is built from the same two tokens',
  /\.toc\{[^}]*top:calc\(var\(--masthead\)[^}]*var\(--docs-top\)/.test(allCss),
  show('.toc{'),
);
// The regression: a top padding on the column between the page and the masthead, which is what put the
// flow position and the pinned position out of step in the first place.
check('no column adds a top offset of its own', !/\.docs-body\{[^}]*padding:var\(--s7\)/.test(allCss));

console.log('\n== the contents rail scrolls, and marks what you clicked ==');

/*
 * The rail's click behaviour lives in a client component, so these are asserted against the built
 * JavaScript rather than against the HTML or the CSS. Three things have to be true for a click to do
 * what a reader expects, and each of them was missing at some point:
 *
 *   - `scrollIntoView` — the click scrolls the page at all, rather than only moving the URL.
 *   - `prefers-reduced-motion` — the smooth scroll is skipped for a reader who asked for less motion.
 *   - `scroll-margin-top` on the heading — the target stops below the masthead instead of under it.
 *
 * The mark being *held* while the scroll is in flight is the fourth, and it is the one that cannot be
 * asserted from outside: it is a timestamp in a closure. `components/toc.tsx` explains it.
 */
const clientJs = existsSync(CHUNKS)
  ? readdirSync(CHUNKS)
      .filter((f) => f.endsWith('.js'))
      .map((f) => readFileSync(`${CHUNKS}/${f}`, 'utf8'))
      .join('\n')
  : '';

check('the client bundle exists', clientJs.length > 0, `${clientJs.length} bytes`);
check('a contents click scrolls the page', clientJs.includes('scrollIntoView'));
check('the smooth scroll is skipped for reduced motion', clientJs.includes('prefers-reduced-motion'));
check('a clicked entry pushes a history entry', clientJs.includes('pushState'));
check(
  'heading anchors clear the masthead',
  /\.heading\{[^}]*scroll-margin-top/.test(allCss),
  show('.heading{'),
);

console.log('\n== the prose sits in equal air ==');
/*
 * The gutter: the same 32px between the left rail and the prose as between the prose and the contents
 * rail. It shipped with only the left half, so the prose, its callouts and its tables ran edge to edge
 * into the rail's border — 32px of air on one side and none on the other.
 *
 * The two halves are applied in *different places* — `.docs-body`'s padding and the page grid's
 * `column-gap` — which is exactly why one of them went missing. One token feeds both, so these assert
 * the token and both of its uses rather than the number 32, and the last one guards the regression:
 * a hardcoded value reappearing in either half.
 */
check('the gutter is one token', /--docs-gutter:/.test(allCss), show('.docs{'));
check(
  'the left half comes from the token',
  /\.docs-body\{[^}]*padding:0 var\(--docs-gutter\)/.test(allCss),
  show('.docs-body{'),
);
check(
  'the right half comes from the same token',
  /\.docs-page-with-rail\{[^}]*column-gap:var\(--docs-gutter\)/.test(allCss),
  show('.docs-page-with-rail{'),
);
check('neither half is hardcoded', !/\.docs-body\{[^}]*padding:0 var\(--s6\)/.test(allCss));

console.log('\n== every mod can be built from a pin ==');
/*
 * THE DEPLOY BLOCKER, ASSERTED.
 *
 * On a build server there are no sibling folders. A clone of this repository is `.gitignore`, `AGENT.md`,
 * `apps`, `bun.lock`, `manifest.json`, `package.json`, `README.md` and `scripts` — and nothing else. So
 * `../tasked` does not exist, the sibling read finds nothing, every mod is skipped and the sync exits
 * non-zero: **the site could not have been deployed at all.**
 *
 * These assertions cannot prove the fetch works — that needs the network, and `check.mjs` reads the
 * built output rather than doing network I/O. What they can prove is that every active mod *has* a pin
 * and a repository to fetch it from, which is the half of the problem that is a property of the repo
 * rather than of the internet. The other half is asserted by the sync itself: a pin it cannot fetch
 * pushes a message into `problems`, and a non-empty `problems` fails the build.
 */
const pinned = manifest.suite.filter((m) => m.status === 'active');
check('there is at least one active mod to pin', pinned.length > 0, `${pinned.length}`);

for (const mod of pinned) {
  check(`${mod.id}: has a repository to fetch from`, Boolean(mod.repo), mod.repo ?? 'MISSING');
  check(
    `${mod.id}: has a pinned commit`,
    typeof mod.pin === 'string' && /^[0-9a-f]{40}$/.test(mod.pin),
    typeof mod.pin === 'string' ? mod.pin.slice(0, 7) : 'MISSING — a deploy would find no docs',
  );
}

/*
 * The pin a page was built from, printed rather than asserted.
 *
 * A pinned commit is reproducible and *not* automatically fresh: the site describes the pin, not the
 * branch. Being able to read which commit the build used is what makes a stale pin visible instead of
 * silent, and it is why the sync prints its source on every run: `+ tasked  2 page(s) from f770a37`.
 */
for (const mod of pinned) {
  console.log(`  .   ${mod.id.padEnd(10)} builds from ${mod.pin.slice(0, 7)}`);
}

console.log('\n== the mod marks ==');
/*
 * The icons are generated files that are also committed, which is the one arrangement here where two
 * things could drift: the sources in `design/icons-source/` and the glyphs in `apps/docs/public/icons/`.
 * `bun run icons` regenerates one from the other, and these assertions are what say whether they agree.
 *
 * The colour check is the important one. A hex left in a generated glyph means the transform missed a
 * shape, and the result is a **coloured icon in a monochrome design** — the loudest possible failure,
 * and one that would only be noticed by looking. Every tone is meant to be `currentColor` at some
 * opacity, and every knockout `var(--icon-ground)`.
 */
const ICON_DIR = 'apps/docs/public/icons';
const iconFiles = existsSync(ICON_DIR) ? readdirSync(ICON_DIR).filter((f) => f.endsWith('.svg')) : [];

check('there are icons to check', iconFiles.length > 0, `${iconFiles.length} file(s)`);

for (const file of iconFiles) {
  const id = file.replace(/\.svg$/, '');
  const svg = readFileSync(`${ICON_DIR}/${file}`, 'utf8');

  const hexes = [...new Set(svg.match(/#[0-9a-f]{6}\b/gi) ?? [])];
  check(`${id}: monochrome`, hexes.length === 0, hexes.length ? `leftover: ${hexes.join(' ')}` : '');
  check(`${id}: takes its colour from the text`, svg.includes('currentColor'), 'currentColor');
  // The plate is a full-bleed rect; 256 is the viewBox, so its survival is unambiguous.
  check(`${id}: no background plate`, !/<rect[^>]*width="256"/.test(svg));
  // The knockouts must point at the token, not at `--bg` — see the note in `scripts/icons.mjs` about why.
  check(`${id}: knockouts use the ground token`, svg.includes('var(--icon-ground)'), 'var(--icon-ground)');
  check(`${id}: copy is in the build`, existsSync(`${OUT}/icons/${file}`));
}

// A generated glyph whose source is missing cannot be regenerated, which makes the transform a fiction.
const srcDir = 'design/icons-source';
const sources = existsSync(srcDir) ? readdirSync(srcDir).filter((f) => f.endsWith('.svg')) : [];
check('every generated icon has a committed source', sources.length === iconFiles.length, `${sources.length} source(s) / ${iconFiles.length} generated`);

if (home) {
  /*
   * **Inlined, not an `<img>`, and this is the assertion that protects it.**
   *
   * The glyphs use two CSS variables: `currentColor` and `var(--icon-ground)`. An SVG in an `<img>` is a
   * separate document with no access to the page's CSS, so neither would resolve — the icons would be
   * black on a dark page and their knockout detail would vanish. It would look fine in light mode, which
   * is exactly why it needs a test rather than an eye.
   */
  check('icons are inlined as <svg>', /<svg class="mod-icon/.test(home), 'not an <img>');
  check('no icon is loaded as an <img>', !/<img[^>]*icons\//.test(home));
  check('the ground token reaches the page', home.includes('var(--icon-ground)'));

  /*
   * Kindred has no icon, so it renders a placeholder — and the placeholder is the point.
   *
   * A row with nothing shifts left and reads as a mod that is somehow different; a dashed slot reads as
   * one waiting to be filled. The count is asserted so the placeholder cannot be quietly dropped.
   */
  /*
   * Counted from the markup with the render-tree payload stripped, and compared against the manifest
   * rather than against a number.
   *
   * Counted naively this read **2 for one placeholder** — Next serialises the render tree into a
   * `<script>`, so the class name appeared twice. That would have passed even if the placeholder vanished
   * from the markup entirely and survived only in the JSON.
   *
   * Deriving the expected count from the files on disk means adding an icon, or a mod, keeps this honest
   * without anybody remembering to update a literal.
   */
  const noIcon = manifest.suite.filter((m) => !existsSync(`${ICON_DIR}/${m.id}.svg`)).length;
  const placeholders = (withoutScripts(home).match(/mod-icon-empty/g) ?? []).length;
  check(
    'a mod with no icon shows a placeholder',
    placeholders === noIcon,
    `${placeholders} rendered / ${noIcon} expected`,
  );

  /*
   * The hover override, which is the whole reason the token exists.
   *
   * A catalog cell inverts on hover — its ground becomes `--inv-bg` — so the glyph's knockouts have to
   * point at that instead, or they keep revealing `--bg` and show a colour that is not behind them.
   *
   * Asserted rather than looked at because it only appears in a state these tools cannot reach:
   * `browser_hover` is not implemented in this session, so the inverted cell is not something a
   * screenshot can capture.
   */
  check(
    'the ground follows an inverted cell',
    /grid-cell:hover \.mod-icon\{[^}]*--icon-ground:var\(--inv-bg\)/.test(allCss),
    show('grid-cell:hover .mod-icon{'),
  );
}

if (docsPage) {
  // The section label carries its mod's mark, at 16px.
  check('docs sidebar sections carry their mark', /class="label sidebar-label"[\s\S]{0,300}mod-icon/.test(docsPage));
}

console.log('\n== the sponsor band ==');
/*
 * An affiliate link, so most of these are about honesty rather than layout.
 *
 * Three separate things have to be true and each is easy to lose on its own: the link must declare
 * itself sponsored (`rel="sponsored"`, the value search engines expect for exactly this), the page must
 * SAY it is sponsored, and the offer must be the one that was actually agreed. A discount code that
 * silently stops being quoted is a broken promise to the reader and an unpaid referral to the host.
 */
/*
 * Plain JavaScript — `check.mjs`, not `.ts`.
 *
 * This was written with a type annotation (`manifest.sponsor as {...} | undefined`) and Bun refused it
 * outright: `Expected ";" but found "as"`. The build failed instantly, which is the point of running
 * `check` as the last step of `build` rather than by hand -- a syntax error in the test harness cannot
 * reach a deployment. Every other script here is `.mjs` for the same reason: no build step, and nothing
 * to compile before you can run the thing that tells you whether anything works.
 */
const sponsor = manifest.sponsor;

if (sponsor) {
  check('the sponsor band renders', home.includes('class="sponsor"'));
  check('it is labelled as paid', home.includes('>Sponsored<'));
  check('the affiliate link is the agreed one', home.includes(sponsor.url), sponsor.url);
  check(
    'the link declares itself sponsored',
    /rel="sponsored noreferrer noopener"/.test(home),
    'rel="sponsored noreferrer noopener"',
  );
  check('the discount code is quoted', home.includes(sponsor.code), sponsor.code);
  check('the discount is stated', home.includes(sponsor.discount), sponsor.discount);
  check('the link opens away from the site', /target="_blank"/.test(home));

  /*
   * The trust mark.
   *
   * Three things, and the third is the one that would be easy to get wrong:
   *
   *   1. it renders at all, and what renders is what the manifest says — so changing the wording is one
   *      edit and the page cannot drift from the data;
   *   2. it is not worded as a status the host does not confer. `Verified` is the specific word to keep
   *      out: BisectHosting run a Partner Program and an Affiliate Program, and neither of their pages
   *      uses it. A trust mark that overstates is worse than no mark;
   *   3. it sits in the band **head**, outside the link. A badge inside an `<a>` is one the reader can
   *      click, which would make a decoration behave like a destination — and it would navigate to the
   *      host, which is not what a mark meaning "this is who we use" should do.
   */
  if (sponsor.badge) {
    check('the trust mark renders', home.includes('class="sponsor-badge"'));
    check('its label matches the manifest', home.includes(sponsor.badge.label), sponsor.badge.label);
    check(
      'it does not overstate the arrangement',
      !/verified/i.test(sponsor.badge.label),
      `"${sponsor.badge.label}" — see the note in manifest.json`,
    );

    // Order in the markup is what proves it is in the head and not the row.
    const badgeAt = home.indexOf('sponsor-badge');
    const linkAt = home.indexOf('class="sponsor-link"');
    check(
      'it sits outside the link',
      badgeAt !== -1 && linkAt !== -1 && badgeAt < linkAt,
      badgeAt < linkAt ? 'in the head' : 'INSIDE the link — clicking it would navigate',
    );
  }

  check(
    'the brand mark is in the repo',
    existsSync('apps/docs/public/brand/bisecthosting.svg'),
    'apps/docs/public/brand/bisecthosting.svg',
  );
  check(
    'the brand mark is copied into the build',
    existsSync(`${OUT}/brand/bisecthosting.svg`),
  );

  /*
   * The mark is monochrome and inline, which is the whole point of the transform.
   *
   * A hex colour left in the file would render a coloured logo in a monochrome design. A surviving
   * `<style>` block is worse than cosmetic: an inline SVG's styles are **document-scoped**, so
   * `.cls-1 { fill: #000 }` would leak into the entire page. Both are invisible in a screenshot until
   * something else on the page loses its colour.
   */
  const brandSvg = existsSync('apps/docs/public/brand/bisecthosting.svg')
    ? readFileSync('apps/docs/public/brand/bisecthosting.svg', 'utf8')
    : '';

  check('the brand mark is monochrome', !/#[0-9a-f]{6}\b/i.test(brandSvg), 'no hex colours');
  check('it carries no <style> block', !/<style/i.test(brandSvg), 'classes are folded into fill attributes');
  check('it takes its colour from the text', brandSvg.includes('currentColor'), 'currentColor');
  check('its knockouts use the ground token', brandSvg.includes('var(--icon-ground)'), 'var(--icon-ground)');
  // `#03ddff` is the hexagon's interior field, not a tone — mapped to the ground so the mark is two-value.
  check('the brand colour is the ground, not a tone', !/03ddff/i.test(brandSvg), 'cyan mapped to the ground');

  check(
    'the mark is inlined, not an <img>',
    /<svg class="brand-mark"/.test(home),
    'an <img> could not see the page CSS',
  );
  check('no brand asset is loaded as an <img>', !/<img[^>]*brand\//.test(home));

  /*
   * The two variants and the four CSS rules that switched between them are gone. Asserted rather than
   * assumed, because a leftover `.sponsor-logo` rule would be dead code that reads as a live mechanism —
   * and the next person would try to edit it.
   */
  check('the light/dark pair is retired', !existsSync('apps/docs/public/brand/bisecthosting-light.svg'));
  check('no display-switching rules remain', !/sponsor-logo/.test(allCss));

  /*
   * The dimensions matter more than they look: the SVG declares a `viewBox` and no width or height of
   * its own, so without the attributes the box is nothing until the element is laid out. `BrandMark`
   * sets both from the manifest's real ratio.
   */
  check(
    'the mark box is reserved',
    /<svg class="brand-mark"[^>]*width="\d+"[^>]*height="\d+"/.test(home),
    'width and height on the mark',
  );

  // Every page, not just the home page -- it is in the root layout, and this is what proves it.
  check(
    'the band is on the docs pages too',
    Boolean(read(`${OUT}/docs/tasked/index.html`)?.includes('class="sponsor"')),
  );

  /*
   * And it must not read as part of the site's own colophon. The footer is the domain, the licence and
   * where else the work lives; a paid arrangement in that list would be posing as one of them, which is
   * the exact thing the "Sponsored" label exists to prevent.
   */
  const sponsorAt = home.indexOf('class="sponsor"');
  const footerAt = home.indexOf('class="footer"');
  check('the band is separate from the colophon', sponsorAt !== -1 && (footerAt === -1 || sponsorAt < footerAt));
} else {
  console.log('  .   no sponsor in the manifest -- skipping the sponsor assertions');
}

console.log('\n== the left rail scrolls alone, and silently ==');
/*
 * TWO PROPERTIES, ASSERTED SEPARATELY, because "scrolls independently" and "shows no scrollbar" are
 * different things and it is easy to fix one and lose the other.
 *
 * This is also the one place the design deliberately contradicts itself, so it is worth an assertion
 * rather than a comment alone: the *page* scrollbar is drawn as a hairline progress indicator on the
 * argument that hiding it argues against a design built on visible edges. This rail hides its own,
 * because it holds a handful of links and the whole point is that it is uncluttered. Same stylesheet,
 * opposite decisions, each right for its own element.
 */
check(
  'the left rail scrolls on its own',
  /\.sidebar\{[^}]*overflow-y:auto/.test(allCss) && /\.sidebar\{[^}]*max-height:calc\(100vh/.test(allCss),
  show('.sidebar{'),
);
check(
  'the left rail pins below the masthead',
  /\.sidebar\{[^}]*position:sticky/.test(allCss) && /\.sidebar\{[^}]*top:var\(--masthead\)/.test(allCss),
  show('.sidebar{'),
);
/*
 * `align-self: start` is not optional and is easy to lose in a refactor. `.docs` stretches its children,
 * and a grid item already as tall as its container has nothing for `position: sticky` to move inside --
 * so dropping this line silently un-sticks the rail while every other assertion here still passes.
 */
check(
  'the rail is sized to its content, not stretched',
  /\.sidebar\{[^}]*align-self:start/.test(allCss),
  show('.sidebar{'),
);
check(
  'no scrollbar inside the rail',
  /\.sidebar\{[^}]*scrollbar-width:none/.test(allCss),
  show('.sidebar{'),
);
check(
  'the older-Chromium scrollbar is hidden too',
  /\.sidebar::-webkit-scrollbar\{[^}]*display:none/.test(allCss),
  show('.sidebar::-webkit-scrollbar{'),
);
// The page scrollbar must still be the drawn one -- suppressing the rail's must not have taken it with.
check('the page scrollbar is still drawn', /::-webkit-scrollbar\{[^}]*width:11px/.test(allCss));

console.log('\n== nothing generated leaked into the repo ==');
const strays = [
  ...readdirSync('scripts').filter((f) => /^_/.test(f)),
  ...readdirSync('apps/docs/public').filter((f) => /^_/.test(f)),
  ...(existsSync('.') ? readdirSync('.').filter((f) => /\.html$/.test(f)) : []),

  /*
   * **ANY HTML IN `public/` IS SCRATCH.** Not just files matching "probe".
   *
   * This is the rule that was missing. `public/` is copied wholesale into the build, so an HTML file
   * there is a **live page on the deployed site** — and the previous filter only caught names matching
   * `/probe/i` or starting with an underscore. `knockout-test.html` matched neither, so it sat in
   * `public/` looking like a scratch file and would have shipped at `/knockout-test.html`.
   *
   * The durable rule needs no naming convention to hold: **the site's pages are generated by Next into
   * `out/`, so nothing authored in `public/` should be a page at all.** A file named anything, left
   * there by anybody, is a stray by definition. That is why this checks the extension rather than a
   * pattern — a convention is something a future filename can fail to follow, and an extension is not.
   */
  ...readdirSync('apps/docs/public').filter((f) => /\.html?$/i.test(f)),

  // The same files after the build copied them through, minus the two Next generates at the root.
  ...(existsSync(OUT)
    ? readdirSync(OUT, { withFileTypes: true })
        .filter((e) => e.isFile() && /\.html?$/i.test(e.name) && !['index.html', '404.html'].includes(e.name))
        .map((e) => `out/${e.name}`)
    : []),
];

check(
  'no scratch files left where they would ship',
  strays.length === 0,
  strays.length === 0 ? '' : `${strays.join(', ')} -- public/ is copied into the build, so these deploy`,
);

/*
 * Every generated file must not be committable, or a build artifact ends up in the repository.
 *
 * `apps/docs/glossary.json` was the one that got missed: `sync.mjs` copies `glossary.json` in beside
 * `manifest.json`, and the ignore list named the latter twice over while never mentioning the former. An
 * untracked-but-unignored generated file is the worst of both -- it shows in `git status` forever and a
 * `git add -A` commits it, which is exactly the second-home-for-a-document problem the whole arrangement
 * exists to prevent.
 *
 * **`git status --porcelain`, not `git check-ignore`.** The first version asked `check-ignore`, and it
 * reported `stats.json` as ignored while reporting `glossary.json` as not -- from two adjacent literal
 * lines in the same file, with both patterns correct. Whatever the reason, that made it a proxy for the
 * question rather than the question itself. `status --porcelain` is the answer: a `??` line means git
 * would commit the file, which is the thing that actually matters. `--ignored=matching` so ignored paths
 * are listed explicitly rather than omitted, which is what lets the three outcomes be told apart.
 */
const GENERATED = [
  'apps/docs/manifest.json',
  'apps/docs/glossary.json',
  'apps/docs/stats.json',
  'apps/docs/content',
  '.cache',
];

for (const path of GENERATED) {
  // Nothing to check if the build has not produced it yet.
  if (!existsSync(path)) continue;

  let lines = '';
  try {
    lines = execFileSync('git', ['status', '--porcelain', '--ignored=matching', '--', path], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    // Not a git checkout -- nothing to assert, and not a failure of the site.
    lines = '';
  }

  const untracked = lines
    .split('\n')
    .filter((line) => line.startsWith('??'))
    .map((line) => line.slice(3).trim());

  check(
    `${path} would not be committed`,
    untracked.length === 0,
    untracked.length === 0 ? '' : `git would commit ${untracked.join(', ')}`,
  );
}

console.log('\n== the manifest and the numbers agree ==');
// `manifest` and `stats` are read at the top of the file; see the note there.
for (const item of manifest.selected) {
  const cr = item.curseforge ? stats.curseforge[item.curseforge] : undefined;
  const mr = item.modrinth ? stats.modrinth[item.modrinth] : undefined;
  check(
    `selected "${item.id}" resolves`,
    Boolean(cr || mr),
    [cr && `${cr.downloads} cf`, mr && `${mr.downloads} mr`].filter(Boolean).join(' + ') || 'neither platform matched',
  );
}
check('totals sum', stats.totals.all === stats.totals.modrinth + stats.totals.curseforge);
check('avatar downloaded', existsSync('apps/docs/public/avatar.webp') || existsSync('apps/docs/public/avatar.png'));

console.log('\n== the numbers survive without JavaScript ==');
/*
 * The shuffle effect animates a figure on the catalog page. The property that must not break is that
 * the real value is in the static HTML -- not injected by the animation -- so that JavaScript off, a
 * hydration failure or a crawler all still see a correct number. These three assertions are the whole
 * of that guarantee.
 */
// `home` is read once at the top of the file, with the other shared reads.
if (home) {
  const total = (stats.totals?.all ?? 0).toLocaleString('en-US');
  check('the hero total is in the static HTML', home.includes(total), total);

  /*
   * Counted by class, not by `aria-hidden`.
   *
   * The first version of this counted every `aria-hidden="true"` on the page and compared it to the
   * `sr-only` count. It read 15 against 4, because the `Arrow` component is also `aria-hidden` and
   * appears in every link — a fact the assertion could not see from where it was standing. The class
   * on the animated span is what makes the pair countable, which is why it exists.
   */
  const animated = (home.match(/class="shuffle"/g) ?? []).length;
  const exposed = (home.match(/class="sr-only"/g) ?? []).length;
  check('every animated figure has a moving copy', animated >= 1, `${animated}`);
  check('every animated figure has a still copy', animated === exposed, `${animated} moving / ${exposed} still`);
  check('the still copy is not hidden from assistive tech', !/class="sr-only"[^>]*aria-hidden/.test(home));

  // The figure classes must pin the digit width, or a scrambling number drags the layout with it.
  check('figures use fixed-width numerals', /tabular-nums/.test(css));

  /*
   * The hero figure must be ink, and nothing may repaint it.
   *
   * This is the regression: `.hero-total span` -- a descendant selector -- also matched the spans
   * `ShuffledNumber` renders inside the `<b>`, so the number was painted in the faint grey meant for
   * its own label. Two assertions, because either alone would have passed:
   *
   *   - the size, so nobody shrinks it back to something that reads as a caption
   *   - the selector, so nobody reaches for the descendant form again
   */
  check('the hero figure is the largest type on the page', /\.hero-total b\{[^}]*font-size:clamp\(44px/.test(css), show('.hero-total b{'));
  check('the hero label only targets its own span', !/\.hero-total span\{/.test(css), show('.hero-total span{'));
}
/*
 * `vercel.json` is validated against Vercel's published schema, which sets
 * `additionalProperties: false`. An unknown top-level key there is a rejected
 * deploy rather than a warning, and a `"/*"` comment key is exactly that -- it
 * reads perfectly well locally and fails in the build. Notes about the deploy
 * live in AGENT.md, and this is what keeps them out of the file.
 *
 * Two assertions, because either alone would pass while the file is wrong:
 *   - no comment key, which is the mistake that actually happened
 *   - exactly the five keys, so the fix cannot be "delete the note and drift"
 */
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
const strayVercelKeys = Object.keys(vercel).filter((k) => k.startsWith('/'));
const allowedVercelKeys = ['$schema', 'framework', 'installCommand', 'buildCommand', 'outputDirectory'];
check('vercel.json carries no comment keys', strayVercelKeys.length === 0, strayVercelKeys.join(', ') || 'none');
check(
  'vercel.json is exactly the keys the deploy needs',
  allowedVercelKeys.every((k) => k in vercel) && Object.keys(vercel).length === allowedVercelKeys.length,
  Object.keys(vercel).join(', '),
);

notes.push(`totals: modrinth ${stats.totals.modrinth}, curseforge ${stats.totals.curseforge}, all ${stats.totals.all}`);
for (const n of stats.notes ?? []) notes.push(n);

console.log('\n== notes ==');
for (const n of notes) console.log(`  . ${n}`);

console.log(
  `\n\n${failures.length === 0 ? 'ALL CHECKS PASSED' : `${failures.length} FAILURE(S): ${failures.join('; ')}`}\n`,
);
process.exitCode = failures.length === 0 ? 0 : 1;
