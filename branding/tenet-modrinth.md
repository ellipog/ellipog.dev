![Tenet, a visual questing engine for Minecraft 1.21.1 by ellipog](https://files.catbox.moe/ww3cgj.png)

The modern questing engine for Fabric and NeoForge.

Build quest lines in a modern in-game editor, or describe them in JSON. Tenet draws them in a quest book, and the server decides what counts as done. It ships no quests of its own: it is an engine, not content.

## Why Tenet

- **An editor that does everything.** The whole format in game: quests, tasks, rewards, conditions, chapters, reward tables, themes, with bulk-select and batch edits, undo per chapter, and deletes that come back.
- **And plain files underneath.** The editor writes the same JSON these docs describe: version-controlled, diffable, pack-friendly, with schema and validation, KubeJS scripting, per-language files, and open registries for addon mods.
- **The server decides what counts.** Progress is tracked server-side, so players can't cheat quests complete by editing their own files.
- **Broken files fail loudly and locally.** The validator reports path and line and skips the file. One broken quest never takes the server down.
- **Parties share progress.** Built on Armature teams with `ONE_MEMBER`, `POOLED`, or `OWNER_ONLY` counting, server-authoritative throughout.

[![Coming from FTB Quests? Convert your quest books to Tenet JSON at tenet.ellipog.dev](https://files.catbox.moe/3sal6z.png)](https://tenet.ellipog.dev)

## Playing

Install **Tenet and Armature** together, on client and server. The loader will name Armature if it is missing.

Open the book with the Quest Book item or the `B` key, and pin quests from the HUD. Details live in the manual:

- [The quest book and HUD](https://ellipog.dev/docs/tenet#the-book-briefly) - canvas, claims, parties
- [Commands](https://ellipog.dev/docs/tenet/commands) - every `/tenet` command
- [HUD](https://ellipog.dev/docs/tenet/hud) - pinning quests and notices

## Making quests

Most players never touch a file: press `B` and build quests in the in-game editor, with undo per chapter.

Underneath, it is all JSON: `config/tenet/quests/`, one folder per group, one file per quest, `/tenet reload` to apply. Everything a pack needs for version control:

- [Manual front door](https://ellipog.dev/docs/tenet)
- [Folder format](https://ellipog.dev/docs/tenet/authoring/quest-files)
- [Quest fields](https://ellipog.dev/docs/tenet/authoring/quests)
- [Tasks](https://ellipog.dev/docs/tenet/authoring/tasks) · [Rewards](https://ellipog.dev/docs/tenet/authoring/rewards) · [Conditions](https://ellipog.dev/docs/tenet/authoring/conditions)
- [Validation](https://ellipog.dev/docs/tenet/authoring/validation) · [Languages](https://ellipog.dev/docs/tenet/authoring/languages) · [KubeJS](https://ellipog.dev/docs/tenet/authoring/kubejs) · [FTB mapping](https://ellipog.dev/docs/tenet/authoring/ftb-mapping)

## Links

- [Manual](https://ellipog.dev/docs/tenet) · [Source](https://github.com/ellipog/tenet) · [Issues](https://github.com/ellipog/tenet/issues)

[![Join the ellipog Discord server](https://files.catbox.moe/tcwngu.png)](https://discord.gg/uy9QFaQWR7)
[![BisectHosting Minecraft server hosting, 25 percent off with code mcstellar (affiliate link)](https://files.catbox.moe/mjxxb8.png)](https://www.bisecthosting.com/mcstellar)
