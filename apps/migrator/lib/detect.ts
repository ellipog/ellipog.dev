/**
 * Detection: find quest-book roots in a virtual file tree, without owning any
 * profile-specific mapping. v1 ships one profile (FTB Quests 1.21.1 → Tenet);
 * the registry shape stays so future profiles plug in without touching the shell.
 */
import { normalizePath } from './core';
import type { VfsFile } from './core';

export const PROFILE_ID = 'ftbquests-1.21.1-to-tenet';
export const PROFILE_NAME = 'FTB Quests → Tenet';

export interface Detection {
  readonly profileId: string;
  /** The book root, POSIX with no trailing slash; "" when the drop IS the book. */
  readonly root: string;
  readonly confidence: 'high' | 'medium' | 'low';
  /** Human evidence, e.g. "found data.snbt + chapters/ in config/ftbquests/quests/". */
  readonly evidence: string;
  readonly markers: ReadonlyArray<string>;
}

/** Every file under `prefix/` ("" matches everything). */
function under(files: ReadonlyArray<VfsFile>, prefix: string): ReadonlyArray<VfsFile> {
  if (prefix === '') return files;
  const root = `${prefix}/`;
  return files.filter((f) => f.path === prefix || f.path.startsWith(root));
}

function basename(path: string): string {
  const cut = path.lastIndexOf('/');
  return cut < 0 ? path : path.slice(cut + 1);
}

function parentDir(path: string): string {
  const cut = path.lastIndexOf('/');
  return cut < 0 ? '' : path.slice(0, cut);
}

/**
 * Find every directory holding a `data.snbt` and grade it: +chapters/ and
 * +reward_tables/ raise confidence, lang/ is supporting evidence. Two books in
 * one drop each get a Detection; the UI defaults to the first high-confidence
 * hit and always offers the manual override.
 */
export function detectBooks(files: ReadonlyArray<VfsFile>): Array<Detection> {
  const dataFiles = files.filter((f) => basename(f.path) === 'data.snbt');
  const out: Array<Detection> = [];
  for (const data of dataFiles) {
    const root = parentDir(data.path);
    const members = under(files, root);
    const has = (dir: string): boolean =>
      members.some((f) => f.path === `${root === '' ? '' : `${root}/`}${dir}` || f.path.startsWith(`${root === '' ? '' : `${root}/`}${dir}/`));
    const markers: Array<string> = ['data.snbt'];
    if (has('chapters')) markers.push('chapters/');
    if (has('reward_tables')) markers.push('reward_tables/');
    if (has('lang')) markers.push('lang/');
    const confidence = markers.includes('chapters/') && markers.includes('reward_tables/')
      ? 'high'
      : markers.length >= 2
        ? 'medium'
        : 'low';
    const where = root === '' ? 'the dropped folder' : `\`${root}/\``;
    out.push({
      profileId: PROFILE_ID,
      root,
      confidence,
      evidence: `found ${markers.join(' + ')} in ${where}`,
      markers,
    });
  }
  out.sort((a, b) => (a.root < b.root ? -1 : a.root > b.root ? 1 : 0));
  return out;
}

/**
 * Already-migrated input: a Tenet book layout (index.json beside chapter files)
 * or a previous run's `_migrator/` marker. Refuse with a clear message rather
 * than converting Tenet back into itself.
 */
export function alreadyMigrated(files: ReadonlyArray<VfsFile>): string | null {
  const index = files.find((f) => basename(f.path) === 'index.json');
  if (index !== undefined) {
    try {
      const parsed = JSON.parse(new TextDecoder().decode(index.bytes)) as unknown;
      if (parsed !== null && typeof parsed === 'object' && 'settings' in parsed && 'entries' in parsed) {
        return `looks already migrated (${index.path} is a Tenet book index)`;
      }
    } catch {
      // Not JSON — not a Tenet index; fall through to the marker check.
    }
  }
  const marker = files.find((f) => f.path.includes('_migrator/'));
  if (marker !== undefined) {
    return `looks already migrated (found ${marker.path} from a previous run)`;
  }
  return null;
}

/** Rebase a book subtree to book-root-relative paths for loadQuestBook. */
export function rebaseToRoot(files: ReadonlyArray<VfsFile>, root: string): Array<VfsFile> {
  return under(files, root).map((f) => {
    const rel = root === '' ? f.path : f.path.slice(root.length + 1);
    return { path: normalizePath(rel), bytes: f.bytes };
  });
}

/**
 * Where the converted book lands: `ftbquests/quests` becomes `tenet/quests`
 * beside it; a non-standard root nests under its parent; a bare drop converts
 * in place. The rest of the tree is untouched, so the output diff is exactly
 * the migrated subtree (plus `_migrator/`).
 */
export function outputRootFor(root: string): string {
  if (root === '') return '';
  const swapped = root.replace(/(^|\/)ftbquests\/quests$/, '$1tenet/quests');
  if (swapped !== root) return swapped;
  const cut = root.lastIndexOf('/');
  return cut < 0 ? '' : `${root.slice(0, cut)}/tenet/quests`;
}
