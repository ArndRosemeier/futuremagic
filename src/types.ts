/**
 * Display tier on the hub. Absent in apps.json means `normal`, so apps
 * registered without a tier keep their regular card.
 * - hero: large showcase banner at the top (uses the extended manifesto)
 * - normal: regular card grid
 * - further: compact list below the grid
 */
export type AppTier = 'hero' | 'normal' | 'further';

export const APP_TIERS: readonly AppTier[] = ['hero', 'normal', 'further'];

export type RegistryApp = {
  slug: string;
  title: string;
  path: string;
  updatedAt: string;
  external?: boolean;
  url?: string;
  /** When false, hub skips fetching `{path}futuremagic.json`. */
  manifesto?: boolean;
  tier?: AppTier;
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
  // Hero-tier extras (ignored by normal and further tiers)
  /** Longer pitch shown in the hero banner. Blank lines split paragraphs. */
  description?: string;
  /** Gallery images; rotated in the hero. Falls back to `screenshot`. */
  screenshots?: string[];
  /** Short feature bullets. */
  highlights?: string[];
  /** Secondary links (docs, source, trailer...). */
  links?: AppLink[];
  /** Label for the primary launch button (default "Launch"). */
  cta?: string;
};

export type AppLink = {
  label: string;
  url: string;
};

export type ResolvedApp = {
  slug: string;
  title: string;
  href: string;
  updatedAt: string;
  tier: AppTier;
  featured: boolean;
  tagline: string | null;
  tags: string[];
  screenshotUrl: string | null;
  description: string | null;
  screenshotUrls: string[];
  highlights: string[];
  links: AppLink[];
  cta: string | null;
};

export type TieredApps = Record<AppTier, ResolvedApp[]>;

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
