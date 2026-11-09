/**
 * What each report code means, said for the pack maker reading the result rather than for the converter.
 *
 * The report's own messages are exact and per entry ("the quest 5d52… has no title; it reads …"). What they
 * do not say is what a *kind* of entry means, or whether it needs anybody to do anything, and a list of 87
 * of them reads as 87 problems. So the page groups entries by code and heads each group with one of these:
 * a name, a sentence or two, and an action.
 *
 * The actions are the part a reader acts on, and they are judged per code, not per severity:
 *
 * - `none`   it reads and behaves as it did in FTB Quests, or the difference cannot matter;
 * - `check`  it looks or behaves a little differently; worth a look if that part matters to the pack;
 * - `manual` something was left out or now waits on a script, and only a person can put it back;
 * - `fix`    the run stopped on it (errors only).
 *
 * Every code the converter can emit is here. One that is not (a newer core than this table) still renders,
 * under its code and the severity's default, so a missing line here is untidy rather than wrong.
 * A code the core emits at two severities can carry a `severity:code` entry, which wins over the plain one.
 */
import type { Severity } from './core';

export type Action = 'none' | 'check' | 'manual' | 'fix';

export interface CodeInfo {
  readonly title: string;
  readonly meaning: string;
  readonly action: Action;
}

export const ACTION_LABEL: Record<Action, string> = {
  none: 'nothing to do',
  check: 'worth a look',
  manual: 'manual work',
  fix: 'must fix',
};

/** Most pressing first: the order groups are listed in. */
export const ACTION_RANK: Record<Action, number> = { fix: 0, manual: 1, check: 2, none: 3 };

const INFO: Record<string, CodeInfo> = {
  // ------------------------------------------------------------------------------------- warnings
  'synthesised-title': {
    title: 'Quests without a title',
    meaning:
      'FTB Quests showed these quests under the name of their first task, because they have no title of their own. That name is now written into the quest, so players see the same text. Write your own title only if you want a different one.',
    action: 'none',
  },
  'custom-task': {
    title: 'Custom tasks',
    meaning:
      'A custom task is completed by a script (KubeJS or another mod), and Tenet has no built-in equivalent. It is kept as a tenet:custom task under the id shown, and it will not complete until a script completes it. Point your script at the new id (_migrator/ids.json lists them all).',
    action: 'manual',
  },
  'custom-reward': {
    title: 'Custom rewards',
    meaning:
      'A custom reward is handed out by a script, and Tenet has no equivalent, so it was left out. Add it back as a command reward or from your script if players should still get it.',
    action: 'manual',
  },
  'stale-lang-key': {
    title: 'Leftover translations',
    meaning:
      'Translation keys that point at quests, chapters or rewards no longer in the book, usually left behind by an earlier version of the pack. Nothing uses them, so they are dropped.',
    action: 'none',
  },
  'blank-text': {
    title: 'Empty text',
    meaning:
      'A title or description is set but empty. It stays empty, as FTB showed it. Fill it in if it was meant to say something.',
    action: 'check',
  },
  'checkmark-without-title': {
    title: 'Checkmark tasks without a title',
    meaning:
      'A checkmark task (one the player ticks off by clicking) has no title. FTB gave it a default label; Tenet draws a bare button. Give it a title if the button needs words.',
    action: 'check',
  },
  'clamped-cooldown': {
    title: 'Cooldown shortened',
    meaning: 'A cooldown is longer than Tenet allows (one day), so it waits one day.',
    action: 'check',
  },
  'clamped-count': {
    title: 'Counts capped',
    meaning:
      'A task asks for, or a reward gives, more than Tenet allows, so the number was lowered to the cap. Check the quest still makes sense.',
    action: 'check',
  },
  'clamped-icon-scale': {
    title: 'Icon size capped',
    meaning:
      'Tenet draws quest icons between 0.25× and 1× their node, so a larger or smaller icon is drawn at the nearest limit. Only the look changes.',
    action: 'check',
  },
  'clamped-loot-size': {
    title: 'Reward-table rolls adjusted',
    meaning:
      'A reward table rolls 0 times, or more than 1000. Tenet rolls 1 to 1000, so it uses the nearest: a table that rolled 0 now gives one roll.',
    action: 'check',
  },
  'clamped-min-required': {
    title: 'Dependency count that could never be met',
    meaning:
      'The quest asked for more of its dependencies than it has, so in FTB it could never unlock. It now waits on all of them, so it can.',
    action: 'check',
  },
  'clamped-min-width': {
    title: 'Quest width capped',
    meaning: "A quest's minimum width is over Tenet's 3000px limit, so it uses 3000px.",
    action: 'check',
  },
  'clamped-size': {
    title: 'Node size capped',
    meaning: 'A quest or quest link is outside Tenet’s 16–512px size range, so it is drawn at the nearest limit.',
    action: 'check',
  },
  'clamped-xp': {
    title: 'XP reward capped',
    meaning: "An XP reward is over Tenet's cap of 100,000, so it gives 100,000.",
    action: 'check',
  },
  'click-target-dangling': {
    title: 'Images that open a missing quest',
    meaning:
      'Clicking this image opened a quest that is not in the book, so it did nothing in FTB either. It is kept, without the click.',
    action: 'none',
  },
  'command-quest-dangling': {
    title: 'Commands naming a missing quest',
    meaning:
      'A command mentions a quest id that is not in the book, so it is kept word for word. It probably did not work in FTB either; fix the id if it should.',
    action: 'check',
  },
  'warning:duplicate-file': {
    title: 'Two files claim the same id',
    meaning:
      'Two files use the same id with different content, and only one of them converts. Check that the one kept is the one you meant.',
    action: 'check',
  },
  'duplicate-key': {
    title: 'Settings written twice',
    meaning: 'The same setting appears more than once in one place. The last one counts, as it did in FTB.',
    action: 'none',
  },
  'duplicate-task-id': {
    title: 'Tasks or rewards sharing an id',
    meaning:
      'Two tasks or rewards use the same id. Both convert; a quest that waited on that id now waits on the first one.',
    action: 'check',
  },
  'empty-item-task': {
    title: 'Item tasks with no item',
    meaning:
      'An item task names no item. FTB counted any item toward it; Tenet needs one, so the task was left out and the quest has one task fewer.',
    action: 'check',
  },
  'empty-observation': {
    title: 'Observation tasks with nothing to observe',
    meaning:
      'These tasks never completed in FTB, so they are kept as custom tasks that also never complete, holding their quests as before. Give them a target, or remove them, if the quest should be finishable.',
    action: 'check',
  },
  'empty-reward': {
    title: 'Rewards that give nothing',
    meaning: 'An XP reward of 0 or a stage reward with no stage gave nothing in FTB either, so it is left out.',
    action: 'none',
  },
  'huge-long-component': {
    title: 'Numbers too large to keep',
    meaning:
      "An item carries a number too large to store exactly (often a stored-energy value), so that part of the item was dropped. The task accepts the item without it.",
    action: 'check',
  },
  'icon-components-dropped': {
    title: 'Icon details dropped',
    meaning: 'A custom icon picture cannot carry item data, so that data was dropped from the icon. Only the picture is affected.',
    action: 'check',
  },
  'icon-table-custom': {
    title: 'Reward-table pictures',
    meaning: "A reward table has its own picture, which Tenet's table rows cannot show; each entry shows its own picture instead.",
    action: 'none',
  },
  'ignored-file': {
    title: 'Files FTB never reads',
    meaning: 'These files sit outside the folders FTB Quests reads, so they are copied over untouched rather than converted.',
    action: 'none',
  },
  'incompatible-quest': {
    title: 'One-way quest locks',
    meaning:
      'With Quests Additions, this quest locked once another was done. Tenet locks quests only both ways and within a chapter, so this one stays open.',
    action: 'check',
  },
  'invisible-image': {
    title: 'Images with no size',
    meaning: 'An image has zero width or height, so it never showed. It is left out.',
    action: 'none',
  },
  'legacy-item-nbt': {
    title: '1.20 item data dropped',
    meaning:
      'An item from a 1.20 book carries extra data (enchantments, names and so on) with no general 1.21 equivalent, so it converts as the plain item. Re-add the data by hand where it matters, mostly on rewards.',
    action: 'check',
  },
  'lifted-min-required': {
    title: '"Any N of" dependencies on tasks',
    meaning:
      'The quest unlocked after some of its dependencies, counting individual tasks. Tenet cannot wait on tasks, so it waits on the quests that own them, all of them.',
    action: 'check',
  },
  'link-id-duplicate': {
    title: 'Quest links sharing an id',
    meaning: 'Two quest links in one chapter share an id, so the second is not placed.',
    action: 'check',
  },
  'link-target-dangling': {
    title: 'Quest links to a missing quest',
    meaning: 'A quest link points at a quest that is not in the book, so it showed nothing in FTB either. It is left out.',
    action: 'none',
  },
  'loot-crate': {
    title: 'Loot crates',
    meaning:
      "Tenet has no loot-crate items. The table's entries convert, and quests that gave a crate roll its table straight away, but the crate item itself and its mob drops need a loot-table mod or script if you rely on them.",
    action: 'manual',
  },
  'warning:min-required-tasks': {
    title: '"Any N of" tasks',
    meaning:
      'The quest completed after any few of its tasks (Quests Additions). Tenet completes a quest when every task is done, so it now asks for all of them.',
    action: 'check',
  },
  'missing-text': {
    title: 'Chapters or groups without a title',
    meaning: 'A chapter or chapter group has no title, so it shows with an empty name. Give it one.',
    action: 'check',
  },
  'no-loot-crates': {
    title: 'Loot-crate drops',
    meaning:
      'The book has mobs drop loot crates, and Tenet has no loot crates, so the drops need a loot-table mod or script.',
    action: 'manual',
  },
  'renamed-stage': {
    title: 'Renamed stages',
    meaning:
      'Tenet stage names are ids (lower case, underscores), so the stage was renamed as shown. Scripts that grant or check the old name must use the new one.',
    action: 'manual',
  },
  'renamed-tag': {
    title: 'Renamed tags',
    meaning:
      'Tenet tags use only lower-case letters, digits and underscores, so the tag was respelled as shown. Update anything that looks it up by the old spelling.',
    action: 'check',
  },
  'secret-task': {
    title: 'Secret tasks',
    meaning: 'A Quests Additions secret task stayed hidden until done. Tenet shows every task, so it shows from the start.',
    action: 'check',
  },
  'unknown-loot-crate': {
    title: 'Crates no table opens',
    meaning: 'A reward gave a loot crate that no reward table opens, so it gave nothing in FTB either. It is left out.',
    action: 'none',
  },
  'unmappable-filter': {
    title: 'Item filters a quest cannot check',
    meaning:
      "An item filter asks something Tenet cannot check on its own (such as an item's components), so the task waits on a custom handler under the id shown. Without a script it will not complete.",
    action: 'manual',
  },
  'unmapped-shape': {
    title: 'Pack-drawn quest shapes',
    meaning: "The quest uses a shape drawn by the pack's resource pack. Tenet has no such shape, so it draws as a circle.",
    action: 'check',
  },
  'unrewritten-command': {
    title: 'FTB commands with no Tenet version',
    meaning:
      'A command calls an FTB Quests command that Tenet has no equivalent for, so it is kept word for word and will fail. Rewrite it by hand.',
    action: 'manual',
  },
  'unsupported-flag': {
    title: 'Task options Tenet cannot express',
    meaning:
      'A task setting such as crafting-only, manual-only or consume items has no Tenet equivalent, so the task works without it: it counts items from any source, for instance.',
    action: 'check',
  },
  'untranslatable-reward-title': {
    title: 'Untranslated reward titles',
    meaning:
      "Some reward titles in this language have nowhere to go in Tenet's translation files, so rewards show the main language's wording there.",
    action: 'check',
  },
  'case-collision': {
    title: 'File names that clash on Windows and macOS',
    meaning:
      'Two output files differ only in upper and lower case. On a case-insensitive disk one overwrites the other, so rename one.',
    action: 'manual',
  },
  'bad-autofocus': {
    title: 'Chapter focus points at a missing quest',
    meaning:
      "The quest a chapter opens centred on is not in that chapter, so the chapter opens centred on itself. Pick a quest in chapter.json if you want one.",
    action: 'none',
  },
  'warning:unmapped-field': {
    title: 'Fields with no mapping',
    meaning:
      'This converter has no mapping for these fields, usually settings from add-on mods, and loss was allowed, so they were left out. Check whether any mattered.',
    action: 'check',
  },

  // ----------------------------------------------------------------------------------------- notes
  'synthesised-image-id': {
    title: 'Image ids generated',
    meaning: "Tenet needs an id for every image on a chapter's canvas, and FTB images have none, so one was made from the chapter's name.",
    action: 'none',
  },
  'renamed-shape': {
    title: 'Quest shapes renamed',
    meaning: 'An FTB shape goes by a different name in Tenet (rsquare is rounded). It draws the same.',
    action: 'none',
  },
  'rounded-coordinate': {
    title: 'Positions converted',
    meaning:
      "FTB places things by their centre on a grid; Tenet places them by their top-left corner in pixels. Recorded where the conversion had to round.",
    action: 'none',
  },
  'rounded-rotation': {
    title: 'Rotations rounded',
    meaning: 'Tenet turns images by whole degrees, so a fractional angle was rounded to the nearest.',
    action: 'none',
  },
  'format-version': {
    title: 'FTB file format',
    meaning: 'Which FTB Quests file format the book was written in. Tenet versions its own files separately.',
    action: 'none',
  },
  'loader-flag': {
    title: 'FTB loader settings',
    meaning: 'A setting about how FTB Quests loads its files. It has no meaning in Tenet.',
    action: 'none',
  },
  'lod-off': {
    title: 'Zoom detail levels off',
    meaning:
      "The book draws without Tenet's zoom detail levels, the way FTB did. Delete disableCanvasLod from index.json to try them.",
    action: 'none',
  },
  'unused-loot-settings': {
    title: 'Unused loot-crate settings',
    meaning: 'Loot-crate settings that did nothing, because crate drops were off. They are not written.',
    action: 'none',
  },
  'blank-table-entry': {
    title: 'Empty reward-table entries',
    meaning: 'A table entry names no reward. Its weight still counts, as a roll that gives nothing, as in FTB.',
    action: 'none',
  },
  'blank-tag': {
    title: 'Blank tags',
    meaning: 'An empty tag names nothing, so it is dropped.',
    action: 'none',
  },
  'byte-flag-component': {
    title: 'Item flags stored as bytes',
    meaning: 'Item data stored as 0 or 1 reads as false or true, as 1.21 expects.',
    action: 'none',
  },
  'chapter-gate': {
    title: 'Chapter gates',
    meaning:
      'A quest waited on a whole chapter. Tenet waits on quests, so the chapter gains a gate quest that completes with its required quests, and the waiting quest waits on that.',
    action: 'none',
  },
  'note:duplicate-file': {
    title: 'Duplicate files',
    meaning: 'An identical copy of another file, left by an earlier build of the pack. It converts once.',
    action: 'none',
  },
  'economy-currency': {
    title: 'Currency rewards',
    meaning:
      'An Eternal Currencies coin reward becomes tenet:currency, which pays through the economy mod registered with Tenet. Check the pack has one.',
    action: 'check',
  },
  'empty-item-reward': {
    title: 'Item rewards with no item',
    meaning: 'It gave nothing in FTB either, so nothing changes.',
    action: 'none',
  },
  'fluid-stack-amount': {
    title: 'Fluid amounts',
    meaning: "The task's amount is taken from the fluid stack itself, as FTB read it.",
    action: 'none',
  },
  'legacy-filter': {
    title: '1.20 item filters',
    meaning: 'An Item Filters stack from 1.20 reads as the equivalent Tenet filter.',
    action: 'none',
  },
  'legacy-hide-key': {
    title: 'Old "hide" setting',
    meaning: 'The 1.20 spelling hide reads as hide_until_deps_visible, as FTB read it.',
    action: 'none',
  },
  'legacy-stack': {
    title: '1.20 item stacks',
    meaning: 'Item stacks in the 1.20 shape (Count, tag) read as 1.21 stacks.',
    action: 'none',
  },
  'loot-crate-roll': {
    title: 'Crate rewards roll their table',
    meaning: 'Tenet has no crate items, so a reward that gave a crate rolls its table when claimed, as opening the crate would.',
    action: 'none',
  },
  'note:min-required-tasks': {
    title: '"Any one of" item tasks',
    meaning: 'The quest completed on any one of several item tasks. They become one task that accepts any of those items.',
    action: 'none',
  },
  'no-book-toast': {
    title: 'Book completion toast',
    meaning: "The book turned off FTB's all-quests-done toast. Tenet has none, so nothing changes.",
    action: 'none',
  },
  'no-chapter-toast': {
    title: 'Chapter completion toast',
    meaning: 'The chapter turned off its completion toast. Tenet announces every finished chapter and has no switch for it.',
    action: 'none',
  },
  'player-command-console': {
    title: 'Console commands',
    meaning:
      "A command that ran from the server console now runs as the player at the console's permission level, with its output hidden as before.",
    action: 'none',
  },
  'player-level-command': {
    title: 'Command permission level',
    meaning:
      "FTB ran this command at the player's own permission level, so it failed for anyone but an operator. Tenet runs it at level 2, so it now works for every player. Check that is what you want.",
    action: 'check',
  },
  'recovered-item': {
    title: 'Missing items recovered',
    meaning: "FTB had swapped an item it could not find for a placeholder. The original item is used again.",
    action: 'none',
  },
  'rewritten-dead-edge': {
    title: 'Dependencies on tasks',
    meaning: 'The quest waited on a task or reward. Tenet waits on quests, so it waits on the quest that owns it.',
    action: 'none',
  },
  'secret-quest': {
    title: 'Secret quests',
    meaning: 'A Quests Additions secret quest is invisible until it is done, as before.',
    action: 'none',
  },
  'stripped-slash': {
    title: 'Leading slash removed',
    meaning: 'Tenet writes commands without the leading /. They run the same.',
    action: 'none',
  },
  'click-page-suffix': {
    title: 'Images that open a quest page',
    meaning: "Tenet's quest cards scroll rather than page, so the image opens the quest.",
    action: 'none',
  },
  'click-unknown-type': {
    title: 'Image clicks with no target',
    meaning: "The image's click names nothing to open, so it is drawn without one.",
    action: 'none',
  },
  'dep-control-pts': {
    title: 'Hand-bent dependency lines',
    meaning: 'Tenet routes dependency lines itself, so hand-placed bends are not kept.',
    action: 'none',
  },
  'duplicate-dependency': {
    title: 'Dependencies listed twice',
    meaning: 'The quest names the same dependency twice; it waits on it once.',
    action: 'none',
  },
  'exclusive-group': {
    title: 'Mutually exclusive quests',
    meaning: 'Quests that lock each other share an exclusive group in Tenet, so completing one still locks the others.',
    action: 'none',
  },
  'forced-remigration': {
    title: 'Converted again on purpose',
    meaning: 'The input had already been converted, and "convert anyway" was ticked.',
    action: 'none',
  },
  'icon-both-arms': {
    title: 'Icons naming an entity and a picture',
    meaning: 'An icon names both, and the entity is drawn.',
    action: 'none',
  },
  'ignored-build-artefact': {
    title: 'Merged language files',
    meaning: 'A *_merged language file is built from the others, so only the real locale files convert.',
    action: 'none',
  },
  'inert-cooldown': {
    title: 'Cooldowns on quests that never repeat',
    meaning: 'A repeat cooldown on a quest that does not repeat did nothing, so it is not written.',
    action: 'none',
  },
  'inert-label-keys': {
    title: 'Unused image labels',
    meaning: 'Label settings on an image that shows no text did nothing, so they are not written.',
    action: 'none',
  },
  'location-no-dimension': {
    title: 'Locations without a dimension',
    meaning: 'A location or dimension task names no dimension, so it counts in any.',
    action: 'none',
  },
  'no-op-field': {
    title: 'Settings that do nothing',
    meaning: 'A setting neither FTB nor Tenet reads, so it is not written.',
    action: 'none',
  },
  'nudged-position': {
    title: 'Overlapping quests moved apart',
    meaning: 'Two quests sat on the same spot, so one moved a step down and right, letting both be clicked.',
    action: 'none',
  },
  'passthrough-skipped': {
    title: 'Files too big to copy',
    meaning:
      'Large files such as mod jars and saves were listed, not copied into the output. They are not part of the quest book; leave them where they are.',
    action: 'none',
  },
  'replaced-output': {
    title: 'Old output replaced',
    meaning: 'Files from an earlier conversion were replaced by this one rather than duplicated.',
    action: 'none',
  },
  'requires-dangling': {
    title: 'Images waiting on a missing quest',
    meaning: 'An image waits on a quest that is not there, so it always shows.',
    action: 'none',
  },
  'rewrote-command': {
    title: 'Commands renamed for Tenet',
    meaning: 'A command that named FTB Quests now names Tenet.',
    action: 'none',
  },

  // ---------------------------------------------------------------------------------------- errors
  'unmapped-field': {
    title: 'Fields with no mapping',
    meaning:
      'This converter has no mapping for these fields, usually settings from add-on mods. Convert with loss allowed to leave them out (each one listed), or report them so a mapping can be added.',
    action: 'fix',
  },
  'parse-error': {
    title: 'Files that will not read',
    meaning: 'The file is not valid SNBT at the line shown, often a stray character or an unclosed bracket.',
    action: 'fix',
  },
  'already-migrated': {
    title: 'Already converted',
    meaning: 'The input is already a Tenet book. Tick "convert anyway" to run it regardless.',
    action: 'fix',
  },
  'missing-book': {
    title: 'No quest book',
    meaning: 'Nothing in the input has a data.snbt, so there is no FTB Quests book to convert.',
    action: 'fix',
  },
  'unsupported-version': {
    title: 'Unsupported book format',
    meaning: 'This converter reads FTB Quests format 13, the format of FTB Quests for 1.21.1.',
    action: 'fix',
  },
  'dangling-group': {
    title: 'Chapters in a missing group',
    meaning: 'A chapter names a chapter group that does not exist. Fix the group in chapter_groups.snbt or the chapter.',
    action: 'fix',
  },
  'dangling-reference': {
    title: 'References to missing quests or tables',
    meaning: 'A quest depends on a quest, or a reward names a table, that is not in the book.',
    action: 'fix',
  },
  'dependency-cycle': {
    title: 'Dependency loops',
    meaning: 'Quests wait on each other in a circle, so none of them could ever unlock.',
    action: 'fix',
  },
  'duplicate-book': {
    title: 'Two copies of a book file',
    meaning: 'The input holds two copies of the same book file. Keep one.',
    action: 'fix',
  },
  'id-collision': {
    title: 'Ids used twice',
    meaning: 'Two quests, chapters, groups or tables claim the same id. Give one a new id.',
    action: 'fix',
  },
  'invalid-json': {
    title: 'Output that is not valid JSON',
    meaning: 'A converted file did not come out as valid JSON. This is a converter bug: please report it.',
    action: 'fix',
  },
  'link-id-shadow': {
    title: 'Quest links named like a quest',
    meaning: 'A quest link shares its name with a quest, chapter or group, so clicking it could open the wrong one.',
    action: 'fix',
  },
  'missing-locale': {
    title: 'No text in the main language',
    meaning: 'The book has no text in the canonical locale. Set the canonical locale under Options to one the pack has.',
    action: 'fix',
  },
  'schema-violation': {
    title: "Output Tenet would refuse",
    meaning: "A converted file does not match Tenet's schema. This is a converter bug: please report it.",
    action: 'fix',
  },
  'unknown-auto': {
    title: 'Unknown auto-claim setting',
    meaning: 'An auto-claim setting names a mode FTB does not have.',
    action: 'fix',
  },
  'unknown-preset': {
    title: 'Unknown quest presets',
    meaning: 'A quest uses a shape preset that data.snbt does not define.',
    action: 'fix',
  },
  'unknown-progression': {
    title: 'Unknown progression mode',
    meaning: 'A progression setting is neither flexible nor linear.',
    action: 'fix',
  },
  'malformed-coordinate': {
    title: 'Positions that are not numbers',
    meaning: 'A position is missing or not a finite number.',
    action: 'fix',
  },
  'malformed-field': {
    title: 'Settings of the wrong kind',
    meaning: 'A setting holds the wrong kind of value, such as text where a number belongs.',
    action: 'fix',
  },
  'malformed-icon': {
    title: 'Broken icons or items',
    meaning: 'An icon or item is not something the converter can read.',
    action: 'fix',
  },
  'malformed-id': {
    title: 'Ids that are not FTB ids',
    meaning: 'An id is not the 16-digit hex FTB Quests writes.',
    action: 'fix',
  },
  'malformed-image': {
    title: 'Broken canvas images',
    meaning: 'An image on a chapter canvas is missing something it needs, such as its id.',
    action: 'fix',
  },
  'malformed-lang': {
    title: 'Broken translations',
    meaning: 'A translation key holds something other than text.',
    action: 'fix',
  },
  'malformed-link': {
    title: 'Broken quest links',
    meaning: 'A quest link is missing its id, its target or its position.',
    action: 'fix',
  },
  'malformed-preset': {
    title: 'Broken quest presets',
    meaning: 'A shape preset in data.snbt is not a shape plus a size.',
    action: 'fix',
  },
  'malformed-quest': {
    title: 'Broken quests',
    meaning: 'A quest entry is not something the converter can read.',
    action: 'fix',
  },
  'malformed-reference': {
    title: 'Broken references',
    meaning: 'A dependency or reward-table reference is not a valid id.',
    action: 'fix',
  },
  'malformed-reward': {
    title: 'Broken rewards',
    meaning: 'A reward is not something the converter can read.',
    action: 'fix',
  },
  'malformed-task': {
    title: 'Broken tasks',
    meaning: 'A task is not something the converter can read.',
    action: 'fix',
  },
};

const FALLBACK: Record<Severity, Action> = { error: 'fix', warning: 'check', note: 'none' };

/**
 * The explanation for one code at one severity. With loss allowed, the core keeps some errors as warnings
 * and leaves out what they name; those read as manual work rather than as a stopped run.
 */
export function codeInfo(code: string, severity: Severity): CodeInfo {
  const info = INFO[`${severity}:${code}`] ?? INFO[code];
  if (info === undefined) {
    return { title: code, meaning: '', action: FALLBACK[severity] };
  }
  if (severity !== 'error' && info.action === 'fix') {
    return {
      ...info,
      action: 'manual',
      meaning: `${info.meaning} Loss was allowed, so instead of stopping the run, the piece it names was left out: add it back by hand if it matters.`,
    };
  }
  return info;
}
