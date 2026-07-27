export type RegistryApp = {
  slug: string;
  title: string;
  path: string;
  updatedAt: string;
  external?: boolean;
  url?: string;
  /** When false, hub skips fetching `{path}futuremagic.json`. */
  manifesto?: boolean;
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
  updatedAt: string;
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
