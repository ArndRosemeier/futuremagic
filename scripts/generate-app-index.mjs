#!/usr/bin/env node
// scripts/generate-app-index.mjs — build the hub's SAME-ORIGIN app index.
//
// WHY THIS EXISTS (docs/21 §2, §7, §8 — owner-approved F1(a) + F2(a))
//   The apps host (apps.futuremagic.de) sends NO `Access-Control-Allow-Origin`, so the
//   browser cannot read its folder listing or any app's `futuremagic.json`. Node has no
//   such restriction, so the read moves to BUILD time: this script discovers the app
//   folders from the apps host's auto-generated listing, folds each app's manifesto
//   inline, and writes an index the browser can read from its OWN origin. That is the
//   only reason the fetch is here and not in `src/`.
//
// INPUTS
//   seed/apps.inventory.json   the EDITORIAL record (the ONLY hand-maintained list):
//                              slug/title/path/updatedAt/manifesto, in apps.json shape.
//   <APPS_HOST_BASE>/          the apps host's directory listing — the DISCOVERY source.
//   {record.path}futuremagic.json   per-app manifestos — the ENRICHMENT source.
//
// OUTPUTS (both byte-identical, from this one generator so they cannot drift)
//   public/apps.index.json   what `src/registry.ts` fetches at runtime (new name, so
//                            `deploy-clean.ps1:210-215` does not skip uploading it).
//   public/apps.json         legacy name, written ONLY because deploy-clean.ps1:148-150
//                            throws unless dist/apps.json exists. See the COPIES: line
//                            in the landing commit: the day that script is updated,
//                            public/apps.json is dropped.
//
// FAILURE CONTRACT
//   All fetching and validation happens BEFORE anything is written. A fatal error
//   (transport failure to a host, malformed inventory) exits non-zero and leaves the
//   previously generated files BYTE-IDENTICAL. Absence is never invented: a 404
//   manifesto is a warning, and a missing `updatedAt` stays missing.
//
// ENV OVERRIDES (also the offline fixture seam — see scripts/verify-app-index.mjs)
//   APPS_HOST_BASE   default https://apps.futuremagic.de/   the listing host
//   HUB_BASE         default https://futuremagic.de/         base for root-relative
//                                                           inventory paths (records not
//                                                           yet migrated to the apps host)
//   APPS_INVENTORY   default <repo>/seed/apps.inventory.json

import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const OUT_INDEX = join(REPO, 'public/apps.index.json');
const OUT_LEGACY = join(REPO, 'public/apps.json');
const FETCH_TIMEOUT_MS = 30_000;

function withTrailingSlash(value) {
  return value.endsWith('/') ? value : `${value}/`;
}

const APPS_HOST_BASE = withTrailingSlash(
  process.env.APPS_HOST_BASE ?? 'https://apps.futuremagic.de/',
);
const HUB_BASE = withTrailingSlash(process.env.HUB_BASE ?? 'https://futuremagic.de/');
const INVENTORY_PATH = resolve(
  process.env.APPS_INVENTORY ?? join(REPO, 'seed/apps.inventory.json'),
);

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

async function fetchWithTimeout(url) {
  return fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
}

// A transport failure — DNS, refused connection, timeout — names the HOST and is FATAL.
// A 404 (or any HTTP status) is a response, not a transport failure: the caller decides.
async function fetchHost(url, what) {
  try {
    return await fetchWithTimeout(url);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `transport failure reaching host "${hostOf(url)}" while fetching ${what} (${url}): ${reason}`,
    );
  }
}

function parseListing(html) {
  // Python's http.server emits `<li><a href="expert/">expert@</a></li>`. The `@` is a
  // SYMLINK marker in the DISPLAY TEXT only — it does not disqualify the directory.
  // A trailing `/` is the ONLY directory signal; a plain name is a FILE and is ignored.
  const folders = [];
  const anchor = /<a\s[^>]*href\s*=\s*["']([^"']*)["']/gi;
  let match;
  while ((match = anchor.exec(html)) !== null) {
    const href = match[1];
    if (typeof href !== 'string' || !href.endsWith('/')) continue; // file -> ignored
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) continue; // absolute URL, not a folder name
    if (href.startsWith('/') || href.startsWith('?') || href.startsWith('#')) continue;
    const name = decodeURIComponent(href.replace(/\/+$/, ''));
    if (name === '' || name === '.' || name === '..' || name.includes('/')) continue;
    folders.push(name);
  }
  return folders;
}

function parseManifesto(data) {
  // Validated exactly as `parseManifesto` in src/registry.ts did: every field optional,
  // `tags` kept ONLY when EVERY element is a string. `title` is NOT consumed — the
  // inventory title (or the folder name, for a discovered app) is authoritative.
  if (!isRecord(data)) return null;
  const manifesto = {};
  if (typeof data.tagline === 'string') manifesto.tagline = data.tagline;
  if (Array.isArray(data.tags) && data.tags.every((t) => typeof t === 'string')) {
    manifesto.tags = data.tags;
  }
  if (typeof data.screenshot === 'string') manifesto.screenshot = data.screenshot;
  return manifesto;
}

// The folder a record's `path` names, resolved against HUB_BASE so a root-relative path
// (an app still on the old host) and an absolute apps-host URL both yield a basename.
function folderOf(recordPath) {
  try {
    const segments = new URL(recordPath, HUB_BASE).pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1];
    return last === undefined ? null : decodeURIComponent(last);
  } catch {
    return null;
  }
}

function manifestoUrl(record) {
  if (record.external === true) return null;
  if (record.manifesto === false) return null;
  return `${withTrailingSlash(new URL(record.path, HUB_BASE).href)}futuremagic.json`;
}

function readInventory(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`inventory is not valid JSON (${INVENTORY_PATH}): ${reason}`);
  }
  if (!isRecord(data) || !Array.isArray(data.apps)) {
    throw new Error(`inventory must be { version, apps[] } (${INVENTORY_PATH})`);
  }
  // The inventory is HAND-MAINTAINED, so a malformed record is FATAL and named — unlike
  // the runtime parser, which had to be lenient about its own generated input.
  const apps = data.apps.map((value, i) => {
    if (!isRecord(value)) throw new Error(`inventory app #${i} is not an object`);
    const { slug, title, path, updatedAt, external, url, manifesto } = value;
    if (typeof slug !== 'string' || typeof title !== 'string' || typeof path !== 'string') {
      throw new Error(`inventory app #${i} needs string slug/title/path`);
    }
    if (updatedAt !== undefined && typeof updatedAt !== 'string') {
      throw new Error(`inventory app "${slug}" has a non-string updatedAt`);
    }
    const record = { slug, title, path };
    if (typeof updatedAt === 'string') record.updatedAt = updatedAt;
    if (typeof external === 'boolean') record.external = external;
    if (typeof url === 'string') record.url = url;
    if (typeof manifesto === 'boolean') record.manifesto = manifesto;
    return record;
  });
  const version = typeof data.version === 'number' ? data.version : 1;
  return { version, apps };
}

async function main() {
  const inventory = readInventory(await readFile(INVENTORY_PATH, 'utf8'));

  // (b) DISCOVERY — read the host's folder listing. Fatal if the host is unreachable.
  const listingResponse = await fetchHost(APPS_HOST_BASE, 'the apps host folder listing');
  if (!listingResponse.ok) {
    throw new Error(
      `apps host listing returned HTTP ${listingResponse.status} (${APPS_HOST_BASE})`,
    );
  }
  const hostFolders = parseListing(await listingResponse.text());

  const knownFolders = new Set();
  for (const record of inventory.apps) {
    knownFolders.add(record.slug.toLowerCase());
    const folder = folderOf(record.path);
    if (folder !== null) knownFolders.add(folder.toLowerCase());
  }

  // (c) ENRICHMENT — one manifesto fetch per inventory record that claims one.
  const enrichment = new Map();
  let enrichmentFound = 0;
  let enrichmentMissing = 0;
  const enrichmentErrors = [];
  for (const record of inventory.apps) {
    const url = manifestoUrl(record);
    if (url === null) continue;
    const response = await fetchHost(url, `the manifesto for "${record.slug}"`);
    if (!response.ok) {
      // 404 / absent is NORMAL (5 of the 12 live apps have none). Warn, keep the card.
      enrichmentMissing += 1;
      enrichmentErrors.push(record.slug);
      console.warn(
        `WARNING: manifesto missing for "${record.slug}" (HTTP ${response.status}) — ` +
          `card kept WITHOUT enrichment: ${url}`,
      );
      continue;
    }
    let data;
    try {
      data = await response.json();
    } catch {
      enrichmentMissing += 1;
      enrichmentErrors.push(record.slug);
      console.warn(
        `WARNING: manifesto for "${record.slug}" is not valid JSON — ` +
          `card kept WITHOUT enrichment: ${url}`,
      );
      continue;
    }
    const manifesto = parseManifesto(data);
    if (manifesto === null) {
      enrichmentMissing += 1;
      enrichmentErrors.push(record.slug);
      console.warn(
        `WARNING: manifesto for "${record.slug}" is not an object — ` +
          `card kept WITHOUT enrichment: ${url}`,
      );
      continue;
    }
    enrichmentFound += 1;
    enrichment.set(record.slug, manifesto);
  }

  // Build the whole index IN MEMORY. Nothing is written until every step has succeeded.
  const outApps = inventory.apps.map((record) => {
    const out = { slug: record.slug, title: record.title, path: record.path };
    // NEVER fabricate `updatedAt`: if neither the inventory nor the manifesto supplies
    // one, the field is simply ABSENT (main.ts then renders no "Updated" label).
    if (record.updatedAt !== undefined) out.updatedAt = record.updatedAt;
    if (record.external !== undefined) out.external = record.external;
    if (record.url !== undefined) out.url = record.url;
    if (record.manifesto !== undefined) out.manifesto = record.manifesto;
    const manifesto = enrichment.get(record.slug);
    if (manifesto !== undefined) {
      if (manifesto.tagline !== undefined) out.tagline = manifesto.tagline;
      if (manifesto.tags !== undefined) out.tags = manifesto.tags;
      if (manifesto.screenshot !== undefined) out.screenshot = manifesto.screenshot;
    }
    return out;
  });

  // (d) A host folder absent from the inventory BECOMES a card — and says so LOUDLY.
  const discovered = [];
  for (const folder of hostFolders) {
    if (knownFolders.has(folder.toLowerCase())) continue;
    knownFolders.add(folder.toLowerCase());
    discovered.push(folder);
    console.warn(
      `WARNING (DISCOVERED): host folder "${folder}" is not in the inventory — ` +
        `added a card titled "${folder}" pointing at ${withTrailingSlash(APPS_HOST_BASE + folder)}`,
    );
    outApps.push({
      slug: folder,
      title: folder,
      path: withTrailingSlash(APPS_HOST_BASE + folder),
    });
  }

  const index = { version: inventory.version, apps: outApps };
  const text = `${JSON.stringify(index, null, 2)}\n`;

  // (f) ATOMIC-ON-SUCCESS write: both temps first, then both renames. A fatal error above
  // has already returned, leaving the previous files byte-identical.
  const tmpIndex = `${OUT_INDEX}.tmp`;
  const tmpLegacy = `${OUT_LEGACY}.tmp`;
  try {
    await writeFile(tmpIndex, text);
    await writeFile(tmpLegacy, text);
    await rename(tmpIndex, OUT_INDEX);
    await rename(tmpLegacy, OUT_LEGACY);
  } catch (cause) {
    await rm(tmpIndex, { force: true });
    await rm(tmpLegacy, { force: true });
    throw cause;
  }

  // (g) SUMMARY.
  const missingFolders = [];
  for (const record of inventory.apps) {
    const folder = folderOf(record.path);
    if (folder === null) continue;
    if (!hostFolders.some((f) => f.toLowerCase() === folder.toLowerCase())) {
      missingFolders.push(`${record.slug} (${folder})`);
    }
  }
  console.log('--- generated app index ---');
  console.log(`inventory:       ${INVENTORY_PATH}`);
  console.log(`apps host:       ${APPS_HOST_BASE}`);
  console.log(`hub base:        ${HUB_BASE}`);
  console.log(`apps written:    ${outApps.length} (inventory ${inventory.apps.length} + discovered ${discovered.length})`);
  console.log(`enrichment:      found ${enrichmentFound}, missing ${enrichmentMissing}${enrichmentErrors.length > 0 ? ` [${enrichmentErrors.join(', ')}]` : ''}`);
  console.log(`discovered:      ${discovered.length > 0 ? discovered.join(', ') : '(none)'}`);
  console.log(`host folders:    ${hostFolders.length > 0 ? hostFolders.join(', ') : '(none)'}`);
  console.log(`no host folder:  ${missingFolders.length > 0 ? missingFolders.join(', ') : '(none)'}`);
  console.log(`wrote:           ${OUT_INDEX}`);
  console.log(`wrote:           ${OUT_LEGACY} (byte-identical legacy copy)`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FATAL: ${message}`);
  console.error('no files written — previously generated index left BYTE-IDENTICAL');
  process.exitCode = 1;
});
