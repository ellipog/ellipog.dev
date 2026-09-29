import type { MDXComponents } from 'mdx/types';

import { Callout } from './callout';
import { CodeBlock } from './code-block';
import { H2, H3 } from './heading';
import { Step, Steps } from './steps';
import { Tab, Tabs } from './tabs';

/**
 * The elements a documentation page can use.
 *
 * Two kinds of thing are in here, and the difference matters when a page will not render:
 *
 * 1. **Markdown mapped onto a component.** `pre` becomes a code block with a copy button, `h2` and
 *    `h3` gain anchors. Nothing in the source changes -- a document written in plain markdown gets
 *    these for free, which is the point.
 * 2. **Components written in the source.** `<Tabs>`, `<Steps>` and `<Callout>` are JSX in an `.mdx`
 *    file and resolve against this map, so no document imports anything.
 *
 * `Callout` is the exception that is both: it is written as a GFM alert (`> [!NOTE]`) and rewritten
 * into the component by `scripts/sync.mjs`, so it needs no import and still reads as markdown.
 *
 * Every entry here is documented in `AGENT.md` with a note on when it beats plain prose. Adding one
 * without adding it there is how a design system quietly stops being one.
 */
export const mdxComponents: MDXComponents = {
  pre: CodeBlock,
  h2: H2,
  h3: H3,
  Callout,
  Tabs,
  Tab,
  Steps,
  Step,
};
