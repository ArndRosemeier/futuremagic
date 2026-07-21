import type {
  AppManifesto,
  AppsRegistry,
  RegistryApp,
  ResolvedApp,
} from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRegistryApp(value: unknown): RegistryApp | null {
  if (!isRecord(value)) return null;
  const slug = value.slug;
  const title = value.title;
  const path = value.path;
  const updatedAt = value.updatedAt;
  if (
    typeof slug !== 'string' ||
    typeof title !== 'string' ||
    typeof path !== 'string' ||
    typeof updatedAt !== 'string'
  ) {
    return null;
  }
  const app: RegistryApp = { slug, title, path, updatedAt };
  if (typeof value.external === 'boolean') {
    app.external = value.external;
  }
  if (typeof value.url === 'string') {
    app.url = value.url;
  }
  if (typeof value.manifesto === 'boolean') {
    app.manifesto = value.manifesto;
  }
  return app;
}

function parseRegistry(data: unknown): AppsRegistry {
  if (!isRecord(data) || !Array.isArray(data.apps)) {
    throw new Error('Invalid apps.json: expected { version, apps }');
  }
  const apps = data.apps
    .map(parseRegistryApp)
    .filter((app): app is RegistryApp => app !== null);
  const version = typeof data.version === 'number' ? data.version : 1;
  return { version, apps };
}

function parseManifesto(data: unknown): AppManifesto | null {
  if (!isRecord(data)) return null;
  const manifesto: AppManifesto = {};
  if (typeof data.title === 'string') manifesto.title = data.title;
  if (typeof data.tagline === 'string') manifesto.tagline = data.tagline;
  if (
    Array.isArray(data.tags) &&
    data.tags.every((t): t is string => typeof t === 'string')
  ) {
    manifesto.tags = data.tags;
  }
  if (typeof data.screenshot === 'string') manifesto.screenshot = data.screenshot;
  return manifesto;
}

async function fetchManifesto(path: string): Promise<AppManifesto | null> {
  const base = path.endsWith('/') ? path : `${path}/`;
  const url = `${base}futuremagic.json`;
  try {
    const response = await fetch(url, {
      cache: 'no-cache',
    });
    if (!response.ok) {
      console.warn(`Manifesto missing: ${url} (${response.status})`);
      return null;
    }
    return parseManifesto(await response.json());
  } catch {
    console.warn(`Manifesto failed to load: ${url}`);
    return null;
  }
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
  const response = await fetch('/apps.json', { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`Failed to load apps.json (${response.status})`);
  }
  const registry = parseRegistry(await response.json());

  const resolved = await Promise.all(
    registry.apps.map(async (app): Promise<ResolvedApp> => {
      const href = resolveHref(app);
      const shouldFetchManifesto =
        app.external !== true && app.manifesto !== false;
      const manifesto = shouldFetchManifesto
        ? await fetchManifesto(app.path)
        : null;

      const hasFeature =
        manifesto !== null &&
        (Boolean(manifesto.tagline) ||
          Boolean(manifesto.tags?.length) ||
          Boolean(manifesto.screenshot));

      return {
        slug: app.slug,
        title: manifesto?.title ?? app.title,
        href,
        updatedAt: app.updatedAt,
        featured: hasFeature,
        tagline: manifesto?.tagline ?? null,
        tags: manifesto?.tags ?? [],
        screenshotUrl: resolveScreenshotUrl(href, manifesto?.screenshot),
      };
    }),
  );

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
