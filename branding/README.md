# branding/

HTML masters that export to PNGs for project descriptions (Modrinth /
CurseForge / GitHub README). Two canvas sizes: the slim header is
**1920×320 (6:1)**. It is a header, not a poster. The two CTA
banners are **1920×480 (4:1)** so they stack cleanly. At the ~800px
columns the platforms render, both are 2.4x, retina-sharp without a 4K file.

The design language is the site's: paper ground, ink text, hairline
blueprint grid, 4px ink frame, zero radius, system stacks. No shadows, no
gradients, no webfonts. Nothing that can fail to load at screenshot time.

## Files

| Master | Exports to | Use |
|---|---|---|
| `header-slim.html` (`?mod=tenet` \| `?mod=armature`) | `out/header-<mod>.png` (1920×320) | Top of every mod description: icon + title + summary, no versions |
| `tenet-migrator.html` | `out/tenet-migrator.png` | Mid-page CTA on **Tenet's** pages only: FTB Quests → migrator funnel |
| `bisect.html` | `out/bisect.png` | Bottom of descriptions: BisectHosting affiliate banner |
| `discord.html` | `out/discord.png` (1920×180) | Directly above bisect: Discord community strip |
| `studio.html` | `out/studio.png` (1920×80) | Under bisect, closes the page: studio credit strip |
| `md/tenet-modrinth.md` / `md/armature-modrinth.md` / `md/create-stellar.md` / `md/stellar-companion.md` | copy-paste | Full Modrinth bodies: banners + copy, Alt text included, CTAs link-wrapped |

`out/` is where exports land. It is not committed. Upload the PNG through
each platform's UI (Modrinth and CurseForge re-host; GitHub READMEs can use
the repo raw URL or the platform upload).

## Export (same for all three)

1. Open the HTML file in Chromium/Edge at **100% zoom**.
2. DevTools → Elements → select `div.canvas`.
3. Three-dot menu → **Capture node screenshot**.
4. Save into `branding/out/` under the name above.

No build step, no dependency. If the canvas ever renders wider than 1920,
check the zoom first. That is the failure this procedure has.

## Embed snippets (copy-paste)

Alt text is mandatory on Modrinth. A project can be rejected without it.
The two CTA banners are LINKED images: a PNG cannot be clicked, so the
markdown wraps it in the destination.

```md
![Tenet, a visual questing engine for Minecraft 1.21.1 by ellipog](header-tenet.png)
```

```md
[![Coming from FTB Quests? Convert your quest books to Tenet JSON at tenet.ellipog.dev](tenet-migrator.png)](https://tenet.ellipog.dev)
```

```md
[![BisectHosting Minecraft server hosting, 25 percent off with code mcstellar (affiliate link)](bisect.png)](https://www.bisecthosting.com/mcstellar)
```

## Placement rules

- Header first, migrator mid-page (Tenet only, above the quest docs),
  bisect LAST. CurseForge asks partnership banners to live at the bottom;
  Modrinth reviewers think the same way even where it is unwritten.
- One header per page. Never put the migrator banner on Armature's page.
  It is Tenet's funnel, and a CTA for another mod reads as a misplaced ad.
- The `HOSTING PARTNER` badge in `bisect.html` is load-bearing disclosure,
  same rule as the site's sponsor band. Do not export a version without it.

## Adding a mod

`header-slim.html` reads its copy from the `MODS` table at the bottom of
the file (values from `manifest.json`). When a mod becomes certain, add one
entry, export `out/header-<id>.png`, done. No layout change: the table is
data, not layout, same idea as the manifest.
