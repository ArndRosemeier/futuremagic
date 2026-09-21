#!/usr/bin/env node
// scripts/generate-app-index.mjs — build the hub's SAME-ORIGIN app index.
//
// WHY THIS EXISTS (docs/21 §2, §7, §8 — owner-approved F1(a))
//   The apps host (apps.futuremagic.de) sends NO `Access-Control-Allow-Origin`, so the
//   browser cannot read its folder listing or any app's `futuremagic.json`. Node has no
//   such restriction, so the read moves to BUILD time: this script discovers the app
//   folders from the apps host's auto-generated listing, folds each folder's manifesto
//   inline, and writes an index the browser can read from its OWN origin. That is the
//   only reason the fetch is here and not in `src/`.
//
// WHAT THE GRID IS (ledger row 9 — the owner's decision)
//   The grid MIRRORS the apps host: the list of cards IS the list of published folders.
//   Nothing about the list comes from the old site.
//     * DISCOVERY is the only source of EXISTENCE: every DIRECTORY in the listing is a card.
//     * seed/apps.overlay.json is an EDITORIAL OVERLAY (title/date decoration only). It can
//       NEVER add a card or move a link. An overlay entry whose folder is not published is
//       DORMANT: it produces no card and is only reported.
//     * TITLE PRECEDENCE, explicitly: manifesto.title > overlay.title > folder name.
//
// NO RELATION TO THE OLD SITE
//   The old host (`futuremagic.de`) is NEVER contacted. `path` is always DERIVED as
//   `{APPS_HOST_BASE}{folder}/` — absolute, on the apps host — so no record can carry a
//   root-relative path any more. The ONLY environment variables read are `APPS_HOST_BASE`
//   and `APPS_OVERLAY`; in particular there is no `HUB_BASE` and no `APPS_INVENTORY`.
//
// INPUTS
//   <APPS_HOST_BASE>/                          the apps host listing — DISCOVERY.
//   {APPS_HOST_BASE}{folder}/futuremagic.json  one per PUBLISHED folder — ENRICHMENT + title.
//   seed/apps.overlay.json                     editorial decoration (title/updatedAt).
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
//   (transport failure to the apps host, malformed overlay) exits non-zero and leaves the
//   previously generated files BYTE-IDENTICAL. Absence is never invented: a 404
//   manifesto is a warning with the card KEPT, and a missing `updatedAt` stays missing.
//
// ENV OVERRIDES (also the offline fixture seam — see scripts/verify-app-index.mjs)
//   APPS_HOST_BASE   default https://apps.futuremagic.de/   the listing host
//   APPS_OVERLAY     default <repo>/seed/apps.overlay.json

import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const OUT_INDEX = join(REPO, 'public/apps.index.json');
const OUT_LEGACY = join(REPO, 'public/apps.json');
const FETCH_TIMEOUT_MS = 30_000;

// Keys the overlay must NEVER carry: it decorates a published folder, it does not define
// one. A leftover key from the old `seed/apps.inventory.json` shape is FATAL by name.
const OVERLAY_FORBIDDEN_KEYS = ['path', 'manifesto', 'external', 'url'];

function withTrailingSlash(value) {
  return value.endsWith('/') ? value : `${value}/`;
}

// The ONLY two environment variables this generator reads. There is deliberately no
// `HUB_BASE` and no `APPS_INVENTORY`: the old host is not contacted, and the overlay is
// not an inventory (it cannot create a card).
const APPS_HOST_BASE = withTrailingSlash(
  process.env.APPS_HOST_BASE ?? 'https://apps.futuremagic.de/',
);
const OVERLAY_PATH = resolve(
  process.env.APPS_OVERLAY ?? join(REPO, 'seed/apps.overlay.json'),
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

// A non-empty string, or `undefined`. Used for the title precedence chain so an empty
// string can never blank a card title.
function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
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
  // Validated as `parseManifesto` in src/registry.ts was, EXCEPT for `title`: the grid's
  // title precedence is manifesto.title > overlay.title > folder name, so a published
  // folder's OWN manifesto title now wins — the app speaking about itself.
  if (!isRecord(data)) return null;
  const manifesto = {};
  if (nonEmptyString(data.title) !== undefined) manifesto.title = data.title;
  if (typeof data.tagline === 'string') manifesto.tagline = data.tagline;
  if (Array.isArray(data.tags) && data.tags.every((t) => typeof t === 'string')) {
    manifesto.tags = data.tags;
  }
  if (typeof data.screenshot === 'string') manifesto.screenshot = data.screenshot;
  return manifesto;
}

function readOverlay(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`overlay is not valid JSON (${OVERLAY_PATH}): ${reason}`);
  }
  if (!isRecord(data) || !Array.isArray(data.apps)) {
    throw new Error(`overlay must be { version, apps[] } (${OVERLAY_PATH})`);
  }
  // The overlay is HAND-MAINTAINED, so a malformed entry is FATAL and named — unlike the
  // runtime parser, which has to be lenient about its own generated input.
  const seen = new Set();
  const apps = data.apps.map((value, i) => {
    if (!isRecord(value)) throw new Error(`overlay app #${i} is not an object`);
    for (const key of OVERLAY_FORBIDDEN_KEYS) {
      if (key in value) {
        throw new Error(
          `overlay app #${i} carries "${key}" — the overlay only DECORATES a published ` +
            'folder (title/updatedAt); it cannot add a card, a path or a link',
        );
      }
    }
    const slug = value.slug;
    if (typeof slug !== 'string' || slug.length === 0) {
      throw new Error(`overlay app #${i} needs a non-empty string slug`);
    }
    const key = slug.toLowerCase();
    if (seen.has(key)) throw new Error(`overlay has a duplicate slug "${slug}"`);
    seen.add(key);
    if (value.title !== undefined && typeof value.title !== 'string') {
      throw new Error(`overlay app "${slug}" has a non-string title`);
    }
    if (value.updatedAt !== undefined && typeof value.updatedAt !== 'string') {
      throw new Error(`overlay app "${slug}" has a non-string updatedAt`);
    }
    const entry = { slug };
    if (nonEmptyString(value.title) !== undefined) entry.title = value.title;
    if (typeof value.updatedAt === 'string') entry.updatedAt = value.updatedAt;
    return entry;
  });
  const version = typeof data.version === 'number' ? data.version : 1;
  return { version, apps };
}

async function main() {
  const overlay = readOverlay(await readFile(OVERLAY_PATH, 'utf8'));

  // (a) DISCOVERY — the apps host's folder listing is the ONLY source of existence.
  // Fatal if the host is unreachable; nothing is written.
  const listingResponse = await fetchHost(APPS_HOST_BASE, 'the apps host folder listing');
  if (!listingResponse.ok) {
    throw new Error(
      `apps host listing returned HTTP ${listingResponse.status} (${APPS_HOST_BASE})`,
    );
  }
  const hostFolders = parseListing(await listingResponse.text());

  const overlayBySlug = new Map();
  for (const entry of overlay.apps) overlayBySlug.set(entry.slug.toLowerCase(), entry);

  // (b) ENRICHMENT — one manifesto fetch per PUBLISHED folder, with or without an overlay
  // entry. A folder IS an app, so its own `futuremagic.json` is read: this is the fix for
  // the "a newly published folder is never enriched" gap (board row 19).
  const enrichment = new Map(); // folder (as listed) -> manifesto
  let enrichmentFound = 0;
  let enrichmentMissing = 0;
  const enrichmentWarnings = [];
  for (const folder of hostFolders) {
    const url = `${APPS_HOST_BASE}${folder}/futuremagic.json`;
    const response = await fetchHost(url, `the manifesto for "${folder}"`);
    if (!response.ok) {
      // A 404 / absent manifesto is NORMAL and not fatal: a published app may not ship one
      // yet (measured 2026-09-21: newly published `fracvibe` has none). Warn, KEEP the card.
      enrichmentMissing += 1;
      enrichmentWarnings.push(folder);
      console.warn(
        `WARNING: manifesto missing for "${folder}" (HTTP ${response.status}) — ` +
          `card kept WITHOUT enrichment: ${url}`,
      );
      continue;
    }
    let data;
    try {
      data = await response.json();
    } catch {
      enrichmentMissing += 1;
      enrichmentWarnings.push(folder);
      console.warn(
        `WARNING: manifesto for "${folder}" is not valid JSON — ` +
          `card kept WITHOUT enrichment: ${url}`,
      );
      continue;
    }
    const manifesto = parseManifesto(data);
    if (manifesto === null) {
      enrichmentMissing += 1;
      enrichmentWarnings.push(folder);
      console.warn(
        `WARNING: manifesto for "${folder}" is not an object — ` +
          `card kept WITHOUT enrichment: ${url}`,
      );
      continue;
    }
    enrichmentFound += 1;
    enrichment.set(folder, manifesto);
  }

  // (c) BUILD the whole index IN MEMORY. Nothing is written until every step has succeeded.
  const cards = [];
  const matchedOverlaySlugs = new Set();
  for (const folder of hostFolders) {
    const overlayEntry = overlayBySlug.get(folder.toLowerCase());
    if (overlayEntry !== undefined) matchedOverlaySlugs.add(overlayEntry.slug.toLowerCase());
    const manifesto = enrichment.get(folder) ?? {};
    // TITLE PRECEDENCE, explicitly: manifesto.title > overlay.title > folder name.
    const title =
      nonEmptyString(manifesto.title) ?? nonEmptyString(overlayEntry?.title) ?? folder;
    const card = {
      slug: folder,
      title,
      // DERIVED, absolute on the apps host. Never root-relative, never from the old site.
      path: `${APPS_HOST_BASE}${folder}/`,
    };
    // `updatedAt` comes from the overlay ONLY (a manifesto has no date field). Absent means
    // the key is OMITTED — NEVER fabricated (main.ts then renders no "Updated" label).
    if (overlayEntry?.updatedAt !== undefined) card.updatedAt = overlayEntry.updatedAt;
    if (manifesto.tagline !== undefined) card.tagline = manifesto.tagline;
    if (manifesto.tags !== undefined) card.tags = manifesto.tags;
    if (manifesto.screenshot !== undefined) card.screenshot = manifesto.screenshot;
    cards.push(card);
  }

  // (d) A DORMANT overlay entry — its folder is NOT published — produces NO card. It is
  // KEPT and REPORTED: that is how `GM Cockpit` and friends come back the day those apps
  // are republished. The grid mirrors the host, so the overlay may only decorate.
  const dormant = overlay.apps.filter(
    (entry) => !matchedOverlaySlugs.has(entry.slug.toLowerCase()),
  );

  const index = { version: overlay.version, apps: cards };
  const text = `${JSON.stringify(index, null, 2)}\n`;

  // (e) ATOMIC-ON-SUCCESS write: both temps first, then both renames. A fatal error above
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

  // (f) SUMMARY.
  console.log('--- generated app index ---');
  console.log(`overlay:         ${OVERLAY_PATH}`);
  console.log(`apps host:       ${APPS_HOST_BASE}`);
  console.log(`apps written:    ${cards.length}`);
  console.log(
    `enrichment:      found ${enrichmentFound}, missing ${enrichmentMissing}` +
      (enrichmentWarnings.length > 0 ? ` [${enrichmentWarnings.join(', ')}]` : ''),
  );
  console.log(
    `dormant overlay entries: ${dormant.length}` +
      (dormant.length > 0 ? ` [${dormant.map((entry) => entry.slug).join(', ')}]` : ''),
  );
  console.log(`host folders:    ${hostFolders.length > 0 ? hostFolders.join(', ') : '(none)'}`);
  console.log(`wrote:           ${OUT_INDEX}`);
  console.log(`wrote:           ${OUT_LEGACY} (byte-identical legacy copy)`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FATAL: ${message}`);
  console.error('no files written — previously generated index left BYTE-IDENTICAL');
  process.exitCode = 1;
});
