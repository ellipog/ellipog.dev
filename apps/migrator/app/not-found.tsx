import type { Metadata } from 'next';

/*
 * The 404, rendered to `404.html` by the static export — same construction as
 * `apps/docs/app/not-found.tsx`.
 *
 * It exists so the head has exactly one `<title>`: without it, Next renders
 * the layout's default title and its own `404: This page could not be found.`
 * into the same head. The title below goes through the layout's template, so
 * the tab names the site like every other page. And it carries `noindex`,
 * which is why `robots.txt` needs no disallow rule.
 */
export const metadata: Metadata = {
  title: 'Not found',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main>
      <section className="hero">
        <p className="eyebrow">404</p>
        <h1>Not found.</h1>
        <p className="sub">
          Nothing lives at this address. <a href="/">Back to the migrator</a>
        </p>
      </section>
    </main>
  );
}
