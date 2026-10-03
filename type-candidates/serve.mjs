/**
 * Serves the built site (apps/docs/out) at /, the candidate fonts at /fonts, and this folder at /spec.
 * The point is that the specimens are the *real* page: nothing is redrawn, only the font tokens move.
 */
const HERE = import.meta.dir;
const OUT = `${HERE}/../apps/docs/out`;

Bun.serve({
  port: 8791,
  fetch(req) {
    const path = decodeURIComponent(new URL(req.url).pathname);
    if (path.startsWith('/fonts/')) return serve(`${HERE}/fonts/${path.slice(7)}`);
    if (path === '/spec' || path === '/spec/') return serve(`${HERE}/index.html`);
    if (path.startsWith('/spec/')) return serve(`${HERE}${path.slice(5)}`);
    return serve(`${OUT}${path.endsWith('/') ? `${path}index.html` : path}`);
  },
});

function serve(file) {
  const f = Bun.file(file);
  return f.size === 0 ? new Response('not found', { status: 404 }) : new Response(f);
}

console.log('serving http://127.0.0.1:8791/spec/');
