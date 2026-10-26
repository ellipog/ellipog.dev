/**
 * Tags: FTB's free-form lookup words in Tenet's spelling.
 *
 * FTB keeps a tag as whatever string the editor saved (`"Ender Pearls"`, `""`); Tenet's are
 * ids — lowercase letters, digits and underscores, 1 to 64 of them. A tag already in that
 * spelling travels untouched. Anything else is respelled the way an id is (lowercased, every
 * other run of characters one underscore, trimmed, cut at 64) and the warning names both
 * spellings, because a script looking the old one up must change too. A tag with nothing
 * left to spell — the empty string FTB's editor saves for an untouched row — goes with a note.
 * Stage names follow the same respelling, as ids that may carry a namespace.
 */

import { Report } from "./report";
import { SnbtNode } from "./snbt";

const TAG_PATTERN = /^[a-z0-9_]{1,64}$/;

/** One tag in Tenet's spelling, or null when none of it survives. */
export function tenetTag(raw: string): string | null {
  if (TAG_PATTERN.test(raw)) {
    return raw;
  }
  const spelled = raw
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64)
    .replace(/_+$/, "");
  return spelled.length > 0 ? spelled : null;
}

/** A list's tags in Tenet's spelling, in order, each once; every change reported against `what`. */
export function readTagItems(
  items: ReadonlyArray<SnbtNode>,
  report: Report,
  path: string,
  what: string,
): Array<string> {
  const out: Array<string> = [];
  for (const item of items) {
    const raw = item.kind === "string" ? item.value : null;
    const tag = raw === null ? null : tenetTag(raw);
    if (tag === null) {
      report.note({
        code: "blank-tag",
        message: `${what} carries the tag ${JSON.stringify(raw)}, which names nothing; it is left out`,
        path,
        line: item.line,
        key: "tags",
      });
      continue;
    }
    if (tag !== raw) {
      report.warn({
        code: "renamed-tag",
        message: `${what} carries the tag ${JSON.stringify(raw)}; Tenet tags are lowercase letters, digits and underscores, so it reads ${JSON.stringify(tag)}`,
        path,
        line: item.line,
        key: "tags",
        value: tag,
      });
    }
    if (!out.includes(tag)) {
      out.push(tag);
    }
  }
  return out;
}

const STAGE_PATTERN = /^(?:[a-z0-9_.-]+:)?[a-z0-9_/.-]+$/;

/**
 * A stage name in Tenet's spelling: an id, bare or namespaced. FTB hands GameStages whatever
 * string the editor saved (`"Iron Chests"`), so a name outside the id rule is respelled the way
 * a tag is — one rule, so the task waiting on a stage and the reward granting it still agree —
 * or null when nothing of it survives.
 */
export function tenetStage(raw: string): string | null {
  if (STAGE_PATTERN.test(raw)) {
    return raw;
  }
  const colon = raw.indexOf(":");
  const spell = (part: string, path: boolean): string =>
    part
      .toLowerCase()
      .replace(path ? /[^a-z0-9_/.-]+/g : /[^a-z0-9_.-]+/g, "_")
      .replace(/^_+|_+$/g, "");
  const namespace = colon < 0 ? "" : spell(raw.slice(0, colon), false);
  const name = spell(colon < 0 ? raw : raw.slice(colon + 1), true);
  if (name.length === 0) {
    return null;
  }
  return namespace.length > 0 ? `${namespace}:${name}` : name;
}
