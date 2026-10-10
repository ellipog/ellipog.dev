/**
 * ATM10 end-to-end: the real pack through the app's own convertVfs (the exact
 * function the Web Worker runs), twice for determinism, plus strict mode and a
 * simulated whole-instance drop. Run: bun scripts/e2e-atm10.mjs
 *
 * Not committed as a test: it needs the 37 MB Modrinth pack on disk
 * (ATM10_QUESTS override or the known profile path). Browser click-through
 * (drop → download, zero console errors) stays a manual acceptance step.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { convertVfs, DEFAULT_OPTIONS } from '../apps/migrator/lib/pipeline.ts';
import { placedToZipBlob } from '../apps/migrator/lib/zip.ts';
import { normalizePath } from '../apps/migrator/lib/core.ts';

const CANDIDATES = [
  process.env['ATM10_QUESTS'] ?? '',
  'C:/Users/Ellio/AppData/Roaming/ModrinthApp/profiles/All the Mods 10 - ATM10 (1)/config/ftbquests/quests',
  'C:/Users/Ellio/AppData/Roaming/ModrinthApp/profiles/All the Mods 10 - ATM10/config/ftbquests/quests',
].filter(Boolean);

const ROOT = CANDIDATES.find((dir) => {
  try {
    return statSync(join(dir, 'data.snbt')).isFile();
  } catch {
    return false;
  }
});

if (!ROOT) {
  console.error(`no ATM10 pack (tried ${CANDIDATES.join(', ')})`);
  process.exit(2);
}

function walk(dir, base, out) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const rel = base === '' ? name : `${base}/${name}`;
    if (statSync(full).isDirectory()) walk(full, rel, out);
    else out.push({ path: normalizePath(rel), bytes: new Uint8Array(readFileSync(full)) });
  }
  return out;
}

const sha = async (blob) =>
  createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex');

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

const bare = walk(ROOT, '', []);

// 1. Bare quest-folder drop, default options.
const first = await convertVfs(bare, DEFAULT_OPTIONS);
check('bare drop converts', !first.failed, first.fatal ?? '');
check('no errors', first.errors === 0, `${first.errors} errors`);
console.log(`       in=${first.filesIn} out=${first.filesOut} warnings=${first.warnings} notes=${first.notes}`);
console.log(`       evidence: ${first.evidence}`);
check('index.json emitted', first.placed.some((f) => f.path === 'index.json'));
check('ids.json emitted', first.placed.some((f) => f.path === '_migrator/ids.json'));
check('report files emitted', first.placed.some((f) => f.path === '_migrator/report.json'));

// 2. Determinism: second run byte-identical.
const second = await convertVfs(bare, DEFAULT_OPTIONS);
const [za, zb] = await Promise.all([placedToZipBlob(first.placed), placedToZipBlob(second.placed)]);
const [ha, hb] = await Promise.all([sha(za), sha(zb)]);
check('re-run byte-identical', ha === hb, `sha256 ${String(ha).slice(0, 16)}… vs ${String(hb).slice(0, 16)}… (${za.size} bytes)`);

// 3. Strict mode reports (fails only if the pack has warnings — informational here).
const strict = await convertVfs(bare, { ...DEFAULT_OPTIONS, strict: true });
console.log(`       strict: failed=${strict.failed} warnings=${strict.warnings} notes=${strict.notes}`);

// 4. Whole-instance simulation: book nested + unrelated files preserved.
const nested = [
  ...bare.map((f) => ({ path: `config/ftbquests/quests/${f.path}`, bytes: f.bytes })),
  { path: 'config/other-mod/settings.json', bytes: new TextEncoder().encode('{"keep":true}\n') },
  { path: 'mods/list.txt', bytes: new TextEncoder().encode('tenet-0.1.5\n') },
];
const whole = await convertVfs(nested, DEFAULT_OPTIONS);
check('whole-instance converts', !whole.failed, whole.fatal ?? '');
check('book found where it lives', whole.detectedRoot === 'config/ftbquests/quests', whole.detectedRoot);
check('output mirrored', whole.outputRoot === 'config/tenet/quests', whole.outputRoot);
const kept = whole.placed.find((f) => f.path === 'config/other-mod/settings.json');
check(
  'unrelated files byte-identical',
  kept !== undefined && new TextDecoder().decode(kept.bytes) === '{"keep":true}\n',
);
check(
  'source kept by default',
  whole.placed.some((f) => f.path === 'config/ftbquests/quests/data.snbt'),
);

// 5. keepSource=false drops the original subtree.
const replaced = await convertVfs(nested, { ...DEFAULT_OPTIONS, keepSource: false });
check(
  'remove-source drops the subtree',
  !replaced.failed && !replaced.placed.some((f) => f.path.startsWith('config/ftbquests/')),
  `${replaced.placed.length} files`,
);

// 6. ftbquests-folder drop: the book nested one level deep plus a stray README.
const ftbq = [
  ...bare.map((f) => ({ path: `quests/${f.path}`, bytes: f.bytes })),
  { path: 'quests/README.md', bytes: new TextEncoder().encode('# quests\n') },
];
const picked = await convertVfs(ftbq, DEFAULT_OPTIONS);
check('ftbquests folder converts', !picked.failed, picked.fatal ?? '');
check('nested book detected', picked.detectedRoot === 'quests', picked.detectedRoot);
check('stray README passes through', picked.placed.some((f) => f.path === 'quests/README.md'));

// 7. Profile-depth drop with a skipped giant: book deep, jars listed not copied.
const deep = [
  ...bare.map((f) => ({ path: `config/ftbquests/quests/${f.path}`, bytes: f.bytes })),
  { path: 'config/other-mod/settings.json', bytes: new TextEncoder().encode('{}\n') },
];
const giants = [{ path: 'mods/huge.jar', size: 500 * 1024 * 1024, reason: 'test giant' }];
const profile = await convertVfs(deep, DEFAULT_OPTIONS, undefined, () => {}, giants);
check('profile-depth converts', !profile.failed, profile.fatal ?? '');
const skipNotes = profile.reportJson.entries.filter((e) => e.code === 'passthrough-skipped');
check('giant accounted in report', skipNotes.length === 1 && skipNotes[0].path === 'mods/huge.jar');

// 8. Already-migrated input: refused by default, force re-converts cleanly.
const redo = first.placed.map((f) => ({
  path: f.path,
  bytes: f.text !== undefined ? new TextEncoder().encode(f.text) : f.bytes,
}));
const refused = await convertVfs(redo, DEFAULT_OPTIONS);
check(
  'migrated input refused',
  refused.failed && refused.reportJson.entries.some((e) => e.code === 'already-migrated'),
);
const forced = await convertVfs(redo, { ...DEFAULT_OPTIONS, force: true });
check('force re-converts', !forced.failed, forced.fatal ?? '');
const outPaths = forced.placed.map((f) => f.path);
check('no duplicated paths', new Set(outPaths).size === outPaths.length);
check(
  'stale outputs replaced',
  forced.reportJson.entries.some((e) => e.code === 'replaced-output'),
);

process.exit(failures === 0 ? 0 : 1);
