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
//     * seed/apps.overlay.json is an EDITORIAL OVERLAY. It may DECORATE a published folder
//       (title/date) or WITHHOLD its card (`hidden: true`); it can NEVER add a card, a path
//       or a link. An overlay entry whose folder is not an app is DORMANT: it produces no
//       card and is only reported. A `hidden: true` entry whose folder is NOT published is
//       therefore dormant too — dormant, no card, no crash — exactly like any other
//       un-published entry. Hiding is REPORTED by name (`hidden: N [names]`), never silent,
//       and it NEVER touches the app folder: the app stays SERVED at its URL.
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
//   seed/apps.overlay.json             editorial decoration (title/updatedAt) AND/OR
//                                      withdrawal (hidden: true). Only the four keys
//                                      `slug`, `title`, `updatedAt`, `hidden` are
//                                      accepted; an UNKNOWN key is FATAL by name.
//
// OUTPUT
//   public/apps.index.json   what `src/registry.ts` fetches at runtime. There is no
//                            legacy `apps.json` copy any more: it existed ONLY for the
//                            removed `deploy-clean.ps1` (old-host FTP deploy).
//
// FAILURE CONTRACT
//   All reading and validation happens BEFORE anything is written. A fatal error (a
//   nonexistent/not-a-directory APPS_ROOT_DIR, a malformed overlay — an unknown key, a
//   forbidden key, a non-boolean `hidden`, a non-string title/updatedAt) exits non-zero
//   and leaves the previously generated files BYTE-IDENTICAL. Absence is never invented:
//   a missing manifesto is a warning with the card KEPT, and a missing `updatedAt` stays
//   missing. A HIDDEN app is never read at all (it has no card to enrich), so its absent
//   manifesto is neither a warning nor a manifesto read.
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

// The mark of an app: the static host serves a folder as an app only when it can serve
// this file, so "has index.html" IS the definition, not a heuristic.
const APP_MARKER = 'index.html';
const MANIFESTO = 'futuremagic.json';

// Keys the overlay ACCEPTS. The overlay is HAND-MAINTAINED, so it accepts this list and
// NOTHING else: a typo (`hiden: true`) is FATAL by name, because a silently-ignored key is
// exactly how `hidden` would have been a no-op instead of a mistake.
const OVERLAY_KNOWN_KEYS = ['slug', 'title', 'updatedAt', 'hidden', 'tier'];

// Valid display tiers. Absent means `normal`. The overlay is the EDITORIAL layer, so it
// decides which published app is a hero showcase or a compact "further" entry — exactly
// as it already decides `hidden`.
const APP_TIERS = ['hero', 'normal', 'further'];

// Keys the overlay must NEVER carry: it decorates or withholds an app folder, it does not
// define one. A leftover key from the old `seed/apps.inventory.json` shape is FATAL by name.
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
  // Hero-tier extras (ignored by normal/further tiers; read by the hero banner).
  if (typeof data.description === 'string') manifesto.description = data.description;
  if (
    Array.isArray(data.screenshots) &&
    data.screenshots.every((s) => typeof s === 'string')
  ) {
    manifesto.screenshots = data.screenshots;
  }
  if (
    Array.isArray(data.highlights) &&
    data.highlights.every((h) => typeof h === 'string')
  ) {
    manifesto.highlights = data.highlights;
  }
  if (Array.isArray(data.links)) {
    const links = data.links
      .filter(
        (l) =>
          isRecord(l) &&
          typeof l.label === 'string' &&
          typeof l.url === 'string',
      )
      .map((l) => ({ label: l.label, url: l.url }));
    if (links.length > 0) manifesto.links = links;
  }
  if (typeof data.cta === 'string') manifesto.cta = data.cta;
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
    // FORBIDDEN keys first, so an old inventory field gets its OWN message rather than the
    // generic "unknown key" one. The four names are forbidden by name, forever.
    for (const key of OVERLAY_FORBIDDEN_KEYS) {
      if (key in value) {
        throw new Error(
          `overlay app #${i} carries "${key}" — the overlay may DECORATE an app folder ` +
            '(title/updatedAt) or WITHHOLD its card (hidden: true), but it cannot ADD a ' +
            'card, a path or a link',
        );
      }
    }
    // Then ANYTHING else that is not a known key is FATAL by name. This is the guard that
    // would have caught `hiden: true` instead of silently listing the app anyway.
    for (const key of Object.keys(value)) {
      if (!OVERLAY_KNOWN_KEYS.includes(key)) {
        const namedSlug = nonEmptyString(value.slug);
        throw new Error(
          `overlay app #${i}${namedSlug === undefined ? '' : ` ("${namedSlug}")`} carries ` +
            `UNKNOWN key "${key}" — the overlay accepts ONLY ${OVERLAY_KNOWN_KEYS.join(', ')}; ` +
            'an unknown key is FATAL because a typo must never be a silent no-op',
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
    // `hidden` is a BOOLEAN, never a truthy string. The overlay is hand-maintained and a
    // malformed entry must never be quietly reinterpreted: `"hidden": "true"` is FATAL.
    if (value.hidden !== undefined && typeof value.hidden !== 'boolean') {
      throw new Error(
        `overlay app "${slug}" has a non-boolean hidden (${JSON.stringify(value.hidden)}) — ` +
          'hidden must be exactly true or false',
      );
    }
    const entry = { slug };
    if (nonEmptyString(value.title) !== undefined) entry.title = value.title;
    if (typeof value.updatedAt === 'string') entry.updatedAt = value.updatedAt;
    if (value.hidden === true) entry.hidden = true;
    if (value.tier !== undefined) {
      if (!APP_TIERS.includes(value.tier)) {
        throw new Error(
          `overlay app "${slug}" has an invalid tier (${JSON.stringify(value.tier)}) — ` +
            `tier must be one of ${APP_TIERS.join(', ')}`,
        );
      }
      if (value.tier !== 'normal') entry.tier = value.tier;
    }
    return entry;
  });
  const version = typeof data.version === 'number' ? data.version : 1;
  return { version, apps };
}

// (b) ENRICHMENT — one LOCAL manifesto read per VISIBLE app folder (a hidden app is not
// read: it has no card), with or without an overlay entry. Absent and non-JSON are both a
// WARNING with the card KEPT: an app may not ship a manifesto yet. Nothing here touches the
// network.
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

  // (c) WITHHOLD. A `hidden: true` overlay entry whose folder IS an app removes that
  // folder from the grid — but NOT from the apps root: the app keeps being SERVED at its
  // URL, and deleting the one key is the whole reversal.
  const hiddenSlugs = new Set(
    overlay.apps
      .filter((entry) => entry.hidden === true)
      .map((entry) => entry.slug.toLowerCase()),
  );
  const visibleFolders = folders.filter((folder) => !hiddenSlugs.has(folder.toLowerCase()));
  const withheldFolders = folders.filter((folder) => hiddenSlugs.has(folder.toLowerCase()));

  // The fold happens BEFORE enrichment on purpose: a hidden app has NO card to enrich, so
  // its manifesto is never read — reading it could only emit a misleading missing-manifesto
  // WARNING about a card that does not exist. Silence about a non-existent card is correct.
  const { enrichment, found, missing, warnings } = await enrich(visibleFolders);

  // BUILD the whole index IN MEMORY. Nothing is written until every step has succeeded.
  const overlayBySlug = new Map();
  for (const entry of overlay.apps) overlayBySlug.set(entry.slug.toLowerCase(), entry);

  // Every app folder matches its overlay entry — INCLUDING a hidden one. A hidden entry is
  // NOT dormant: it is a deliberate withdrawal from the grid, reported by name below.
  const matchedOverlaySlugs = new Set();
  for (const folder of folders) {
    const overlayEntry = overlayBySlug.get(folder.toLowerCase());
    if (overlayEntry !== undefined) matchedOverlaySlugs.add(overlayEntry.slug.toLowerCase());
  }

  const cards = [];
  for (const folder of visibleFolders) {
    const overlayEntry = overlayBySlug.get(folder.toLowerCase());
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
    // tier is EDITORIAL: overlay-only (like `hidden`). Absent means `normal`.
    if (overlayEntry?.tier !== undefined) card.tier = overlayEntry.tier;
    if (manifesto.tagline !== undefined) card.tagline = manifesto.tagline;
    if (manifesto.tags !== undefined) card.tags = manifesto.tags;
    if (manifesto.screenshot !== undefined) card.screenshot = manifesto.screenshot;
    if (manifesto.description !== undefined) card.description = manifesto.description;
    if (manifesto.screenshots !== undefined) card.screenshots = manifesto.screenshots;
    if (manifesto.highlights !== undefined) card.highlights = manifesto.highlights;
    if (manifesto.links !== undefined) card.links = manifesto.links;
    if (manifesto.cta !== undefined) card.cta = manifesto.cta;
    cards.push(card);
  }

  // (d) A DORMANT overlay entry — its folder is NOT an app — produces NO card. It is
  // KEPT and REPORTED: that is how `GM Cockpit` and friends come back the day those apps
  // are republished. A `hidden: true` entry whose folder is not published lands HERE too:
  // dormant, no card, no crash, exactly like every other un-published entry. The grid
  // mirrors the apps root, so the overlay may only decorate or withhold — never create.
  const dormant = overlay.apps.filter(
    (entry) => !matchedOverlaySlugs.has(entry.slug.toLowerCase()),
  );

  const index = { version: overlay.version, apps: cards };
  const text = `${JSON.stringify(index, null, 2)}\n`;

  // (e) ATOMIC-ON-SUCCESS write: write the temp first, then rename. A fatal error above
  // has already returned, leaving the previous file byte-identical.
  const tmpIndex = `${OUT_INDEX}.tmp`;
  try {
    await writeFile(tmpIndex, text);
    await rename(tmpIndex, OUT_INDEX);
  } catch (cause) {
    await rm(tmpIndex, { force: true });
    throw cause;
  }

  // (f) SUMMARY.
  console.log('--- generated app index ---');
  console.log(`overlay:         ${OVERLAY_PATH}`);
  console.log(`apps root:       ${APPS_ROOT_DIR}`);
  console.log(`apps host base:  ${APPS_HOST_BASE} (URL prefix only — NEVER fetched)`);
  console.log(`apps written:    ${cards.length}`);
  // A mechanism whose whole job is to make something invisible must be LOUDER than the
  // thing it hides: every withheld card is NAMED here, so it is findable in six months.
  console.log(
    `hidden:          ${withheldFolders.length}` +
      (withheldFolders.length > 0 ? ` [${withheldFolders.join(', ')}]` : ''),
  );
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
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FATAL: ${message}`);
  console.error('no files written — previously generated index left BYTE-IDENTICAL');
  process.exitCode = 1;
});
