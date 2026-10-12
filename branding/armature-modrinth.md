![Armature, a shared library mod for Minecraft 1.21.1 by ellipog](https://files.catbox.moe/asp22t.png)

The shared foundation for Fabric and NeoForge mods: the loader seam, data, events, networking, and teams one layer down, plus a client UI toolkit on top.

Standalone: nothing in it is specific to any one consumer. Players install it and forget it. Mods build on it instead of reinventing it.

## Why Armature

- **One platform seam, two loaders.** Lifecycle, registries, events, and networking behind a single SPI. Write against Armature and ship one jar for Fabric and NeoForge.
- **Strict JSON with file, line, and did-you-mean.** Presence and type checks with suggestions per path, and problem reports your own format can reuse.
- **A UI toolkit that runs headless.** Layout, text, shapes, themes, and widgets tested in milliseconds with no client attached. Drawing agrees with hit-testing by construction.
- **A team resolution chain.** Explicit provider, then FTB Teams, then Open Parties and Claims, then the stored fallback. One call, whatever the server already runs.
- **Theming scoped per mod.** Each mod owns its appearance, so no two mods share one player's theme file.

## Using it

Drop the jar in `mods/`, on either loader. Fabric also needs Fabric API.

For mod developers: compile against the published artifact (see the releases page for the current coordinate; it follows the shape `dev.ellipog:armature-common-<minecraft-line>:<release>` on `https://maven.ellipog.dev`), declared `compileOnly` since Armature is a separate jar at runtime.

## Links

- [Manual](https://ellipog.dev/docs/armature) · [Source](https://github.com/ellipog/armature) · [Issues](https://github.com/ellipog/armature/issues)

[![BisectHosting Minecraft server hosting, 25 percent off with code mcstellar (affiliate link)](https://cdn.modrinth.com/data/cached_images/b8548210eac7c7338b01fe0469e84a7bbbed41fc.png)](https://www.bisecthosting.com/mcstellar)
[![Engineered by Aaen Studios: aaenz.no](https://files.catbox.moe/qq1h88.png)](https://aaenz.no)
