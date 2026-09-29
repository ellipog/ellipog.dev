import { defineDocs } from 'fumadocs-mdx/macro';
import { loader } from 'fumadocs-core/source';

/**
 * The content source: every page under `content/docs`.
 *
 * That folder is generated. `scripts/sync.mjs` wipes it and rebuilds it from each mod's own
 * repository before every build, so nothing here is authored on this site and nothing here can
 * disagree with the code it describes. It is gitignored for exactly that reason.
 */
const docs = defineDocs({ dir: 'content/docs' });

export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
});
