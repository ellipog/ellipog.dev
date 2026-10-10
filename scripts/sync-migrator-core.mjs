/**
 * Vendor a verbatim snapshot of @ellipog/migrator-core into apps/migrator/vendor.
 *
 * Why a copy instead of a `file:` dependency: the core lives outside this workspace
 * (../../migrator), so a `file:` dep breaks when Vercel roots at ellipog.dev — and bun
 * copies (rather than links) out-of-workspace file deps, which trips Windows EPERM on
 * the core's nested node_modules. A committed snapshot keeps this app self-contained
 * and its builds reproducible.
 *
 * This is NOT a fork: only `src/` (plus the version) is copied, never edited by hand.
 * `check` below refuses drift — re-run `bun scripts/sync-migrator-core.mjs` after any
 * core change and commit the result. Run: bun scripts/sync-migrator-core.mjs [--check]
 */
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const SRC = join(ROOT, '..', 'migrator', 'packages', 'migrator-core', 'src');
const DEST = join(ROOT, 'apps', 'migrator', 'vendor', 'migrator-core');
const STAMP = join(DEST, 'STAMP.json');

function listFiles(dir, base = '') {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const rel = base === '' ? name : `${base}/${name}`;
    if (statSync(full).isDirectory()) out.push(...listFiles(full, rel));
    else out.push(rel);
  }
  return out;
}

function hashTree(dir) {
  const hash = createHash('sha256');
  for (const rel of listFiles(dir)) {
    hash.update(rel);
    hash.update(readFileSync(join(dir, rel)));
  }
  return hash.digest('hex');
}

const checkOnly = process.argv.includes('--check');

if (!existsSync(SRC)) {
  console.error(`core not found at ${SRC} — nothing vendored`);
  process.exit(1);
}

const fingerprint = hashTree(SRC);

if (checkOnly) {
  if (!existsSync(STAMP)) {
    console.error('vendor STAMP.json missing — run sync first');
    process.exit(1);
  }
  const stamp = JSON.parse(readFileSync(STAMP, 'utf8'));
  if (stamp.fingerprint !== fingerprint) {
    console.error(`drift: vendor is ${stamp.fingerprint.slice(0, 12)}…, core is ${fingerprint.slice(0, 12)}… — run bun scripts/sync-migrator-core.mjs`);
    process.exit(1);
  }
  console.log(`vendor in sync (${fingerprint.slice(0, 12)}…)`);
  process.exit(0);
}

rmSync(DEST, { recursive: true, force: true });
mkdirSync(DEST, { recursive: true });
cpSync(SRC, join(DEST, 'src'), { recursive: true });

// Extensionless relative imports: the core writes ESM-style `./snbt.js` (NodeNext),
// which tsc/bundler resolves to .ts but Turbopack (Next 16) does not. The rewrite is
// mechanical (only relative `.js` → same path, real `.json` imports untouched) so the
// snapshot builds under tsc, Turbopack and bun alike. Never hand-edit vendor/.
let rewritten = 0;
for (const rel of listFiles(join(DEST, 'src'))) {
  if (!rel.endsWith('.ts')) continue;
  const full = join(DEST, 'src', rel);
  const before = readFileSync(full, 'utf8');
  const after = before.replace(/((?:from|import)\s*\(?\s*['"])(\.[^'"]*?)\.js(['"])/g, '$1$2$3');
  if (after !== before) {
    writeFileSync(full, after);
    rewritten++;
  }
}

let version = '0.0.0';
try {
  version = JSON.parse(readFileSync(join(SRC, '..', 'package.json'), 'utf8')).version ?? version;
} catch { /* keep default */ }

writeFileSync(
  STAMP,
  `${JSON.stringify({ source: '../../migrator/packages/migrator-core', version, fingerprint, files: listFiles(join(DEST, 'src')).length }, null, 2)}\n`,
);
console.log(`vendored ${listFiles(join(DEST, 'src')).length} files @${version} (${fingerprint.slice(0, 12)}…)`);
