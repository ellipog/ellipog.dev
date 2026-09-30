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

import { readInk } from './lib/png-ink.mjs';

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
 * Text as the HTML carries it.
 *
 * Needed because a value read from `manifest.json` is raw text and the same value in `apps/docs/out` is
 * escaped markup — so `home.includes(manifest x)` is true for a plain sentence and false the moment that
 * sentence contains `&`, `<` or `>`. React escapes `&` as `&amp;`, and `"Engineered & maintained by"` is a
 * label anybody might reasonably write.
 *
 * The alternative is to keep assertions passing by keeping punctuation out of the copy, which gets the
 * dependency backwards: the manifest is the source and the markup should be compared against it, not the
 * other way round.
 */
function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

/*
 * ASKING WHAT A SELECTOR RESOLVES TO, RATHER THAN WHAT THE SOURCE FILE LOOKS LIKE.
 *
 * This exists because a minifier is free to *merge* two rules that declare the same thing into one
 * selector list, and lightningcss does exactly that. Two rules that both set `background-image` to the
 * same file came out as:
 *
 *     [data-theme=dark] .site-mark,.colophon-link:hover .site-mark{background-image:url(...)}
 *
 * which is semantically identical and broke the assertion written before it, because that assertion
 * wanted `]` immediately followed by `.site-mark{` and found a comma. **The check was wrong, not the
 * CSS** — and the failure read as `"[data-theme=dark] .site-mark{" absent`, which is the kind of message
 * that sends you looking at the stylesheet for a problem that is in the test.
 *
 * So these assertions ask the question that actually matters — "when this selector matches, what has been
 * declared for it?" — and stay indifferent to how the rule was written. That is the same principle as
 * everything else in this file: assert the artifact's meaning, never its formatting.
 */

/** `[data-theme="dark"]` and `[data-theme=dark]` are the same selector; quotes and spacing are not meaning. */
const normaliseSelector = (selector) => selector.replace(/["']/g, '').replace(/\s+/g, ' ').trim();

/**
 * A stylesheet's top-level rules, as `[selectors, declarations]`.
 *
 * Brace counting rather than a flat `SELECTORS{DECLARATIONS}` pattern, because a flat pattern cannot tell
 * a rule from the inside of an `@media` block — it reads a conditional rule as though it applied
 * everywhere and reports success for something that only holds on a narrow screen. Tracking depth means
 * only rules that apply unconditionally are returned, which is what the assertions built on this mean.
 *
 * An at-rule's body containing braces is therefore not itself a match for any selector, and the rules
 * inside it are deliberately not returned. A mark whose base rule had been moved inside a media query
 * would fail these checks, and it should: the mark would then be missing at every other width.
 */
function topLevelRules(css) {
  const rules = [];
  let depth = 0;
  let selectorStart = 0;
  let bodyStart = -1;

  for (let i = 0; i < css.length; i++) {
    const char = css[i];
    if (char === '{') {
      if (depth === 0) bodyStart = i + 1;
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0 && bodyStart !== -1) {
        rules.push([css.slice(selectorStart, bodyStart - 1), css.slice(bodyStart, i)]);
        bodyStart = -1;
      }
      if (depth === 0) selectorStart = i + 1;
    }
  }

  return rules;
}

/**
 * Everything declared for one selector, however the minifier chose to write it.
 *
 * The selector list is split on commas, so a merged rule answers for each of its selectors — while a
 * *descendant* like `.colophon-link:hover .site-mark` is one selector and cannot be mistaken for
 * `.site-mark`. That distinction is the whole reason this is a split rather than a substring search.
 */
function declarationsFor(css, selector) {
  const wanted = normaliseSelector(selector);
  return topLevelRules(css)
    .filter(([selectors]) => selectors.split(',').some((one) => normaliseSelector(one) === wanted))
    .map(([, declarations]) => declarations)
    .join(' ');
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
 * SAY it is sponsored — which it does in the row, not as a heading above the band — and the offer must be
 * the one that was actually agreed. A discount code that
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
  /*
 * THE DISCLOSURE MOVED, AND BOTH HALVES OF THAT ARE ASSERTED.
 *
 * It is in the offer row now, beside the code. It was an uppercase `SPONSORED` label in the band head,
 * directly above the colophon's own `ENGINEERED & MAINTAINED BY` strip — and two stacked labels read as
 * one heading over both rows, which put the studio's name under a paid heading. So the assertion is not
 * just "the word is somewhere": it is present *where it applies*, absent as a heading above the row, and
 * still declared for a screen reader, which never sees the layout that caused the misreading in the first
 * place.
 */
check('it is disclosed in the row it describes', home.includes('class="sponsor-disclosure"'), 'affiliate link');
check('nothing above the row reads as a heading over it', !/>Sponsored</.test(home));
check('the region still names itself for a screen reader', /aria-label="Sponsored/.test(home), 'aria-label');
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
   * AND IT IS THE LAST ROW ON THE PAGE.
   *
   * It was given its own band so it would not read as part of the site's colophon — the footer's list of
   * the domain and where else the work lives — because a paid arrangement in that list would be posing as
   * one of them, which is the exact thing the "Sponsored" label exists to prevent. The old assertion was
   * "above the footer".
   *
   * The footer has since gone: it repeated the masthead's own nav cell for cell, and the catalog's
   * "Elsewhere" band carries the same two platform links with a handle each. So the assertion becomes
   * "nothing below it", and the one thing the band must not do — sit in a list of the site's own facts —
   * is now impossible rather than merely arranged against.
   *
   * Asserted on position rather than by eye. An extra row appended after this one would look
   * unremarkable, and it would quietly turn a paid band into the second-to-last item on a page whose foot
   * nobody has looked at.
   */
  const sponsorAt = home.indexOf('class="sponsor"');
  const colophonAt = home.indexOf('class="colophon"');
  check(
    'the redundant footer is still gone',
    !home.includes('class="footer"'),
    home.includes('class="footer"') ? 'class="footer" is back in the markup' : 'no repeating colophon row',
  );
  check(
    'the band sits above the colophon, rather than being the last row itself',
    sponsorAt !== -1 && colophonAt !== -1 && sponsorAt < colophonAt,
    sponsorAt === -1 ? 'no sponsor band found' : colophonAt === -1 ? 'no colophon found' : 'band first',
  );
} else {
  console.log('  .   no sponsor in the manifest -- skipping the sponsor assertions');
}

console.log('\n== the colophon, and why it is not the footer coming back ==');
/*
 * A ROW THAT REPEATS A ROW IS FURNITURE. THAT IS THE WHOLE TEST, AND IT IS ASSERTED DIRECTLY.
 *
 * The footer removed from this site said `ellipog.dev` and then repeated the two platform links and
 * `Docs` — all of which the masthead's own nav already carries on every page, and two of which the
 * catalog's "Elsewhere" band carries with a handle each. This row says something nothing else says: who
 * publishes the site. So the assertion that keeps them apart is not "a footer exists" or "it does not" —
 * it is that **the platform domains appear nowhere inside this row.** That is the specific thing that was
 * wrong, and it is the specific thing a future edit would put back if it treated this as a footer to fill
 * up.
 *
 * The rest is the usual shape for a link in a band: the wording matches the manifest so the page cannot
 * drift from the data, the destination is the manifest's URL, and it opens away from the site.
 */
const studio = manifest.studio;

if (studio) {
  /*
   * The visible row, not the raw file.
   *
   * Next serialises its whole render tree into a `<script>` at the end of `<body>`, so everything after
   * the colophon in the *raw* bytes is a JSON copy of the page — including the masthead's own Modrinth and
   * CurseForge hrefs. Slicing from the raw file would therefore fail the "does not repeat those links"
   * assertion below on the strength of a string that exists only in the payload and never renders, which
   * is the exact failure `withoutScripts` was written for.
   */
  const visible = withoutScripts(home ?? '');
  const at = visible.indexOf('class="colophon"');
  const colophon = at === -1 ? '' : visible.slice(at);
  const docsWithColophon = read(`${OUT}/docs/tasked/index.html`) ?? '';

  check('the colophon renders', at !== -1);
  check('it says who engineers and maintains the site', home.includes(studio.name), studio.name);
  /*
   * The wording is compared **escaped**, and that is not fussiness: `label` is text in the manifest and
   * escaped text in the markup, so a literal substring compare passes on `Presented by` and fails the
   * moment the sentence contains an `&` — which "Engineered & maintained by" does. The alternative would
   * be to avoid `&` in the label, which would be letting the assertion dictate the copy.
   */
  check('its wording matches the manifest', home.includes(escapeHtml(studio.label)), studio.label);
  check('it links to the studio', home.includes(studio.url), studio.url);
  check(
    'the link opens away from the site',
    /class="colophon-link"[^>]*target="_blank"/.test(home) &&
      /class="colophon-link"[^>]*rel="noreferrer noopener"/.test(home),
    'target=_blank and rel=noreferrer noopener',
  );

  /*
   * THE ROW SHOWS THE DOMAIN AS WELL AS LINKING TO IT, so the host must appear exactly twice in it: once in
   * the `href`, once as the visible text. A third copy is the thing being guarded against — a label typed
   * beside the link instead of derived from it, which is two strings that can disagree and no way to tell
   * from the page which one is right.
   *
   * A count rather than a substring, because a substring passes just as happily when the domain is written
   * in both places. And a count rather than a `src` inspection, because what matters is the built HTML.
   */
  const host = studio.url.replace(/^https?:\/\//, '');
  const hostHits = (colophon.match(new RegExp(host.replace(/[.]/g, '\\.'), 'g')) ?? []).length;
  check('the domain is shown once, not typed twice', hostHits === 2, `${hostHits} occurrence(s): href + text`);

  check(
    'it does not repeat the links the removed footer repeated',
    !/modrinth\.com|curseforge\.com/i.test(colophon),
    'no platform links in the row',
  );

  /*
   * The mark, and the one thing about it that is easy to get wrong.
   *
   * It is the same element the masthead uses, so it follows the theme with no second rule — and the row
   * inverts on hover, which means the *file* has to change for the duration. A raster cannot follow an
   * inverting ground by itself, and getting it wrong is invisible rather than merely off: the ink and the
   * ground become the same colour. Both halves are asserted because a single rule would be right in one
   * theme and wrong in the other.
   */
  check(
    'the colophon carries the studio mark',
    /class="colophon"[\s\S]{0,220}<span class="site-mark"/.test(visible),
    'the same .site-mark as the masthead',
  );
  const hoverRule = declarationsFor(allCss, '.colophon-link:hover .site-mark');
  const darkHoverRule = declarationsFor(allCss, '[data-theme="dark"] .colophon-link:hover .site-mark');

  check(
    'the mark goes light on the inverted ground, which is dark',
    hoverRule.includes('mark-on-dark'),
    hoverRule || 'no rule',
  );
  check(
    'and back to dark ink in the dark theme, where the inversion is the other way round',
    darkHoverRule.includes('mark-on-light'),
    darkHoverRule || 'no rule',
  );

  // In the root layout, so every page carries it -- the same thing proved for the band above.
  check('the colophon is on the docs pages too', docsWithColophon.includes('class="colophon"'));
} else {
  console.log('  .   no studio in the manifest -- skipping the colophon assertions');
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

console.log('\n== the site mark, and the two jobs it does ==');
/*
 * THE IDENTITY HERE IS COPIED FROM ANOTHER REPOSITORY THIS BUILD CANNOT REACH.
 *
 * The two PNGs under `apps/docs/public/site/` are the same files as `aaenz/public/assets/logo-mark.png`
 * and `logo-mark-light.png`, byte for byte, and `aaenz` is a **separate checkout with no route into it
 * from here**. There is nothing to regenerate them from and nothing to compare them against, so these
 * copies are the one arrangement on this site with no guard behind them — and no assertion can invent one.
 * Change a file there and change it here.
 *
 * **Both jobs on the site draw from this one pair**: the mark beside the wordmark, and the tab icon. There
 * used to be a third file for the tab — `public/favicon.svg`, the same drawing at a heavier weight with a
 * paper plate — and the assertions below are partly what keep it from coming back.
 *
 * What CAN be asserted is everything short of the copy itself: that both files are committed, that the
 * build copied each through **unchanged** — the only thing standing between "the two repositories agree"
 * and "they agreed the day this was written" — that both rules and both `<link>`s reference them, and
 * everything about the drawing that is invisible when it is wrong. See the note below on the ink.
 */

/*
 * THE MARK IS TWO HAND-SUPPLIED PNGs, AND THE THREE THINGS THAT MATTER ABOUT THEM ARE ALL INVISIBLE
 * WHEN THEY ARE WRONG.
 *
 * `mark-on-light.png` is the studio's mark in dark ink, shown on a light ground; `mark-on-dark.png` is
 * the same drawing in light ink for the dark theme. `.site-mark` in `global.css` picks between them with
 * `[data-theme='dark']`, so one file is fetched per visitor and no JavaScript is involved — and the tab
 * names both with a `media` query each, because a `<link>` cannot read that attribute.
 *
 *   - **A swap.** Dark ink on the dark ground is a mark the same colour as the page behind it. It does
 *     not read as broken; it reads as *absent*, and the natural response is to add a fallback for a mark
 *     that is already there. This is the one worth the decoder below: the names are the opposite way
 *     round from the studio's, so the swap is a rename away at all times.
 *   - **A plate.** A file exported with its background baked in puts a rectangle of a second paper colour
 *     in the masthead. It looks like the page behind is slightly the wrong colour, not like a mistake —
 *     and the two SVG marks in this repository need a transform that exists purely to strip that.
 *   - **A size change in one file only.** Half of a two-file theme switch resizing shifts the wordmark
 *     sideways, and only for readers in one theme.
 *
 * All three are readable from the bytes, so `scripts/lib/png-ink.mjs` decodes them — the one thing in
 * this repository that parses an image rather than an SVG. It is a reader and not a transform: nothing
 * here rewrites the art, because the files are used exactly as the studio exports them, which is what
 * keeps the copies diffable against that repository by eye.
 *
 * **The one thing NOT asserted is that they are the studio's files**, because that needs the network and a
 * checkout of a different repository. `readInk` fails loudly on an unexpected format rather than skipping
 * quietly, which is the closest thing available to noticing that a human replaced the artwork.
 */
const MARK_ON_LIGHT = 'apps/docs/public/site/mark-on-light.png';
const MARK_ON_DARK = 'apps/docs/public/site/mark-on-dark.png';

const lightMark = existsSync(MARK_ON_LIGHT) ? readInk(MARK_ON_LIGHT) : null;
const darkMark = existsSync(MARK_ON_DARK) ? readInk(MARK_ON_DARK) : null;

check('the mark for a light ground is committed', Boolean(lightMark), MARK_ON_LIGHT);
check('the mark for a dark ground is committed', Boolean(darkMark), MARK_ON_DARK);

if (lightMark && darkMark) {
  // Both 28px in a box the CSS sizes, so a mismatch here is the wordmark shifting when the theme flips.
  check(
    'both are one size, so nothing moves between themes',
    lightMark.width === darkMark.width && lightMark.height === darkMark.height,
    `${lightMark.width}x${lightMark.height} / ${darkMark.width}x${darkMark.height}`,
  );

  check(
    'neither file was exported with a ground',
    [lightMark, darkMark].every((m) => m.cornerAlphas.every((a) => a === 0)),
    [lightMark, darkMark].map((m) => `corners at ${m.cornerAlphas.join('/')}`).join(' · '),
  );

  check(
    'the dark-ink mark is the one a light ground shows',
    lightMark.luminance !== null && lightMark.luminance < 0.2,
    `${lightMark.ink} · luminance ${lightMark.luminance?.toFixed(4)}`,
  );
  check(
    'the light-ink mark is the one a dark ground shows',
    darkMark.luminance !== null && darkMark.luminance > 0.8,
    `${darkMark.ink} · luminance ${darkMark.luminance?.toFixed(4)}`,
  );

  /*
   * Same drawing, same place, in both files — one artwork exported twice rather than two marks that
   * happen to be similar. A redraw of one of them is the kind of change that would otherwise pass the
   * ink check above and look wrong only to a reader who flipped the theme to compare.
   */
  const sameBox =
    lightMark.bbox !== null &&
    darkMark.bbox !== null &&
    ['minX', 'minY', 'maxX', 'maxY'].every((k) => lightMark.bbox[k] === darkMark.bbox[k]);
  check('both files draw the same mark in the same place', sameBox, JSON.stringify(lightMark.bbox));

  check(
    'both marks ship',
    existsSync(`${OUT}/site/mark-on-light.png`) && existsSync(`${OUT}/site/mark-on-dark.png`),
  );
  check(
    'the build copied them through unchanged',
    readFileSync(MARK_ON_LIGHT).equals(readFileSync(`${OUT}/site/mark-on-light.png`)) &&
      readFileSync(MARK_ON_DARK).equals(readFileSync(`${OUT}/site/mark-on-dark.png`)),
  );
}

/*
 * THE SAME PAIR AS THE TAB ICON, WHICH IS THE SECOND JOB — and the one place a `<link>` cannot do what the
 * CSS does.
 *
 * A favicon has no CSS, so it cannot read the `data-theme` attribute the masthead switches on. `layout.tsx`
 * therefore declares both files with a `media` query each: resolved before first paint, from the same OS
 * preference the theme toggle falls back to. It does **not** follow the toggle — a reader who overrode
 * their OS preference gets a tab matching their OS and a page matching the toggle, and there is no fix,
 * because a `<link>` cannot be styled. Recorded in AGENT.md so it is not discovered as a bug.
 *
 * **Order matters, and is asserted.** A consumer that ignores `media` — anything before Safari 15, and
 * some crawlers — takes the last icon it can use, so the light-ground file has to be last: the failure is
 * then a mark on the darker ground rather than no mark at all.
 */
const iconTags = [...(home ?? '').matchAll(/<link rel="icon"[^>]*>/g)].map((m) => m[0].replace(/\s+/g, ''));
const iconTagFor = (file) => iconTags.find((tag) => tag.includes(file)) ?? null;

check('the tab names two icons, one per theme', iconTags.length === 2, `${iconTags.length} <link rel="icon">`);
check(
  'a light theme asks for the dark-ink mark',
  Boolean(iconTagFor('mark-on-light.png')?.includes('media="(prefers-color-scheme:light)"')),
  iconTagFor('mark-on-light.png') ?? 'no link names it',
);
check(
  'a dark theme asks for the light-ink mark',
  Boolean(iconTagFor('mark-on-dark.png')?.includes('media="(prefers-color-scheme:dark)"')),
  iconTagFor('mark-on-dark.png') ?? 'no link names it',
);
check(
  'the light-ground mark is listed last, for anything that ignores media',
  iconTags[iconTags.length - 1]?.includes('mark-on-light.png') ?? false,
  iconTags.map((t) => t.match(/href="([^"]+)"/)?.[1] ?? '?').join(', ') || 'none',
);

/*
 * The plated SVG this replaced, and this is worth an assertion rather than a deletion.
 *
 * A file at `public/favicon.svg` would be served at the path a browser asks for **by itself**, which is not
 * a path this page names. So a leftover would quietly win the tab in some browsers and lose it in others,
 * depending on whether the reader's browser reaches for /favicon.ico first — the worst kind of thing to
 * leave behind, because which one you see depends on you.
 */
check(
  'the plated favicon that this replaced is gone',
  !existsSync('apps/docs/public/favicon.svg') && !existsSync(`${OUT}/favicon.svg`),
  'nothing at /favicon.svg',
);
check('no page asks for it any more', !(home ?? '').includes('favicon.svg'), 'no /favicon.svg reference');

/*
 * The markup, and the one deliberate departure in it.
 *
 * Every other mark on this site is an inlined `<svg>` — and that is not decoration, it is the only way
 * `currentColor` and `var(--icon-ground)` reach a glyph, since an SVG inside an `<img>` is a separate
 * document that cannot see the page's CSS. **A raster cannot take `currentColor` at all**, so neither
 * applies, and inlining one would gain nothing while costing a third more bytes again.
 *
 * So this is a `<span>` with a background image, which is what makes one file per visitor possible: an
 * `<img>` would need two elements with one `display: none`, and a `display: none` image is still fetched
 * — 49KB of PNG for a 28px mark on every page. Asserted because it reverses a rule stated everywhere
 * else in this repository, and a reader will want to know that it was decided rather than overlooked.
 */
check(
  'the mark is a styled span in both places, not <img>s',
  (withoutScripts(home ?? '').match(/<span class="site-mark"/g) ?? []).length === 2,
  'the masthead and the colophon',
);
check('no mark is loaded as an <img>', !/<img[^>]*site\//.test(home ?? ''));
check(
  'both rules are in the built CSS',
  /site\/mark-on-light\.png/.test(allCss) && /site\/mark-on-dark\.png/.test(allCss),
);
const baseRule = declarationsFor(allCss, '.site-mark');
const darkRule = declarationsFor(allCss, '[data-theme="dark"] .site-mark');

check('the un-overridden rule is the one for a light ground', baseRule.includes('mark-on-light'), baseRule || 'no rule');
check('the dark rule overrides it, rather than the other way round', darkRule.includes('mark-on-dark'), darkRule || 'no rule');
// Both dimensions, so the box is reserved before the image loads and nothing shifts under the name.
check(
  'the mark box is reserved',
  /width:28px/.test(baseRule) && /height:28px/.test(baseRule),
  baseRule || 'no rule',
);

/*
 * THE AVATAR IS RETIRED, AND ASSERTED RATHER THAN ASSUMED.
 *
 * It was a build-time download of the Modrinth profile picture: a photograph of a person standing in for
 * the site, the only mark on the page with no dark variant, and the only one that could disappear when a
 * fetch failed. A committed file cannot go missing the way a fetched `avatar.webp` could, so the failure
 * mode went with it — and this is what keeps it from drifting back in as a "fallback".
 */
check(
  'the Modrinth avatar is retired',
  !existsSync('apps/docs/public/avatar.webp') && !existsSync('apps/docs/public/avatar.png'),
  'nothing left in apps/docs/public/',
);
check('nothing asks for the avatar any more', !/\/avatar\./.test(home ?? ''), 'no /avatar.* request');

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
