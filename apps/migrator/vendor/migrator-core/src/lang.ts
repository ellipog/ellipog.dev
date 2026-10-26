/**
 * The language pool: pack text in, Tenet prose out, keyed by new ids.
 *
 * <h2>What the files look like</h2>
 *
 * Flat dotted keys in one compound per locale: `quest.<HEX>.title` (always a string),
 * `quest.<HEX>.quest_subtitle` (always a string), `quest.<HEX>.quest_desc` (always a list),
 * `chapter.<HEX>.chapter_subtitle` (always a single-element list), plus `title` strings for
 * chapters, groups, tasks, tables, images, rewards and the one `file.0000000000000001.title`.
 *
 * <p>A locale reads from up to three places, lowest first: text written into the objects
 * themselves (1.20-era books; FTB moves it into the table on first load, under anything the
 * file already says), the locale file `lang/<locale>.snbt`, and split files under
 * `lang/<locale>/` (the FTB Quests Lang Splitter layout, put over the table by that mod).
 *
 * <h2>Two levels of escapes</h2>
 *
 * SNBT parsing already turned file `\\n` into the two characters `\` + `n`: that sequence is
 * FTB's line break, read by its own text pipeline exactly the way vanilla `.lang` files read
 * it (86k of them across ATM10). Tenet has no such convention — a paragraph is a string, and
 * its renderer draws a literal backslash-n on screen — so the break is realized here, at the
 * one place every prose string passes through. `\\` (a real backslash) and `\&` (a literal
 * ampersand for the colour pass) are not breaks and pass through untouched, as does anything
 * else: only backslash-n breaks.
 *
 * <p>Descriptions keep their list structure with real newlines inside; Tenet splits lines into
 * blocks itself. Titles and subtitles are single-line UI, so breaks collapse to spaces there.
 *
 * <h2>Who reports what</h2>
 *
 * This pool reports file problems: a missing canonical locale, malformed values, blank text,
 * and stale keys (orphans). A *missing* string reports nothing here — it arrives as null and
 * the mapper that needs it synthesises (quest titles fall back to task titles, exactly as
 * FTB's own `getAltTitle` does) with the synthesis warning beside the quest that owns it.
 * Splitting it this way keeps each warning next to its object instead of pooled by locale.
 *
 * <h2>Tenet key renames</h2>
 *
 * Overlays speak Tenet's keys, not FTB's: `chapter_group.` becomes `group.`,
 * `reward_table.` becomes `rewardTable.`, `image.<id>.title` becomes `element.<id>.title`,
 * `file.….title` becomes `book.title`. Every id is the new lowercase spelling; the report
 * (and `ids.json`) carries both spellings for audits.
 */

import { InlineText, ParsedFile } from "./model";
import { Report } from "./report";
import { IdMap } from "./ids";
import { QuestBookInput } from "./model";
import { SnbtNode, snbtGet } from "./snbt";

export interface LangOptions {
  /** Locale read for canonical text (`en_us`). */
  readonly canonicalLocale: string;
  /** Second chance when the canonical file lacks a string (the pack's `fallback_locale`). */
  readonly fallbackLocale: string;
}

/**
 * Text beyond the locale files: split translation files per locale (they win over the locale
 * file, as the splitter mod puts them), and inline object text (under it, as FTB's own
 * first-load move does). Both empty for a 1.21 book that keeps one file per locale.
 */
export interface LangSources {
  readonly parts?: ReadonlyMap<string, ReadonlyArray<ParsedFile>> | undefined;
  readonly inline?: ReadonlyArray<InlineText> | undefined;
  readonly inlineLocale?: string | undefined;
}

interface LocaleFile {
  /** The file a locale-wide finding names: the locale file, else its first source. */
  readonly path: string;
  readonly keys: ReadonlyMap<string, SnbtNode>;
  /** Where each key was read, so a finding names the file that holds the line. */
  readonly paths: ReadonlyMap<string, string>;
}

const KNOWN_PREFIXES: ReadonlySet<string> = new Set([
  "quest",
  "chapter",
  "chapter_group",
  "task",
  "reward_table",
  "image",
  "file",
  "reward",
]);

const FILE_TITLE_KEY = "file.0000000000000001.title";

/**
 * FTB's line break, realized: the two characters `\` + `n` (what file `\\n` became in SNBT
 * parsing) become a real newline. Everything else passes through — `\\` stays a backslash,
 * `\&` stays for the colour pass — because only backslash-n breaks.
 */
export function proseBreaks(text: string): string {
  return text.replace(/\\n/g, "\n");
}

/**
 * A single-line field: breaks realized, then every whitespace run collapsed to one space.
 * Titles and subtitles are one line in both books; a newline in one is a file artefact (or a
 * wrap the author's editor saved), never layout.
 */
export function proseLine(text: string): string {
  return proseBreaks(text).replace(/\s+/g, " ").trim();
}

export class LangPool {
  private readonly locales = new Map<string, LocaleFile>();
  private readonly canonical: string;
  private readonly fallback: string;
  private readonly report: Report;
  private readonly missingCanonicalFile: boolean;
  /** Flat keys checkOrphans condemned, per locale: overlay() skips them so dead translations never ship. */
  private readonly excluded = new Map<string, Set<string>>();

  constructor(
    files: ReadonlyMap<string, ParsedFile>,
    options: LangOptions,
    report: Report,
    sources: LangSources = {},
  ) {
    this.canonical = options.canonicalLocale;
    this.fallback = options.fallbackLocale;
    this.report = report;
    const building = new Map<string, { path: string; keys: Map<string, SnbtNode>; paths: Map<string, string> }>();
    const layer = (locale: string, path: string): { path: string; keys: Map<string, SnbtNode>; paths: Map<string, string> } => {
      let entry = building.get(locale);
      if (entry === undefined) {
        entry = { path, keys: new Map(), paths: new Map() };
        building.set(locale, entry);
      }
      return entry;
    };
    // Lowest rung first, so each later source overwrites: inline text, the locale file, then
    // split parts in path order. Within one file a repeated key reads as its last writing,
    // as FTB's compound does (and the duplicate-key warning says).
    const inlineLocale = sources.inlineLocale ?? "en_us";
    for (const text of sources.inline ?? []) {
      const target = layer(inlineLocale, text.path);
      target.keys.set(text.key, text.node);
      target.paths.set(text.key, text.path);
    }
    const read = (locale: string, file: ParsedFile): void => {
      const target = layer(locale, file.path);
      if (file.root.kind === "compound") {
        for (const [key, value] of file.root.entries) {
          target.keys.set(key, value);
          target.paths.set(key, file.path);
        }
      }
    };
    for (const [locale, file] of files) {
      read(locale, file);
      // The locale file names locale-wide findings even when inline text arrived first.
      layer(locale, file.path).path = file.path;
    }
    for (const [locale, list] of sources.parts ?? new Map<string, ReadonlyArray<ParsedFile>>()) {
      for (const part of list) {
        read(locale, part);
      }
    }
    for (const [locale, entry] of building) {
      this.locales.set(locale, entry);
    }
    this.missingCanonicalFile = !this.locales.has(this.canonical);
    if (this.missingCanonicalFile) {
      report.error({
        code: "missing-locale",
        message: `no ${this.canonical} text (no ${this.canonical}.snbt, no ${this.canonical}/ folder, no inline text): every canonical string falls back to ${this.fallback === "" ? "nothing" : this.fallback} or empty`,
      });
    }
  }

  /** Locale ids present, sorted. */
  localeIds(): ReadonlyArray<string> {
    return [...this.locales.keys()].sort();
  }

  questTitle(source: string): string | null {
    const title = this.string(`quest.${source}.title`);
    return title === null ? null : proseLine(title);
  }

  questSubtitle(source: string): string | null {
    const subtitle = this.string(`quest.${source}.quest_subtitle`);
    return subtitle === null ? null : proseLine(subtitle);
  }

  questDescription(source: string): ReadonlyArray<string> | null {
    return this.stringList(`quest.${source}.quest_desc`);
  }

  chapterTitle(source: string): string | null {
    const title = this.string(`chapter.${source}.title`);
    return title === null ? null : proseLine(title);
  }

  chapterSubtitle(source: string): string | null {
    const list = this.stringList(`chapter.${source}.chapter_subtitle`);
    if (list === null) {
      return null;
    }
    // Single-element in every real pack; several join with a space, the documented rule.
    return proseLine(list.join(" "));
  }

  groupTitle(source: string): string | null {
    const title = this.string(`chapter_group.${source}.title`);
    return title === null ? null : proseLine(title);
  }

  taskTitle(source: string): string | null {
    const title = this.string(`task.${source}.title`);
    return title === null ? null : proseLine(title);
  }

  tableTitle(source: string): string | null {
    const title = this.string(`reward_table.${source}.title`);
    return title === null ? null : proseLine(title);
  }

  /** A reward's own words, from `reward.<HEX>.title`. Blank reads as no title, FTB's own rule. */
  rewardTitle(source: string): string | null {
    const node = this.find(`reward.${source}.title`);
    if (node === null || node.kind !== "string" || node.value.trim().length === 0) {
      return null;
    }
    return proseLine(node.value);
  }

  imageTitle(source: string): string | null {
    const title = this.string(`image.${source}.title`);
    return title === null ? null : proseLine(title);
  }

  fileTitle(): string | null {
    const title = this.string(FILE_TITLE_KEY);
    return title === null ? null : proseLine(title);
  }

  /**
   * One locale's overlay in Tenet keys: every string verbatim, every description list whole.
   * Unknown prefixes are skipped here and reported by {@link checkOrphans}; malformed values
   * fail the entry with the file and key named.
   */
  overlay(locale: string): Array<{ key: string; value: string | ReadonlyArray<string> }> {
    const file = this.locales.get(locale);
    if (file === undefined) {
      return [];
    }
    const out: Array<{ key: string; value: string | ReadonlyArray<string> }> = [];
    const untranslated: Array<string> = [];
    for (const [flat, node] of file.keys) {
      const skipped = this.excluded.get(locale);
      if (skipped !== undefined && skipped.has(flat)) {
        continue;
      }
      const mapped = tenetKey(flat);
      if (mapped === null) {
        // A reward's words have no conventional Tenet key: canonical text rides inline on
        // the reward itself, and another locale's wording is the loss counted below.
        if (
          locale !== this.canonical &&
          flat.startsWith("reward.") &&
          node.kind === "string" &&
          node.value.trim().length > 0
        ) {
          untranslated.push(flat);
        }
        continue;
      }
      const value = overlayValue(node, flat.slice(flat.lastIndexOf(".") + 1));
      if (value === null) {
        this.report.error({
          code: "malformed-lang",
          message: `the language key ${JSON.stringify(flat)} holds no text`,
          path: file.paths.get(flat) ?? file.path,
          line: node.line,
          key: flat,
        });
        continue;
      }
      out.push({ key: mapped, value });
    }
    if (untranslated.length > 0) {
      this.report.warn({
        code: "untranslatable-reward-title",
        message: `${untranslated.length} reward title(s) in ${locale} have no Tenet translation key; rewards show the ${this.canonical} wording there`,
        path: file.path,
        key: "reward",
        value: untranslated.slice(0, 5),
      });
    }
    return out;
  }

  /**
   * Keys naming nothing: an unknown prefix warns per key; a known prefix with an unknown id
   * warns once per locale and kind, with a count and the first ids. Leftovers from earlier
   * builds of the pack, never content — nothing is emitted for them.
   */
  checkOrphans(ids: IdMap, imageIds: ReadonlySet<string>): void {
    for (const locale of this.localeIds()) {
      const file = this.locales.get(locale);
      if (file === undefined) {
        continue;
      }
      const condemn = (flat: string): void => {
        const set = this.excluded.get(locale) ?? new Set<string>();
        set.add(flat);
        this.excluded.set(locale, set);
      };
      const stale = new Map<string, Array<string>>();
      for (const [flat, node] of file.keys) {
        const dot = flat.indexOf(".");
        const last = flat.lastIndexOf(".");
        const prefix = dot < 0 ? flat : flat.slice(0, dot);
        if (!KNOWN_PREFIXES.has(prefix)) {
          this.report.warn({
            code: "stale-lang-key",
            message: `the language key ${JSON.stringify(flat)} names no kind this converter knows`,
            path: file.paths.get(flat) ?? file.path,
            line: node.line,
            key: flat,
          });
          condemn(flat);
          continue;
        }
        if (flat === FILE_TITLE_KEY) {
          continue;
        }
        if (dot === last) {
          this.report.warn({
            code: "stale-lang-key",
            message: `the language key ${JSON.stringify(flat)} names no object`,
            path: file.paths.get(flat) ?? file.path,
            line: node.line,
            key: flat,
          });
          condemn(flat);
          continue;
        }
        const id = flat.slice(dot + 1, last).toLowerCase();
        if (!orphanKnown(prefix, id, ids, imageIds)) {
          const group = stale.get(prefix) ?? [];
          group.push(id);
          stale.set(prefix, group);
          condemn(flat);
        }
      }
      for (const [prefix, group] of [...stale.entries()].sort()) {
        const unique = [...new Set(group)].sort();
        this.report.warn({
          code: "stale-lang-key",
          message: `${unique.length} ${prefix} key(s) in ${locale} name ids that no object in the pack has — leftovers from an earlier build of the pack`,
          path: file.path,
          key: prefix,
          value: unique.slice(0, 5),
        });
      }
    }
  }

  /** Canonical text with the fallback rung below it; blank warns once, here. */
  private string(flat: string): string | null {
    const node = this.find(flat);
    if (node === null) {
      return null;
    }
    if (node.kind !== "string") {
      const holder = this.holderOf(flat);
      this.report.error({
        code: "malformed-lang",
        message: `the language key ${JSON.stringify(flat)} is not text`,
        path: holder.paths.get(flat) ?? holder.path,
        line: node.line,
        key: flat,
      });
      return null;
    }
    const text = proseBreaks(node.value);
    if (text.trim().length === 0) {
      const holder = this.holderOf(flat);
      this.report.warn({
        code: "blank-text",
        message: `the language key ${JSON.stringify(flat)} is empty`,
        path: holder.paths.get(flat) ?? holder.path,
        line: node.line,
        key: flat,
      });
    }
    return text;
  }

  private stringList(flat: string): ReadonlyArray<string> | null {
    const node = this.find(flat);
    if (node === null) {
      return null;
    }
    const holder = this.holderOf(flat);
    if (node.kind === "string") {
      return [node.value];
    }
    if (node.kind !== "list") {
      this.report.error({
        code: "malformed-lang",
        message: `the language key ${JSON.stringify(flat)} is neither text nor a list of text`,
        path: holder.paths.get(flat) ?? holder.path,
        line: node.line,
        key: flat,
      });
      return null;
    }
    const out: Array<string> = [];
    for (const item of node.items) {
      if (item.kind !== "string") {
        this.report.error({
          code: "malformed-lang",
          message: `the language key ${JSON.stringify(flat)} lists something that is not text`,
          path: holder.paths.get(flat) ?? holder.path,
          line: item.line,
          key: flat,
        });
        return null;
      }
      out.push(proseBreaks(item.value));
    }
    if (out.length > 0 && out.every((line) => line.trim().length === 0)) {
      this.report.warn({
        code: "blank-text",
        message: `the language key ${JSON.stringify(flat)} is empty`,
        path: holder.paths.get(flat) ?? holder.path,
        line: node.line,
        key: flat,
      });
    }
    return out;
  }

  private find(flat: string): SnbtNode | null {
    const canonical = this.locales.get(this.canonical)?.keys.get(flat);
    if (canonical !== undefined) {
      return canonical;
    }
    if (this.fallback !== this.canonical) {
      return this.locales.get(this.fallback)?.keys.get(flat) ?? null;
    }
    return null;
  }

  private holderOf(flat: string): LocaleFile {
    // Total: callers only ask for keys find() already located in one of these two files,
    // so the throw below is unreachable — and if it ever fires, it names a pool bug rather
    // than attributing a warning to the wrong file.
    const canonical = this.locales.get(this.canonical);
    if (canonical?.keys.has(flat) === true) {
      return canonical;
    }
    const fallback = this.locales.get(this.fallback);
    if (fallback === undefined) {
      throw new Error(`internal: no locale file holds the found key ${flat}`);
    }
    return fallback;
  }
}

/** Every image id in the book, lowercased, for the orphan check. */
export function collectImageIds(book: QuestBookInput): ReadonlySet<string> {
  const out = new Set<string>();
  for (const chapter of book.chapters) {
    const images = snbtGet(chapter.node, "images");
    if (images === undefined || images.kind !== "list") {
      continue;
    }
    for (const image of images.items) {
      if (image.kind !== "compound") {
        continue;
      }
      const id = snbtGet(image, "id");
      if (id !== undefined && id.kind === "string") {
        out.add(id.value.toLowerCase());
      }
    }
  }
  return out;
}

/** An FTB flat key in its Tenet spelling, or null when no Tenet key exists for it. */
function tenetKey(flat: string): string | null {
  const dot = flat.indexOf(".");
  const last = flat.lastIndexOf(".");
  if (dot < 0 || dot === last) {
    return null;
  }
  const prefix = flat.slice(0, dot);
  const id = flat.slice(dot + 1, last).toLowerCase();
  const field = flat.slice(last + 1);
  switch (prefix) {
    case "quest":
      return field === "title" || field === "quest_subtitle" || field === "quest_desc"
        ? `quest.${id}.${field === "title" ? "title" : field === "quest_subtitle" ? "subtitle" : "description"}`
        : null;
    case "chapter":
      if (field === "title") {
        return `chapter.${id}.title`;
      }
      return field === "chapter_subtitle" ? `chapter.${id}.subtitle` : null;
    case "chapter_group":
      return field === "title" ? `group.${id}.title` : null;
    case "task":
      return field === "title" ? `task.${id}.title` : null;
    case "reward_table":
      return field === "title" ? `rewardTable.${id}.title` : null;
    case "image":
      return field === "title" ? `element.${id}.title` : null;
    case "file":
      return flat === FILE_TITLE_KEY ? "book.title" : null;
    default:
      return null;
  }
}

function overlayValue(node: SnbtNode, field: string): string | ReadonlyArray<string> | null {
  // The same prose rules as the canonical readers, by FTB field: descriptions keep breaks,
  // everything else is single-line. A locale that disagreed with canonical about line breaks
  // would show different paragraphs per language.
  if (node.kind === "string") {
    const text = proseBreaks(node.value);
    return field === "quest_desc" ? text : proseLine(text);
  }
  if (node.kind === "list") {
    const out: Array<string> = [];
    for (const item of node.items) {
      if (item.kind !== "string") {
        return null;
      }
      const text = proseBreaks(item.value);
      out.push(field === "quest_desc" ? text : proseLine(text));
    }
    return out;
  }
  return null;
}

function orphanKnown(
  prefix: string,
  id: string,
  ids: IdMap,
  imageIds: ReadonlySet<string>,
): boolean {
  switch (prefix) {
    case "quest":
      return ids.quests.has(id);
    case "chapter":
      return ids.chapters.has(id);
    case "chapter_group":
      return ids.groups.has(id);
    case "task":
      return ids.tasks.has(id);
    case "reward_table":
      return ids.tables.has(id);
    case "image":
      return imageIds.has(id);
    case "reward":
      return ids.rewards.has(id);
    case "file":
      return false;
    default:
      return false;
  }
}
