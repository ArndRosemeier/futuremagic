#!/usr/bin/env node
// scripts/generate-app-index.mjs — build the hub's SAME-ORIGIN app index.
//
// WHY THIS EXISTS (docs/21 §2, §7, §8 — owner-approved F1(a))
//   The apps host (apps.futuremagic.de) sends NO `Access-Control-Allow-Origin`, so the
//   browser cannot read its folder listing or any app's `futuremagic.json`. Node has no
//   such restriction, so the read moves to BUILD time: this script discovers the app
//   folders, folds each folder's manifesto inline, and writes an index the browser can
//   read from its OWN origin. That is the only reason the read is here and not in `src/`.
//
// WHY THE READ IS *LOCAL* AND NOT HTTP (ledger row 10 — THE LANDMINE)
//   The hub is being installed AT the apps root, so `https://apps.futuremagic.de/` will BE
//   this hub. The static server serves a directory's `index.html` INSTEAD of its
//   auto-generated listing once that file exists (measured with `python -m http.server`).
//   The hub's own built `dist/index.html` carries 0 folder anchors, so HTTP discovery would
//   find ZERO apps — and would NOT fail: the fetch returns HTTP 200, an empty index is
//   written, and the gate goes GREEN while the live hub shows nothing. So discovery reads
//   the apps root as a DIRECTORY on disk, where no `index.html` can shadow anything, and
//   the build makes NO HTTP request at all. `APPS_HOST_BASE` survives only to build each
//   card's public URL.
//
// WHAT THE GRID IS (ledger rows 9 + 10 — the owner's decision)
//   The grid MIRRORS the apps root: the list of cards IS the list of app folders.
//   Nothing about the list comes from the old site.
//     * DISCOVERY is the only source of EXISTENCE: a top-level DIRECTORY that CONTAINS
//       `index.html` is an app — that is exactly what the static host requires in order to
//       serve a folder as an app. Symlinks are followed (`~/apps/expert` is a symlink to a
//       dist). A directory WITHOUT `index.html` is NOT an app and is reported in the
//       summary as `ignored (no index.html): <names>` — NOT a warning, because the hub's own
//       `assets/` and `shots/` directories sit at the apps root after this deploy. A
//       top-level FILE (`README.md`) is ignored silently.
//     * seed/apps.overlay.json is an EDITORIAL OVERLAY (title/date decoration only). It can
//       NEVER add a card or move a link. An overlay entry whose folder is not an app is
//       DORMANT: it produces no card and is only reported.
//     * TITLE PRECEDENCE, explicitly: manifesto.title > overlay.title > folder name.
//
// NO RELATION TO THE OLD SITE
//   The old host (`futuremagic.de`) is NEVER contacted. `path` is always DERIVED as
//   `{APPS_HOST_BASE}{folder}/` — absolute, on the apps host — so no record can carry a
//   root-relative path any more. The ONLY environment variables read are `APPS_ROOT_DIR`,
//   `APPS_HOST_BASE` and `APPS_OVERLAY`; in particular there is no `HUB_BASE` and no
//   `APPS_INVENTORY`.
//
// INPUTS
//   {APPS_ROOT_DIR}/                   the apps root the static host serves — DISCOVERY.
//   {APPS_ROOT_DIR}/{folder}/index.html the mark of an app — a directory without it is not one.
//   {APPS_ROOT_DIR}/{folder}/futuremagic.json  one per app folder — ENRICHMENT + title.
//   seed/apps.overlay.json             editorial decoration (title/updatedAt).
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
//   All reading and validation happens BEFORE anything is written. A fatal error (a
//   nonexistent/not-a-directory APPS_ROOT_DIR, a malformed overlay) exits non-zero and
//   leaves the previously generated files BYTE-IDENTICAL. Absence is never invented: a
//   missing manifesto is a warning with the card KEPT, and a missing `updatedAt` stays
//   missing.
//
// ENV OVERRIDES (also the offline fixture seam — see scripts/verify-app-index.mjs)
//   APPS_ROOT_DIR    default $HOME/apps                 the directory to DISCOVER in
//   APPS_HOST_BASE   default https://apps.futuremagic.de/  URL PREFIX ONLY — never fetched
//   APPS_OVERLAY     default <repo>/seed/apps.overlay.json

import { readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const OUT_INDEX = join(REPO, 'public/apps.index.json');
const OUT_LEGACY = join(REPO, 'public/apps.json');

// The mark of an app: the static host serves a folder as an app only when it can serve
// this file, so "has index.html" IS the definition, not a heuristic.
const APP_MARKER = 'index.html';
const MANIFESTO = 'futuremagic.json';

// Keys the overlay must NEVER carry: it decorates an app folder, it does not define
// one. A leftover key from the old `seed/apps.inventory.json` shape is FATAL by name.
const OVERLAY_FORBIDDEN_KEYS = ['path', 'manifesto', 'external', 'url'];

function withTrailingSlash(value) {
  return value.endsWith('/') ? value : `${value}/`;
}

// The ONLY three environment variables this generator reads. There is deliberately no
// `HUB_BASE` and no `APPS_INVENTORY`: the old host is not contacted, and the overlay is
// not an inventory (it cannot create a card).
const APPS_ROOT_DIR = resolve(process.env.APPS_ROOT_DIR ?? join(homedir(), 'apps'));
// A URL PREFIX, nothing more. No request is ever made to it: the build is fully offline.
const APPS_HOST_BASE = withTrailingSlash(
  process.env.APPS_HOST_BASE ?? 'https://apps.futuremagic.de/',
);
const OVERLAY_PATH = resolve(
  process.env.APPS_OVERLAY ?? join(REPO, 'seed/apps.overlay.json'),
);

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// A non-empty string, or `undefined`. Used for the title precedence chain so an empty
// string can never blank a card title.
function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function reasonOf(cause) {
  return cause instanceof Error ? cause.message : String(cause);
}

// `stat` FOLLOWS symlinks: `~/apps/expert` is a symlink to a dist directory and IS an app.
// A broken symlink, a plain file and a fifo all fall through to `false` and are ignored.
async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

// (a) DISCOVERY — the apps root AS A DIRECTORY is the ONLY source of existence.
//
// A top-level DIRECTORY CONTAINING `index.html` is an app. A directory without one is not,
// and is returned so the summary can NAME it (never a warning: the hub's own `assets/` and
// `shots/` live here). A top-level FILE is ignored silently. A nonexistent or
// not-a-directory root is FATAL and names the path — never a silent empty grid.
async function discoverApps(root) {
  // `stat`, not `lstat`: the root itself may be a symlink (the dispatcher tests against a
  // temp dir), and following it is the point.
  let rootStat;
  try {
    rootStat = await stat(root);
  } catch (cause) {
    throw new Error(
      `apps root "${root}" (APPS_ROOT_DIR) does not exist: ${reasonOf(cause)} — it must be ` +
        'the directory the static host serves; refusing to write an empty grid',
    );
  }
  if (!rootStat.isDirectory()) {
    throw new Error(
      `apps root "${root}" (APPS_ROOT_DIR) is NOT a directory (it is not something a static ` +
        'host can serve folders from); refusing to write an empty grid',
    );
  }
  const entries = await readdir(root, { withFileTypes: true });

  const folders = [];
  const ignored = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    // Directories first; a symlink (Dirent.isSymbolicLink) is resolved by stat below.
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue; // a top-level FILE -> silent
    if (!(await isDirectory(path))) continue; // broken symlink -> not an app, not worth naming
    if (await exists(join(path, APP_MARKER))) {
      folders.push(entry.name);
    } else {
      ignored.push(entry.name);
    }
  }
  folders.sort();
  ignored.sort();
  return { folders, ignored };
}

function parseManifesto(data) {
  // Validated as `parseManifesto` in src/registry.ts was, EXCEPT for `title`: the grid's
  // title precedence is manifesto.title > overlay.title > folder name, so an app folder's
  // OWN manifesto title now wins — the app speaking about itself.
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
    throw new Error(`overlay is not valid JSON (${OVERLAY_PATH}): ${reasonOf(cause)}`);
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
          `overlay app #${i} carries "${key}" — the overlay only DECORATES an app ` +
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

// (b) ENRICHMENT — one LOCAL manifesto read per app folder, with or without an overlay
// entry. Absent and non-JSON are both a WARNING with the card KEPT: an app may not ship a
// manifesto yet. Nothing here touches the network.
async function enrich(folders) {
  const enrichment = new Map(); // folder -> manifesto
  let found = 0;
  let missing = 0;
  const warnings = [];
  for (const folder of folders) {
    const path = join(APPS_ROOT_DIR, folder, MANIFESTO);
    let raw;
    try {
      raw = await readFile(path, 'utf8');
    } catch (cause) {
      missing += 1;
      warnings.push(folder);
      console.warn(
        `WARNING: manifesto absent for "${folder}" (${reasonOf(cause)}) — ` +
          `card kept WITHOUT enrichment: ${path}`,
      );
      continue;
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      missing += 1;
      warnings.push(folder);
      console.warn(
        `WARNING: manifesto for "${folder}" is not valid JSON — ` +
          `card kept WITHOUT enrichment: ${path}`,
      );
      continue;
    }
    const manifesto = parseManifesto(data);
    if (manifesto === null) {
      missing += 1;
      warnings.push(folder);
      console.warn(
        `WARNING: manifesto for "${folder}" is not an object — ` +
          `card kept WITHOUT enrichment: ${path}`,
      );
      continue;
    }
    found += 1;
    enrichment.set(folder, manifesto);
  }
  return { enrichment, found, missing, warnings };
}

async function main() {
  const overlay = readOverlay(await readFile(OVERLAY_PATH, 'utf8'));

  const { folders, ignored } = await discoverApps(APPS_ROOT_DIR);
  const { enrichment, found, missing, warnings } = await enrich(folders);

  // (c) BUILD the whole index IN MEMORY. Nothing is written until every step has succeeded.
  const overlayBySlug = new Map();
  for (const entry of overlay.apps) overlayBySlug.set(entry.slug.toLowerCase(), entry);

  const cards = [];
  const matchedOverlaySlugs = new Set();
  for (const folder of folders) {
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

  // (d) A DORMANT overlay entry — its folder is NOT an app — produces NO card. It is
  // KEPT and REPORTED: that is how `GM Cockpit` and friends come back the day those apps
  // are republished. The grid mirrors the apps root, so the overlay may only decorate.
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
  console.log(`apps root:       ${APPS_ROOT_DIR}`);
  console.log(`apps host base:  ${APPS_HOST_BASE} (URL prefix only — NEVER fetched)`);
  console.log(`apps written:    ${cards.length}`);
  console.log(
    `enrichment:      found ${found}, missing ${missing}` +
      (warnings.length > 0 ? ` [${warnings.join(', ')}]` : ''),
  );
  console.log(
    `ignored (no ${APP_MARKER}): ${ignored.length > 0 ? ignored.join(', ') : '(none)'}`,
  );
  console.log(
    `dormant overlay entries: ${dormant.length}` +
      (dormant.length > 0 ? ` [${dormant.map((entry) => entry.slug).join(', ')}]` : ''),
  );
  console.log(`app folders:     ${folders.length > 0 ? folders.join(', ') : '(none)'}`);
  console.log(`wrote:           ${OUT_INDEX}`);
  console.log(`wrote:           ${OUT_LEGACY} (byte-identical legacy copy)`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FATAL: ${message}`);
  console.error('no files written — previously generated index left BYTE-IDENTICAL');
  process.exitCode = 1;
});
