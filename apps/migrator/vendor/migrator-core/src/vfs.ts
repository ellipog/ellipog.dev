/**
 * The virtual file tree: bytes in, bytes out, no filesystem.
 *
 * <h2>Why the core never touches a disk</h2>
 *
 * The same `convert()` runs in the Node CLI (reading a config folder) and later in the web
 * Worker (reading a zip or a dropped folder). Both adapters translate their world into
 * {@link VfsFile}s and back; everything between is bytes and POSIX paths. A core that imported
 * `node:fs` could never run in the browser, so the boundary is absolute: this module knows
 * `Uint8Array` and `TextDecoder` (web-standard, present in both runtimes) and nothing else.
 */

/** One file by its POSIX-normalised path (`config/ftbquests/quests/data.snbt`). */
export interface VfsFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

/** A path failure naming the path it refused. */
export class VfsError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "VfsError";
    this.path = path;
  }
}

/**
 * A raw path into its canonical form: backslashes become slashes, `.` segments and doubles
 * collapse, a leading `./` falls away. Throws {@link VfsError} on what can never be safe —
 * absolute paths, drive letters, and `..` above the root — because a zip can carry any of them
 * (zip-slip) and the only safe answer is a refusal, never a guess.
 */
export function normalizePath(raw: string): string {
  const slashed = raw.replace(/\\/g, "/");
  const parts: Array<string> = [];
  for (const segment of slashed.split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (parts.length === 0) {
        throw new VfsError(raw, "escapes its root");
      }
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  const path = parts.join("/");
  if (path.length === 0) {
    throw new VfsError(raw, "names no file");
  }
  // A drive letter with anything after it (`C:/x`, `C:x`) is a Windows path, never a
  // tree member — even the drive-relative form writes outside the output on Windows.
  if (/^[A-Za-z]:/.test(slashed) || slashed.startsWith("/")) {
    throw new VfsError(raw, "is absolute; only tree-relative paths convert");
  }
  return path;
}

/** A file's bytes as UTF-8 text, with undecodable bytes replaced, never failed. */
export function vfsText(file: VfsFile): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(file.bytes);
}

/** Files in deterministic order: byte-wise by path, so a re-run is a diff, not a mystery. */
export function sortVfs(files: ReadonlyArray<VfsFile>): ReadonlyArray<VfsFile> {
  return [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * Paths that would collide on a case-insensitive disk (`Data.snbt` beside `data.snbt`): groups
 * of two or more, each group in path order. A zip can hold both; a Windows output cannot, so the
 * pipeline reports each group rather than letting the second write win.
 */
export function vfsCaseCollisions(
  files: ReadonlyArray<VfsFile>,
): ReadonlyArray<ReadonlyArray<string>> {
  const byLower = new Map<string, Array<string>>();
  for (const file of files) {
    const folded = file.path.toLowerCase();
    const group = byLower.get(folded);
    if (group === undefined) {
      byLower.set(folded, [file.path]);
    } else {
      group.push(file.path);
    }
  }
  const out: Array<ReadonlyArray<string>> = [];
  for (const group of byLower.values()) {
    if (group.length > 1) {
      out.push([...group].sort());
    }
  }
  out.sort((a, b) => {
    const firstA = a[0] as string;
    const firstB = b[0] as string;
    return firstA < firstB ? -1 : firstA > firstB ? 1 : 0;
  });
  return out;
}

/** Every file under `prefix/` (`config/a/` matches `config/a/b`, never `config/ab`). */
export function vfsSubtree(
  files: ReadonlyArray<VfsFile>,
  prefix: string,
): ReadonlyArray<VfsFile> {
  const root = prefix.endsWith("/") ? prefix : `${prefix}/`;
  return files.filter((file) => file.path === prefix || file.path.startsWith(root));
}
