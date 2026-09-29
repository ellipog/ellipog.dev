'use client';

import { useRef, useState, type ReactNode } from 'react';

/**
 * A code block with a copy button.
 *
 * The text is read from the rendered element rather than passed through as a prop, which is the whole
 * reason this is a client component: the alternative is extracting the raw source at build time and
 * shipping it twice, once as markup and once as a string. Reading `textContent` off the `pre` is
 * always exactly what the reader can see, including any syntax markup inside it.
 *
 * `navigator.clipboard` needs a secure context. That is `https://` or `localhost`, and this is a
 * static site that will only ever be served over one of the two -- but the failure is handled anyway,
 * because a copy button that throws is worse than one that does nothing.
 */
export function CodeBlock({
  children,
  // `icon` comes from Fumadocs' rehype plugin and is a raw SVG string. It is dropped rather than
  // rendered: this design has no icons, and React would warn about every one of them.
  icon: _icon,
  ...props
}: {
  children?: ReactNode;
  icon?: string;
  [key: string]: unknown;
}) {
  const ref = useRef<HTMLPreElement>(null);
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copy() {
    const text = ref.current?.textContent ?? '';
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
    window.setTimeout(() => setState('idle'), 1400);
  }

  return (
    <div className="code">
      <pre ref={ref} {...props}>
        {children}
      </pre>
      <button type="button" className="code-copy" onClick={copy} aria-label="Copy this code">
        {state === 'copied' ? 'copied' : state === 'failed' ? 'no access' : 'copy'}
      </button>
    </div>
  );
}
