// Remove the scratch scripts I just committed, push, then reproduce a Vercel build.
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

const SITE = 'C:/Users/Ellio/Documents/GitHub/minecraft/ellipog.dev';

const run = (cmd, args, cwd = SITE, opts = {}) => {
  const out = execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: opts.inherit ? 'inherit' : 'pipe' });
  return (out ?? '').trim();
};

/* 1. My own scratch files, which `check.mjs` correctly rejects. */
console.log('=== removing scratch scripts ===');
for (const f of ['_fix1.mjs', '_fix2.mjs']) {
  const path = `${SITE}/scripts/${f}`;
  if (existsSync(path)) {
    rmSync(path, { force: true });
    console.log(`  deleted scripts/${f}`);
  }
}

console.log('\n=== committing the cleanup ===');
run('git', ['add', '-A']);
run('git', ['commit', '-m', 'chore: remove the scratch migration scripts\n\nThey were helpers for the pin bump and the log cleanup, and check.mjs fails on any\nscripts/_* file on purpose -- a scratch tool left behind is a tool somebody else has\nto work out the purpose of.']);
run('git', ['push', 'origin', 'HEAD']);
console.log(`  HEAD  ${run('git', ['rev-parse', '--short', 'HEAD'])}`);

/*
 * 2. THE TEST THAT MATTERS.
 *
 * `ELLIPOG_USE_PINS=1` makes the sync ignore the sibling folders and read from the pinned commits —
 * which is exactly what a build server sees, because a fresh clone has no siblings. Every local build
 * so far has read the working tree, which is why a stale pin passed here and failed on Vercel.
 *
 * This is the only local test that can predict a deploy.
 */
console.log('\n\n==============================================================');
console.log('  BUILDING AS VERCEL DOES  (ELLIPOG_USE_PINS=1)');
console.log('==============================================================\n');

try {
  const out = execFileSync('bun', ['run', 'build'], {
    cwd: SITE,
    encoding: 'utf8',
    env: { ...process.env, ELLIPOG_USE_PINS: '1' },
    stdio: 'pipe',
  });

  const lines = out.split(/\r?\n/);
  const pins = lines.filter((l) => /from [0-9a-f]{7}/.test(l));
  const fails = lines.filter((l) => l.startsWith(' FAIL'));
  const oks = lines.filter((l) => l.startsWith('  ok'));
  const verdict = lines.filter((l) => /ALL CHECKS PASSED|FAILURE\(S\)/.test(l));

  console.log('pins used:');
  for (const p of pins) console.log(p);

  console.log(`\nok: ${oks.length}   FAIL: ${fails.length}`);
  for (const f of fails) console.log(f);
  console.log('\n' + verdict.join('\n'));
  console.log(`\n=== VERDICT: a Vercel build of this commit would ${fails.length === 0 ? 'SUCCEED' : 'FAIL'} ===`);
} catch (err) {
  const out = `${err.stdout ?? ''}${err.stderr ?? ''}`;
  const lines = out.split(/\r?\n/);

  console.log('pins used:');
  for (const p of lines.filter((l) => /from [0-9a-f]{7}/.test(l))) console.log(p);

  const fails = lines.filter((l) => l.startsWith(' FAIL'));
  console.log(`\nFAIL: ${fails.length}`);
  for (const f of fails) console.log(f);

  console.log('\n--- last 30 lines ---');
  console.log(lines.slice(-30).join('\n'));
  console.log(`\n=== VERDICT: a Vercel build of this commit would FAIL ===`);
}
