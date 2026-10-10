/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,

  // Static export, mirroring apps/docs/next.config.mjs: a directory of files and nothing
  // else — no server, no runtime. Client-side conversion fits this perfectly; the converter
  // (@ellipog/migrator-core, pure bytes in → bytes out) runs in a Web Worker, and zip I/O
  // runs on @zip.js/zip.js. Never add a server here: user file data must never leave the browser.
  output: 'export',

  // Emit out/<route>/index.html so any static host serves it without rewrite rules.
  trailingSlash: true,

  // Required with output: 'export' — there is no server to run the optimiser.
  images: { unoptimized: true },

  // The converter is a verbatim vendor snapshot of @ellipog/migrator-core
  // (vendor/migrator-core, refreshed by bun scripts/sync-migrator-core.mjs).
  // A `file:` dep was tried first and rejected: bun copies out-of-workspace file
  // deps (Windows EPERM on the core's nested node_modules), and the copy would
  // break when Vercel roots at ellipog.dev. The snapshot lives inside this app,
  // so Next compiles it natively — no transpilePackages needed. Never hand-edit
  // vendor/: re-sync and commit instead.
  devIndicators: false,
};

export default config;
