export type AppTier = 'hero' | 'normal' | 'further';

export const APP_TIERS: readonly AppTier[] = ['hero', 'normal', 'further'];

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
  /**
   * Display tier on the hub. Absent in the generated index means `normal`, so apps
   * registered without a tier keep their regular card.
   * - hero: large showcase banner at the top (uses the extended manifesto)
   * - normal: regular card grid
   * - further: compact list below the grid
   */
  tier?: AppTier;
  /** Inlined from the app's `futuremagic.json` by the generator. */
  tagline?: string;
  tags?: string[];
  screenshot?: string;
  // Hero-tier extras (inlined from the manifesto; ignored by normal/further tiers)
  description?: string;
  screenshots?: string[];
  highlights?: string[];
  links?: AppLink[];
  cta?: string;
};

export type AppsRegistry = {
  version: number;
  apps: RegistryApp[];
};

export type AppLink = {
  label: string;
  url: string;
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

export type ResolvedApp = {
  slug: string;
  title: string;
  href: string;
  /** Absent when the index has no date for the app — main.ts then renders no label. */
  updatedAt?: string;
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
