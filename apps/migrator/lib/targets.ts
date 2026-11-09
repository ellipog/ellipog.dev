/**
 * Where each report entry points in the converted tree, so the result can link a warning to its quest.
 *
 * A report entry names its *source*: an FTB file and line, and usually a quest by its FTB id in the
 * message ("a task of quest 6741b77bbc23a95c …") or in a language key ("quest.0C7D….quest_desc"). The
 * reader wants the other end: which quest that is, by its title, and the file it became. The converter's
 * own audit map (`_migrator/ids.json`, emitted on every run) says which quest an id became and in which
 * chapter, and each `chapter.json` says which folder that chapter became, so the link is read off what was
 * emitted rather than guessed from a path.
 *
 * Built in the worker, beside the conversion, and only for quests an entry actually names: titles need each
 * quest file parsed, and a big pack has thousands. The page resolves entries against it (`targetOf`) and
 * imports nothing heavier than this file.
 */

export interface QuestTarget {
  /** The converted quest file, as placed in the output. */
  readonly path: string;
  /** Its title with formatting codes removed, or its slug when it has none. */
  readonly title: string;
  /** Its chapter's title, the same way. */
  readonly chapter: string;
}

export interface FileTarget {
  readonly path: string;
  readonly title: string;
}

export interface ReportTargets {
  /** By FTB quest id, lower case. */
  readonly quests: Readonly<Record<string, QuestTarget>>;
  /**
   * `path:line` → FTB quest id, for entries whose message names no quest but whose line falls inside one
   * (an item's 1.20 data, an icon's scale). Only the keys some entry needs.
   */
  readonly lines: Readonly<Record<string, string>>;
  /** By source path, as report entries name it. */
  readonly files: Readonly<Record<string, FileTarget>>;
  /** What the converted tree holds, for the in → out explanation. */
  readonly shape: { readonly chapters: number; readonly quests: number };
}

export const NO_TARGETS: ReportTargets = { quests: {}, lines: {}, files: {}, shape: { chapters: 0, quests: 0 } };

/** One quest's block in its chapter's source: the lines it spans and its FTB id, lower case. */
export interface QuestSpan {
  readonly start: number;
  readonly end: number;
  readonly id: string;
}

/** The quest whose block holds `line`, from spans in source order. */
function questAt(spans: ReadonlyArray<QuestSpan>, line: number): string | null {
  let lo = 0;
  let hi = spans.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const span = spans[mid] as QuestSpan;
    if (line < span.start) hi = mid - 1;
    else if (line > span.end) lo = mid + 1;
    else return span.id;
  }
  return null;
}

/** An FTB id: 16 hex digits, standing alone. */
const HEX_ID = /\b[0-9a-fA-F]{16}\b/g;

/** Minecraft formatting codes (`&6`, `§l`), which a quest title carries and a link label should not. */
export function plainText(text: string): string {
  return text.replace(/[&§][0-9a-fk-orA-FK-OR]/g, '').replace(/\s+/g, ' ').trim();
}

interface IdsJson {
  readonly quests?: ReadonlyArray<{ id: string; slug: string; chapter: string }>;
  readonly chapters?: ReadonlyArray<{ id: string; slug: string; file: string }>;
  readonly tables?: ReadonlyArray<{ id: string; slug: string; file: string }>;
}

function parse(text: string | undefined): Record<string, unknown> | null {
  if (text === undefined) return null;
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function titleOf(json: Record<string, unknown> | null, fallback: string): string {
  const title = json?.['title'];
  const plain = typeof title === 'string' ? plainText(title) : '';
  return plain === '' ? fallback : plain;
}

type EntryLike = { readonly path?: string; readonly line?: number; readonly message: string; readonly key?: string };

/** Every FTB id an entry names in its message or key, lower case, in order. */
function* namedIds(entry: EntryLike): Generator<string> {
  for (const match of `${entry.message} ${entry.key ?? ''}`.matchAll(HEX_ID)) yield match[0].toLowerCase();
}

/**
 * The link index for one run. `emitted` is the converter's output before placement (paths relative to the
 * book), `prefix` places a path where the output puts it, `entries` are the report's, and `spans` holds
 * each chapter's quest blocks by source path.
 */
export function buildTargets(
  emitted: ReadonlyArray<{ readonly path: string; readonly text: string }>,
  entries: ReadonlyArray<EntryLike>,
  prefix: (path: string) => string,
  spans: ReadonlyMap<string, ReadonlyArray<QuestSpan>>,
): ReportTargets {
  const byPath = new Map(emitted.map((file) => [file.path, file.text]));
  const ids = parse(byPath.get('_migrator/ids.json')) as IdsJson | null;
  if (ids === null) return NO_TARGETS;

  // Chapter slug → the folder it became, its title, and how many quest files it lists.
  const chapters = new Map<string, { dir: string; title: string }>();
  let questFiles = 0;
  for (const file of emitted) {
    if (!file.path.endsWith('/chapter.json')) continue;
    const json = parse(file.text);
    const id = json?.['id'];
    if (typeof id !== 'string') continue;
    const dir = file.path.slice(0, -'/chapter.json'.length);
    chapters.set(id, { dir, title: titleOf(json, id) });
    const listed = json?.['quests'];
    if (Array.isArray(listed)) questFiles += listed.length;
  }
  const chapterBySource = new Map<string, { dir: string; title: string }>();
  for (const entry of ids.chapters ?? []) {
    const chapter = chapters.get(entry.slug);
    if (chapter !== undefined) chapterBySource.set(entry.file, chapter);
  }

  // Only the quests some entry names, by id or by line: each one costs a parse for its title.
  const known = new Set((ids.quests ?? []).map((quest) => quest.id));
  const named = new Set<string>();
  const lines: Record<string, string> = {};
  for (const entry of entries) {
    let found = false;
    for (const id of namedIds(entry)) {
      named.add(id);
      found ||= known.has(id);
    }
    if (found || entry.path === undefined || entry.line === undefined || entry.line <= 0) continue;
    const chapter = spans.get(entry.path);
    const id = chapter === undefined ? null : questAt(chapter, entry.line);
    if (id !== null && known.has(id)) {
      lines[`${entry.path}:${entry.line}`] = id;
      named.add(id);
    }
  }
  const quests: Record<string, QuestTarget> = {};
  for (const quest of ids.quests ?? []) {
    if (!named.has(quest.id)) continue;
    const chapter = chapterBySource.get(quest.chapter);
    if (chapter === undefined) continue;
    const path = `${chapter.dir}/${quest.slug}.json`;
    const text = byPath.get(path);
    if (text === undefined) continue;
    quests[quest.id] = { path: prefix(path), title: titleOf(parse(text), quest.slug), chapter: chapter.title };
  }

  // A source file → the file it became, for entries about a chapter, a table, the book or a translation.
  const files: Record<string, FileTarget> = {};
  for (const [source, chapter] of chapterBySource) {
    files[source] = { path: prefix(`${chapter.dir}/chapter.json`), title: chapter.title };
  }
  for (const table of ids.tables ?? []) {
    const path = `reward_tables/${table.slug}.json`;
    if (byPath.has(path)) files[table.file] = { path: prefix(path), title: titleOf(parse(byPath.get(path)), table.slug) };
  }
  if (byPath.has('index.json')) files['data.snbt'] = { path: prefix('index.json'), title: 'Book settings' };
  for (const entry of entries) {
    const source = entry.path;
    if (source === undefined || !source.startsWith('lang/') || files[source] !== undefined) continue;
    const locale = source.slice('lang/'.length).split('/')[0]?.replace(/\.snbt$/, '') ?? '';
    const path = `lang/${locale}.json`;
    if (byPath.has(path)) files[source] = { path: prefix(path), title: `${locale} translations` };
  }

  return { quests, lines, files, shape: { chapters: chapters.size, quests: questFiles } };
}

export interface EntryTarget {
  readonly path: string;
  readonly title: string;
  /** The chapter, for a quest; nothing for a file, whose path says enough. */
  readonly context: string | null;
}

/**
 * The quest an entry is about (named in it, else the one its line falls in), else the file its source
 * became, else nothing.
 */
export function targetOf(entry: EntryLike, targets: ReportTargets): EntryTarget | null {
  const byLine = entry.path === undefined ? undefined : targets.lines[`${entry.path}:${entry.line ?? 0}`];
  for (const id of byLine === undefined ? namedIds(entry) : [byLine]) {
    const quest = targets.quests[id];
    if (quest !== undefined) return { path: quest.path, title: quest.title, context: quest.chapter };
  }
  const file = entry.path === undefined ? undefined : targets.files[entry.path];
  return file === undefined ? null : { path: file.path, title: file.title, context: null };
}
