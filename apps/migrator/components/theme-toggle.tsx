'use client';

/**
 * The theme switch.
 *
 * Light is the default; dark is available. The attribute lives on `<html>` and is set by an inline
 * script in the layout before paint, so there is no flash of the wrong theme.
 *
 * **This component holds no state, and both the icon and the accessible name are chosen by CSS.**
 * The obvious implementation mirrors the attribute into `useState`, and it works -- but it is a
 * second copy of an answer that already exists on `<html>`, and the two can disagree. The window is
 * small and real: a reader whose stored theme is dark sees the sun, drawn from the attribute the
 * script set before paint, while a screen reader is told "switch to dark" from state that has not
 * caught up yet. Rendering both states and letting `[data-theme]` pick between them has no window,
 * because there is nothing to catch up.
 *
 * Both labels are `.sr-only` rather than an `aria-label`, for the same reason: an `aria-label` is a
 * string this component would have to compute, and computing it means reading the theme, which means
 * state. The inactive label is `display: none`, which takes it out of the accessibility tree, so the
 * button announces exactly one of them. The name stays informative -- the component keeps saying
 * which way the switch goes rather than falling back to a neutral "toggle theme", which would leave
 * a screen reader without the current state.
 */
export function ThemeToggle() {
  function toggle() {
    // Read at click time rather than at render time. The attribute is the source of truth, and it is
    // set by the layout's script before this component ever runs.
    const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('theme', next);
    } catch {
      // Private browsing denies storage. The theme still applies for this page; only the memory of
      // it is lost, which is not worth failing a render over.
    }
  }

  return (
    <button type="button" className="theme-toggle" onClick={toggle}>
      {/* One stroke each, at the size of the label text they sit beside. `aria-hidden` because the
          `.sr-only` spans below are the accessible content -- an icon announced as well would say
          the same thing twice in one breath. */}
      <svg
        className="icon-moon"
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
      <svg
        className="icon-sun"
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
      <span className="sr-only label-to-dark">Switch to dark theme</span>
      <span className="sr-only label-to-light">Switch to light theme</span>
    </button>
  );
}
