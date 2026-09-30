// Bump the pins, drop the committed build logs, commit and push ellipog.dev.
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

const SITE = 'C:/Users/Ellio/Documents/GitHub/minecraft/ellipog.dev';

const run = (cmd, args, cwd = SITE, { quiet = false } = {}) => {
  const out = execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: quiet ? 'pipe' : 'inherit' });
  return (out ?? '').trim();
};

/* 1. The pin. */
console.log('=== bumping the pins ===');
run('bun', ['run', 'pins', '--write']);

/* 2. Build logs that got committed. They are regenerable output, and one of them was tracked. */
console.log('\n=== build logs ===');
const LOGS = ['bl.txt', 'blog.txt', 'c.txt', 'chk.txt', 'ck.txt', 'v.txt', 'vb.txt', 'last.txt'];
for (const log of LOGS) {
  if (existsSync(`${SITE}/${log}`)) {
    rmSync(`${SITE}/${log}`, { force: true });
    console.log(`  deleted ${log}`);
  }
  // `git rm --cached` on a file that is already gone is still needed to untrack it.
  try {
    run('git', ['rm', '--cached', '--quiet', '--', log], SITE, { quiet: true });
    console.log(`  untracked ${log}`);
  } catch {
    /* not tracked, which is the normal case */
  }
}

/* 3. Everything else. */
console.log('\n=== staging ===');
run('git', ['add', '-A']);
console.log(run('git', ['diff', '--cached', '--name-status'], SITE, { quiet: true }));

const message = [
  'feat: monochrome the brand mark, add a trust badge, fix the deploy',
  '',
  'vercel.json: drop the "/*" comment key. Vercel validates that file against a published schema',
  'with additionalProperties: false, so an unknown key is a rejected deploy rather than a warning.',
  'The reasoning it carried moved into AGENT.md, which had no deploy section at all, and check.mjs',
  'now guards both halves.',
  '',
  'The host logo is now a single monochrome glyph, inlined like the mod icons. Its source had a',
  '<style> block that would have leaked into the page, two near-identical blacks that needed',
  'clustering into one rank, and a cyan that is structurally the ground rather than a tone. That',
  'retired a light/dark file pair and four CSS rules that switched between them.',
  '',
  'A small "Partner" chip sits beside the host name. Not "Verified": BisectHosting run a Partner',
  'Program and an Affiliate Program, and neither of their pages uses that word.',
  '',
  'The shared transform lives in scripts/lib/monochrome.mjs, used by icons.mjs and brand.mjs. The',
  'five mod glyphs regenerate byte-identical, which is how we know the extraction changed nothing.',
  '',
  'Also drops the build logs that had been committed to git, and adds reset.mjs.',
].join('\n');

console.log('\n=== committing ===');
run('git', ['commit', '-m', message]);

console.log('\n=== pushing ===');
run('git', ['push', 'origin', 'HEAD']);

const head = run('git', ['rev-parse', 'HEAD'], SITE, { quiet: true });
console.log(`\n=== after ===\n  HEAD  ${head.slice(0, 7)}`);
