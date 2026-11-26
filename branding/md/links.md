# links.md: hosted banner URLs (ellipog.dev)

The `branding/out/` PNGs, served by the docs app from
`apps/docs/public/branding/` at `https://ellipog.dev/branding/<name>.png`, so one
URL works in every description. If a banner is re-exported, copy it into
`apps/docs/public/branding/` too and redeploy: a PNG edit in `out/` does not move the hosted copy.

| Banner | URL |
|---|---|
| header-tenet | https://ellipog.dev/branding/header-tenet.png |
| header-armature | https://ellipog.dev/branding/header-armature.png |
| tenet-migrator | https://ellipog.dev/branding/tenet-migrator.png |
| shockbyte | https://ellipog.dev/branding/shockbyte.png |
| discord | https://ellipog.dev/branding/discord.png |
| studio | https://ellipog.dev/branding/studio.png |
| extra-origins-smp (modpack logo, moved off bisecthosting.com) | https://ellipog.dev/branding/extra-origins-smp.png |

## Copy-paste

Headers (top of the description, alt text mandatory on Modrinth):

```md
![Tenet, a visual questing engine for Minecraft 1.21.1 by ellipog](https://ellipog.dev/branding/header-tenet.png)
```

```md
![Armature, a shared library mod for Minecraft 1.21.1 by ellipog](https://ellipog.dev/branding/header-armature.png)
```

Migrator CTA (mid-page on Tenet's pages only. The PNG cannot be clicked,
so the markdown wraps it in the destination):

```md
[![Coming from FTB Quests? Convert your quest books to Tenet JSON at tenet.ellipog.dev](https://ellipog.dev/branding/tenet-migrator.png)](https://tenet.ellipog.dev)
```

Shockbyte banner (bottom of the description; the same URL on Modrinth, CurseForge and GitHub):

```md
[![Shockbyte Minecraft server hosting, 25 percent off with code STELLAR25 (affiliate link)](https://ellipog.dev/branding/shockbyte.png)](https://shockbyte.com/partner/stellar)
```

To use a Modrinth-hosted copy instead, upload `shockbyte.png` once through the Modrinth editor and
swap its `cdn.modrinth.com/data/cached_images/...` URL in for the image URL above.

Discord banner (directly above the Shockbyte banner):

```md
[![Join the ellipog Discord server](https://ellipog.dev/branding/discord.png)](https://discord.gg/uy9QFaQWR7)
```

Studio banner (under the Shockbyte banner, closes the page):

```md
[![Engineered by Aaen Studios: aaenz.no](https://ellipog.dev/branding/studio.png)](https://aaenz.no)
```

## Modrinth AI content disclosure

For the disclosure tab on each project page. Copy-paste as-is:

```
AI tools assisted with code, version-porting, and documentation drafting. Architecture, debugging, and in-game testing are handled entirely by the maintainer.
```
