# ellipog.dev

Documentation and project catalog for the ellipog Minecraft mods.

The site is static: a directory of HTML files with no server, no runtime and no database. Every
documentation page is copied from the repository that owns the mod at build time, so nothing on the
site can fall behind the code it describes. **Nothing is written here.**

---

## Running it

```cmd
bun install
bun run build      :: sync, fetch stats, build, then check — into apps/docs/out
bun run dev        :: sync, then a dev server
```

`bun run build` runs the sync first and the check last, so the two steps cannot come out of order and
a structurally wrong site cannot ship silently.

Uses **Bun** 1.3+. Node 22+ also works — Fumadocs needs it, and `.nvmrc` pins 24 — but note that the
scripts use bun's `--filter` rather than npm's `--workspace`, because bun does not implement the
latter and silently forwards it to the script as an argument instead. Running these with `npm run`
will not work as written; see `AGENT.md`.

---

## Layout

    ellipog.dev/
    ├── manifest.json          the author, the suite, and the released projects shown on the page
    ├── scripts/
    │   ├── sync.mjs           copies each mod's docs in, wiping the target first
    │   ├── stats.mjs          fetches both platforms' download counts and the avatar
    │   └── check.mjs          asserts the built site is what it should be
    ├── AGENT.md               conventions, and the known gaps
    └── apps/
        └── docs/              the Next.js + Fumadocs site
            ├── app/           routes, and global.css holding the whole design language
            ├── components/    theme toggle, arrow
            ├── lib/source.ts  the Fumadocs content source
            ├── content/       GENERATED — gitignored
            ├── public/        GENERATED avatar — gitignored
            └── out/           the static build

---

## The design language

White ground, near-black text, and the structure carried entirely by 1px hairlines rather than
containers: no shadows, no gradients, no rounded corners, and dividers that run edge to edge. Prose is
sans, and anything that is an identifier — a mod id, a path, a version — is monospace. Light is the
default; dark is one attribute away on `<html>`.

Four rules in `apps/docs/app/global.css` exist because the style fails without them, and all four are
commented where they live.

1. **The hairline has a contrast floor.** `#E4E4E7`, not the near-invisible grey the style invites,
   which disappears on a 1080p panel at 100% zoom.
2. **Lines are drawn once, by the container.** A grid of cells each drawing all four borders produces
   2px seams where two meet.
3. **Colour is earned.** Paper, ink, and one green that means "this is where the code is". Hover
   inverts rather than tints, because an inversion is structure and a tint is decoration.
4. **The scrollbar is drawn, not inherited.** Redrawn as a hairline track with an ink fill — a
   progress indicator, not a grey bevelled trough with arrow buttons. Hidden was the other option and
   was not taken: the scrollbar is the only thing saying a long page continues past the fold.

---

## How a page gets here

1. `sync.mjs` reads `manifest.json` and wipes `apps/docs/content/`.
2. For each mod with `status: "active"`, it finds the folder named by `localPath` beside this one,
   takes its `README.md` as the landing page, and each `.md`/`.mdx` under its `docs/` folder as a
   further page. Frontmatter is prepended from the manifest, so a mod's name is written down once.
3. `stats.mjs` fetches download counts from Modrinth and CurseForge and downloads the profile picture
   into `apps/docs/public/`. Both are best-effort: a build with no network still produces a site, and
   a page with no numbers is better than a page with stale ones. An avatar that fails to fetch falls
   back to the square mark beside the name.
4. Fumadocs compiles the MDX, the catalog and sidebar read the manifest, and Next exports the lot to
   `apps/docs/out/` as static HTML.

A mod whose folder is absent is skipped with a line saying so — four of the six are planned and have
no repository yet, and a build that refused to run for that reason would be a build nobody could run.

---

## Deploying

`apps/docs/out/` is the whole site. Upload it to any static host; there is nothing to configure and
no rewrite rules are needed, because `trailingSlash` makes Next emit `docs/tasked/index.html` rather
than `docs/tasked.html`.

Not set up here, deliberately — deployment is a separate decision from the build, and this repository
ends at a verified local `bun run build`.

---

## Licence

MIT.
