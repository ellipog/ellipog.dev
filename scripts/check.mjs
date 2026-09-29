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

import { existsSync, readFileSync, readdirSync } from 'node:fs';

const OUT = 'apps/docs/out';
const CHUNKS = `${OUT}/_next/static/chunks`;

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
  // Nothing is active until the reader scrolls, so a server-rendered marker would be a lie.
  check('no section is marked current before scrolling', !html.includes('aria-current="location"'));
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
  check('/docs/ lists Tasked', docsIndex.includes('>Tasked<'));
  check('/docs/ lists Armature', docsIndex.includes('>Armature<'));
  // The list is generated from what synced, so a page that does not exist cannot be in it.
  check('/docs/ does not list a page that is not there', !docsIndex.includes('design-preview'));
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

console.log('\n== nothing generated leaked into the repo ==');
const strays = [
  ...readdirSync('scripts').filter((f) => /^_/.test(f)),
  ...readdirSync('apps/docs/public').filter((f) => /^_/.test(f)),
  ...(existsSync('.') ? readdirSync('.').filter((f) => /\.html$/.test(f)) : []),
];
check('no probe files left', strays.length === 0, strays.join(', '));

console.log('\n== the manifest and the numbers agree ==');
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const stats = JSON.parse(readFileSync('apps/docs/stats.json', 'utf8'));
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
notes.push(`totals: modrinth ${stats.totals.modrinth}, curseforge ${stats.totals.curseforge}, all ${stats.totals.all}`);
for (const n of stats.notes ?? []) notes.push(n);

console.log('\n== notes ==');
for (const n of notes) console.log(`  . ${n}`);

console.log(
  `\n\n${failures.length === 0 ? 'ALL CHECKS PASSED' : `${failures.length} FAILURE(S): ${failures.join('; ')}`}\n`,
);
process.exitCode = failures.length === 0 ? 0 : 1;
