'use client';

import { useEffect, useState } from 'react';

/**
 * The theme switch.
 *
 * Light is the default; dark is available. The attribute lives on `<html>` and is set by an inline
 * script in the layout before paint, so there is no flash of the wrong theme -- which is why this
 * component reads the attribute rather than deciding the theme itself. Two places choosing a theme
 * is two places that can disagree.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('theme', next);
    } catch {
      // Private browsing denies storage. The theme still applies for this page; only the memory of
      // it is lost, which is not worth failing a render over.
    }
  }

  // The visible label names the theme you would switch *to*, so the accessible name has to say the
  // same thing -- "Switch theme" alone would leave a screen reader without the current state.
  const target = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={`Switch to ${target} theme`}
    >
      {target}
    </button>
  );
}
