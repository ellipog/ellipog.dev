import { defaultVersion, sectionOf, siblingOf, versionOf, versionsOf } from '@/lib/docs';

/**
 * The game-version switcher: one link per documented version of the mod.
 *
 * Rendered on every page of a versioned manual, beside the fact chips. Each link lands on the same
 * page in the other version when it exists there, else on that version's overview -- manuals drift,
 * and a switcher that 404s is worse than one that lands on the section front. The current version
 * is marked, not linked. A mod with one version renders nothing: there is nothing to switch between.
 *
 * Unversioned URLs always show the default (latest) version, so arriving with no segment selected
 * still selects latest here.
 */
export function VersionSelector({ slugs }: { slugs: string[] }) {
  const mod = sectionOf(slugs);
  if (!mod) return null;

  const versions = versionsOf(mod);
  if (versions.length < 2) return null;

  const current = versionOf(slugs) ?? defaultVersion(mod).id;

  return (
    <nav className="version-switch" aria-label="Game version">
      <span className="label">Version</span>
      {versions.map((version) => {
        const target =
          version.id === current
            ? null
            : siblingOf(slugs, version.default ? undefined : version.id);
        if (!target) return null;
        const url = `/docs/${target.join('/')}/`;
        return version.id === current ? (
          <span className="fact fact-current" aria-current="true" key={version.id}>
            {version.id}
          </span>
        ) : (
          <a className="fact fact-link" href={url} key={version.id}>
            {version.id}
          </a>
        );
      })}
    </nav>
  );
}
