/**
 * Commands: FTB verbs into Tenet verbs, with quest ids remapped.
 *
 * <h2>What rewrites, and what passes through</h2>
 *
 * The documented `/ftbquests` verbs (`block_rewards`, `complete`, `reset`, `open_book`,
 * `reload`) and `/ftbteams teamstage` become their `/tenet` spellings; any 16-hex token in a
 * rewritten command remaps to the lowercase id, and a hex token naming nothing warns and
 * stays verbatim (FTB would fail it at runtime as well). Any other `/ftbquests` or
 * `/ftbteams` verb has no Tenet spelling: it warns and stays verbatim as manual work. Other
 * mods' commands (`/neovitae …`) pass through untouched — they run where those mods exist,
 * on both sides. One leading `/` strips: Tenet's dispatcher tolerates it, the docs write
 * without, so the file does too.
 *
 * Shared by reward commands and image-click commands: the rules never depended on where
 * the command sits, only on what it names.
 */

import { IdMap, resolveQuestSlug } from "./ids";
import { Report } from "./report";
import { SlugMaps } from "./slugs";

export function rewriteCommand(
  command: string,
  ids: IdMap,
  slugs: SlugMaps,
  report: Report,
  path: string,
  line: number,
  owner: string,
): string {
  const stripped = command.startsWith("/") ? command.slice(1) : command;
  if (stripped !== command) {
    report.note({
      code: "stripped-slash",
      message: `${owner} led with /; Tenet writes without`,
      path,
      line,
      key: "command",
      value: command,
    });
  }
  const rewritten = rewriteFtbCommand(stripped, ids, slugs, report, path, line, owner);
  if (rewritten !== stripped) {
    report.note({
      code: "rewrote-command",
      message: `${owner} names FTB Quests; it now names Tenet`,
      path,
      line,
      key: "command",
      value: rewritten,
    });
  }
  return rewritten;
}

function rewriteFtbCommand(
  command: string,
  ids: IdMap,
  slugs: SlugMaps,
  report: Report,
  path: string,
  line: number,
  owner: string,
): string {
  const match = /^(ftbquests|ftbteams)\s+(\S+)\s*(.*)$/.exec(command);
  if (match === null) {
    return substituteIds(command, ids, slugs, report, path, line, owner);
  }
  const mod = match[1] as string;
  const verb = match[2] as string;
  const rest = (match[3] as string).trim();
  const table: Record<string, string> = {
    block_rewards: "rewards block",
    complete: "complete",
    reset: "reset",
    open_book: "open_book",
    reload: "reload",
  };
  if (mod === "ftbteams" && verb === "teamstage") {
    return substituteIds(rest === "" ? "tenet stage" : `tenet stage ${rest}`, ids, slugs, report, path, line, owner);
  }
  const mapped = table[verb];
  if (mapped === undefined) {
    report.warn({
      code: "unrewritten-command",
      message: `${owner} calls /${mod} ${verb}, which has no Tenet spelling; it stays verbatim as manual work`,
      path,
      line,
      key: "command",
      value: command,
    });
    return command;
  }
  return substituteIds(rest === "" ? `tenet ${mapped}` : `tenet ${mapped} ${rest}`, ids, slugs, report, path, line, owner);
}

function substituteIds(
  command: string,
  ids: IdMap,
  slugs: SlugMaps,
  report: Report,
  path: string,
  line: number,
  owner: string,
): string {
  return command.replace(/\b[0-9A-Fa-f]{16}\b/g, (hex) => {
    const target = resolveQuestSlug(ids, slugs, hex);
    if (target === null) {
      report.warn({
        code: "command-quest-dangling",
        message: `${owner} names ${hex}, which resolves to no quest; it stays verbatim`,
        path,
        line,
        key: "command",
        value: hex,
      });
      return hex;
    }
    return target;
  });
}
