import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,

  // Static export. The site is a directory of files and nothing else: no server, no runtime, no
  // database. That is a deliberate constraint rather than a limitation -- a docs site with a
  // runtime is a docs site that can go down.
  output: 'export',

  // Emit `out/mods/tenet/index.html` rather than `out/mods/tenet.html`, so any static host serves
  // it at `/mods/tenet/` without a rewrite rule.
  trailingSlash: true,

  // Required with `output: 'export'` -- there is no server to run the optimiser.
  images: { unoptimized: true },

  // Turns off the floating dev-tools badge in development. It sits in the bottom-left corner on top
  // of the catalog, and because this design's whole premise is that every edge is visible, a badge
  // over the first cell reads as a layout fault rather than as tooling.
  //
  // Worth a note on how this was got wrong first, because the mistake is repeatable: a grep for this
  // key against `next/dist/server/config-schema.js` returned nothing and I concluded it was not a
  // supported option. The grep had been given a *file* where it wanted a *folder*. Searching
  // `next/dist/server` with `*.js` finds it immediately -- `config-schema.js:598`, `config-shared.js:117`,
  // and `config.js:999`. A key that is not in the schema is ignored in silence, which is the failure
  // I thought I was looking at and was not.
  devIndicators: false,
};

export default withMDX(config);
