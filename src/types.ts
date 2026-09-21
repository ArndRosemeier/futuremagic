export type RegistryApp = {
  slug: string;
  title: string;
  path: string;
  /**
   * OPTIONAL on purpose: the index is generated from a folder listing, which carries no
   * date. A missing date means "unknown", never a synthesized fact — see
   * `scripts/generate-app-index.mjs`.
   */
  updatedAt?: string;
  /** Inlined from the app's `futuremagic.json` by the generator. */
  tagline?: string;
  tags?: string[];
  screenshot?: string;
};

export type AppsRegistry = {
  version: number;
  apps: RegistryApp[];
};

/**
 * The app-side `futuremagic.json` shape, as read at BUILD time by
 * `scripts/generate-app-index.mjs` (the runtime never fetches it). All fields optional.
 * `title` participates in the generator's precedence: manifesto.title > overlay.title >
 * folder name.
 */
export type AppManifesto = {
  title?: string;
  tagline?: string;
  tags?: string[];
  screenshot?: string;
};

export type ResolvedApp = {
  slug: string;
  title: string;
  href: string;
  /** Absent when the index has no date for the app — main.ts then renders no label. */
  updatedAt?: string;
  featured: boolean;
  tagline: string | null;
  tags: string[];
  screenshotUrl: string | null;
};

export type Story = {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  path: string;
};

export type StoriesRegistry = {
  version: number;
  stories: Story[];
};
