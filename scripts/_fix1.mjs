// Commit the uncommitted docs in `tasked`, then report its new HEAD.
// A script file rather than inline shell: every quoted command today has been mangled.
import { execFileSync } from 'node:child_process';

const TASKED = 'C:/Users/Ellio/Documents/GitHub/minecraft/tasked';

const git = (args, cwd = TASKED, quiet = false) => {
  const out = execFileSync('git', args, { cwd, encoding: 'utf8', stdio: quiet ? 'pipe' : 'inherit' });
  return (out ?? '').trim();
};

console.log('=== before ===');
console.log(`  HEAD  ${git(['rev-parse', '--short', 'HEAD'], TASKED, true)}`);
console.log(`  dirty: ${git(['status', '--porcelain', '--', 'docs'], TASKED, true) || '(clean)'}`);

/*
 * Only `docs/` is staged. The rest of the working tree — twelve paths — is unrelated work in progress,
 * and committing it would put somebody else's half-finished changes into a commit I wrote the message for.
 */
console.log('\n=== staging docs/ only ===');
git(['add', '--', 'docs']);

const staged = git(['diff', '--cached', '--name-only'], TASKED, true);
console.log(staged ? `  staged:\n${staged.split('\n').map((l) => `    ${l}`).join('\n')}` : '  nothing staged');

if (!staged) {
  console.log('\n  nothing to commit — the pin may already be current');
  process.exit(0);
}

const message = [
  'docs: add a design preview page',
  '',
  'Exercises every element the documentation site can render — cross-mod links, glossary terms,',
  'callouts, loader tabs, steps, tables, collapsed detail and the page furniture — so the design',
  'can be judged against real content rather than against two short documents.',
  '',
  'It is a fixture, and deleting it once the authoring guide covers the same ground is fine: the',
  "site's check script skips its assertions when the page is absent.",
].join('\n');

console.log('\n=== committing ===');
git(['commit', '-m', message]);

console.log('\n=== pushing ===');
git(['push', 'origin', 'HEAD']);

const head = git(['rev-parse', 'HEAD'], TASKED, true);
console.log(`\n=== after ===\n  HEAD  ${head.slice(0, 7)}\n  ${head}`);
