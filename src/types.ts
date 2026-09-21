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
  external?: boolean;
  url?: string;
  /**
   * The INPUT flag `scripts/generate-app-index.mjs` reads to decide whether to fetch
   * `{path}futuremagic.json` at build time. The runtime no longer fetches manifestos:
   * the enrichment below is already inlined in the index.
   */
  manifesto?: boolean;
  /** Inlined from the app's `futuremagic.json` by the generator. */
  tagline?: string;
  tags?: string[];
  screenshot?: string;
};

export type AppsRegistry = {
  version: number;
  apps: RegistryApp[];
};

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
