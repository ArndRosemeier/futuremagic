import type { AppsRegistry, RegistryApp, ResolvedApp } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRegistryApp(value: unknown): RegistryApp | null {
  if (!isRecord(value)) return null;
  const slug = value.slug;
  const title = value.title;
  const path = value.path;
  if (
    typeof slug !== 'string' ||
    typeof title !== 'string' ||
    typeof path !== 'string'
  ) {
    return null;
  }
  const app: RegistryApp = { slug, title, path };
  // `updatedAt` is OPTIONAL. A record without it is KEPT — that is the whole point of
  // the generated index: a folder discovered on the apps host has no date, and absence
  // is honest where a synthesized date would be indistinguishable from a real one.
  if (typeof value.updatedAt === 'string') {
    app.updatedAt = value.updatedAt;
  }
  if (typeof value.external === 'boolean') {
    app.external = value.external;
  }
  if (typeof value.url === 'string') {
    app.url = value.url;
  }
  if (typeof value.manifesto === 'boolean') {
    app.manifesto = value.manifesto;
  }
  // Enrichment is INLINE in the generated index (the generator read each manifesto at
  // build time); the runtime no longer fetches `{path}futuremagic.json`.
  if (typeof value.tagline === 'string') {
    app.tagline = value.tagline;
  }
  if (
    Array.isArray(value.tags) &&
    value.tags.every((t): t is string => typeof t === 'string')
  ) {
    app.tags = value.tags;
  }
  if (typeof value.screenshot === 'string') {
    app.screenshot = value.screenshot;
  }
  return app;
}

function parseRegistry(data: unknown): AppsRegistry {
  if (!isRecord(data) || !Array.isArray(data.apps)) {
    throw new Error('Invalid apps.index.json: expected { version, apps }');
  }
  const apps = data.apps
    .map(parseRegistryApp)
    .filter((app): app is RegistryApp => app !== null);
  const version = typeof data.version === 'number' ? data.version : 1;
  return { version, apps };
}

function resolveHref(app: RegistryApp): string {
  if (app.external === true && typeof app.url === 'string') {
    return app.url;
  }
  return app.path.endsWith('/') ? app.path : `${app.path}/`;
}

function resolveScreenshotUrl(
  href: string,
  screenshot: string | undefined,
): string | null {
  if (screenshot === undefined || screenshot.length === 0) {
    return null;
  }
  if (screenshot.startsWith('/') || /^https?:\/\//.test(screenshot)) {
    return screenshot;
  }
  return `${href}${screenshot}`;
}

export async function loadResolvedApps(): Promise<ResolvedApp[]> {
  // The generator writes `public/apps.index.json` (a name `deploy-clean.ps1` does not
  // protect, so it actually ships). The legacy `/apps.json` is a server-managed file the
  // deploy skips — see AGENTS.md §6 and docs/21 §8.
  const response = await fetch('/apps.index.json', { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`Failed to load apps.index.json (${response.status})`);
  }
  const registry = parseRegistry(await response.json());

  const resolved = registry.apps.map((app): ResolvedApp => {
    const href = resolveHref(app);
    const tags = app.tags ?? [];
    // `featured` is DERIVED, never stored: manifesto enrichment present in the index.
    const hasFeature =
      Boolean(app.tagline) || tags.length > 0 || Boolean(app.screenshot);

    const resolvedApp: ResolvedApp = {
      slug: app.slug,
      title: app.title,
      href,
      featured: hasFeature,
      tagline: app.tagline ?? null,
      tags,
      screenshotUrl: resolveScreenshotUrl(href, app.screenshot),
    };
    if (app.updatedAt !== undefined) {
      resolvedApp.updatedAt = app.updatedAt;
    }
    return resolvedApp;
  });

  return resolved.sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}

export function formatUpdatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
