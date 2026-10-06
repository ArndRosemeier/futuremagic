import {
  APP_TIERS,
  type AppLink,
  type AppTier,
  type AppsRegistry,
  type RegistryApp,
  type ResolvedApp,
  type TieredApps,
} from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function isAppTier(value: unknown): value is AppTier {
  return APP_TIERS.includes(value as AppTier);
}

function parseLink(value: unknown): AppLink | null {
  if (!isRecord(value)) return null;
  if (typeof value.label !== 'string' || typeof value.url !== 'string') {
    return null;
  }
  return { label: value.label, url: value.url };
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
  if (isAppTier(value.tier)) {
    app.tier = value.tier;
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
  // Hero-tier extras (inlined by the generator from the extended manifesto).
  if (typeof value.description === 'string') {
    app.description = value.description;
  }
  if (isStringArray(value.screenshots)) {
    app.screenshots = value.screenshots;
  }
  if (isStringArray(value.highlights)) {
    app.highlights = value.highlights;
  }
  if (Array.isArray(value.links)) {
    const links = value.links
      .map(parseLink)
      .filter((link): link is AppLink => link !== null);
    if (links.length > 0) {
      app.links = links;
    }
  }
  if (typeof value.cta === 'string') {
    app.cta = value.cta;
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

// `path` is used verbatim as the card's href; the generator always writes it as an
// absolute URL on the apps host. The only normalisation kept is the trailing slash.
function resolveHref(app: RegistryApp): string {
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

function resolveScreenshotUrls(href: string, app: RegistryApp): string[] {
  const sources =
    app.screenshots !== undefined && app.screenshots.length > 0
      ? app.screenshots
      : [app.screenshot];
  return sources
    .map((s) => resolveScreenshotUrl(href, s))
    .filter((url): url is string => url !== null);
}

export async function loadResolvedApps(): Promise<TieredApps> {
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

    const screenshotUrls = resolveScreenshotUrls(href, app);

    const resolvedApp: ResolvedApp = {
      slug: app.slug,
      title: app.title,
      href,
      tier: app.tier ?? 'normal',
      featured: hasFeature,
      tagline: app.tagline ?? null,
      tags,
      screenshotUrl:
        resolveScreenshotUrl(href, app.screenshot) ?? screenshotUrls[0] ?? null,
      description: app.description ?? null,
      screenshotUrls,
      highlights: app.highlights ?? [],
      links: app.links ?? [],
      cta: app.cta ?? null,
    };
    if (app.updatedAt !== undefined) {
      resolvedApp.updatedAt = app.updatedAt;
    }
    return resolvedApp;
  });

  resolved.sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    return a.title.localeCompare(b.title);
  });

  const tiers: TieredApps = { hero: [], normal: [], further: [] };
  for (const app of resolved) {
    tiers[app.tier].push(app);
  }
  return tiers;
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
