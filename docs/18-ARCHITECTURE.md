# 18 — Architecture and the seam index (futuremagic)

**How the code works, and where the ONE way to do X lives.** Every entry here is
CHECKABLE (`file:line`), never prose — if a landing moves a seam, it updates the row
in the SAME commit, because a stale index is worse than no index.

Created 2026-09-21; rewritten 2026-10-06 after the hero-tier merge and the purge of the
old-host deploy + Stories (ledger row 12).

---

## 1 · What it is

A static hub: a grid of separately-deployed browser apps, built to `dist/` by Vite and
published to <https://apps.futuremagic.de/> (the hub lives AT the apps root — ledger
row 10). There is no Stories section any more, and there is no old-host deploy.

**The single most important fact about this codebase:** the app list is **GENERATED.**
`npm run build` runs `scripts/generate-app-index.mjs` FIRST: it reads the **LOCAL apps
root** (`APPS_ROOT_DIR`, default `$HOME/apps`) as the ONLY source of existence (**every
top-level DIRECTORY that CONTAINS `index.html` is a card**), folds each app folder's
`futuremagic.json` inline, and writes `public/apps.index.json`. The grid MIRRORS the apps
root — the list of cards IS the list of app folders, MINUS any folder the editorial
overlay WITHHOLDS with `hidden: true` (ledger row 11) — and the generator makes **NO HTTP
request at all** (ledger row 10). The hub is installed AT that root, so a local read is
the only discovery that its own `index.html` cannot shadow (board TRAP
`hub-at-the-root-blinds-discovery`). The browser fetches `/apps.index.json` from its OWN
origin (`src/registry.ts`) and reads NO cross-origin JSON at all — which is the point: the
apps host sends no `Access-Control-Allow-Origin` (`docs/21` §2). The index is
**gitignored and untracked**: a fresh clone has none, and the build creates it.

Cards are displayed in THREE tiers (`hero` / `normal` / `further`, ledger row 12):
`tier` is EDITORIAL and lives in the overlay (like `hidden`); the hero banner's extended
content (`description`/`screenshots`/`highlights`/`links`/`cta`) lives in the app's own
`futuremagic.json` and is inlined at build time.

## 2 · Layer map

| Layer | Path | Role |
|---|---|---|
| entry/build | `package.json` | npm scripts + devDeps (`build` = generator + `tsc` + `vite build`; `index`; `verify:index`) |
| | `vite.config.ts` | `base: '/'`, `outDir: dist` |
| | `tsconfig.json` | strict, `noEmit`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |
| | `index.html` | Vite entry, `#app` |
| hub UI | `src/main.ts` | shell + tiered app rendering (hero / normal grid / further) |
| | `src/styles.css` | all styling |
| | `src/registry.ts` | apps: fetch `/apps.index.json`, parse INLINE enrichment + tier, resolve href + screenshot |
| | `src/vibe.ts` | canvas backdrop + agents |
| | `src/orbitBrand.ts` | brand animation |
| | `src/types.ts` | shared types (app record + tier + hero fields) |
| data (generated) | `public/apps.index.json` | **GENERATED at build time**, untracked — what the browser reads |
| content pipeline | `seed/apps.overlay.json` | **the EDITORIAL overlay** — `title`/`updatedAt` decoration, `hidden` withholding, and `tier` for PUBLISHED folders only; it cannot add a card; an UNKNOWN key is FATAL by name |
| generate | `scripts/generate-app-index.mjs` | LOCAL apps-root discovery (the ONLY source of existence) + per-folder manifesto read (SKIPPED for hidden folders) + overlay decoration/withholding/tier → the index (atomic on success, NO network) |
| | `scripts/verify-app-index.mjs` | offline fixture differential for the generator's pins (no server) |
| | `scripts/fixtures/**` | fixture apps ROOT + fixture overlay used by that differential |
| | `scripts/publish-apps-root.sh` | publish `dist/` into the apps root; builds first, NEVER deletes, verifies the local origin |

## 3 · The seams — the ONE way to do X

| The one way to do X | Owns it | Gotchas |
|---|---|---|
| **Add an app to the hub** | `scripts/generate-app-index.mjs` (DISCOVERY is the ONLY source of existence) + `seed/apps.overlay.json` (decoration/withholding/tier) | Publishing a DIRECTORY **that CONTAINS `index.html`** under the apps root ADDS a card at the next `npm run build` — its title is the folder name unless decorated — so no hub edit is needed; removing the directory (or its `index.html`) removes the card. Discovery reads `APPS_ROOT_DIR` (default `$HOME/apps`) as a LOCAL DIRECTORY, never over HTTP: the hub itself lives at that root now, and its own `index.html` would shadow the host's directory listing (ledger row 10, board TRAP `hub-at-the-root-blinds-discovery`). A directory WITHOUT `index.html` is NOT an app and is reported as `ignored (no index.html): <names>` (a summary line, NOT a warning: the hub's own `assets/` and `shots/` sit there). A top-level FILE is ignored silently. The overlay accepts ONLY `slug`/`title`/`updatedAt`/`hidden`/`tier`; an UNKNOWN key (e.g. the typo `hiden`) is FATAL by name, and the forbidden `path`/`manifesto`/`external`/`url` are fatal too (the overlay may DECORATE or WITHHOLD or set `tier`, never ADD a card, a path or a link). Hiding REMOVES the card but NOT the app: the folder stays published and the app is still SERVED at its URL, so deleting the one key is the whole reversal; every withheld card is NAMED in the summary (`hidden: N [names]`). An overlay entry whose folder is not an app is DORMANT (no card; reported). |
| **Set an app's tier** | `seed/apps.overlay.json` `tier` key | EDITORIAL, like `hidden`. `hero` = showcase banner; `normal` = card grid (DEFAULT — absent key or `tier: "normal"`); `further` = compact bottom list. An invalid value is FATAL by name. A `hero` app without hero manifesto content still renders its title + screenshot. |
| **Author hero content** | `<APPS_ROOT_DIR>/{folder}/futuremagic.json` `description`/`screenshots`/`highlights`/`links`/`cta` | Inlined at build time by the generator; the runtime fetches nothing new. All optional. `screenshots` falls back to `screenshot`; `cta` falls back to "Launch". |
| **Parse an app record** | `parseRegistryApp` `src/registry.ts`, `parseRegistry` | Required strings: `slug`, `title`, `path`. **`updatedAt` is OPTIONAL** — a record without one is KEPT, because a published folder carries no date and a synthesized date would be a fabricated fact. Optional: `tier` and the INLINE enrichment (`tagline`/`tags`/`screenshot`) + hero fields (`description`/`screenshots`/`highlights`/`links`/`cta`). There is **NO `external`/`url`/`manifesto`** any more (ledger row 9). Invalid entries are SILENTLY DROPPED — the generator's fatal-on-malformed-overlay is the build-time check that makes that safe, because the only writer of this file is the generator. `path` is used **verbatim** as the `href`; the generator always writes it absolute on the apps host. |
| **Order the app cards** | `src/registry.ts` sort | **`featured` first, then `title.localeCompare`** — NOT registry order, NOT date, NOT tier. `featured` is **derived**, never stored: any inline `tagline`/`tags`/`screenshot`. Tiers partition, but within a tier the sort is still featured-first. |
| **Decide what is on a card** | `scripts/generate-app-index.mjs` (folds it in) → `src/registry.ts` (resolves it) | TITLE: `manifesto.title` > overlay `title` > folder name. `updatedAt` from the overlay ONLY, key OMITTED when absent. Enrichment + hero fields are INLINE in the generated index; the RUNTIME fetches no manifesto. EVERY **visible** app folder's LOCAL manifesto is read, overlay entry or not; a HIDDEN folder is excluded BEFORE enrichment. |
| **Resolve an app's image** | `resolveScreenshotUrl` `src/registry.ts` | There is NO icon field; only `screenshot`. An absolute `/…` or `http(s)://…` is used verbatim; anything else is appended to the app's `href`. Missing image → console warn + text fallback. |
| **Build the site** | `package.json:10` — `npm run build` | `= node scripts/generate-app-index.mjs && tsc && vite build`. Requires `npm ci` first. **It needs NO network at all** (ledger row 10): `APPS_HOST_BASE` is a URL prefix, never fetched. |
| **Publish the hub to the apps root** | `scripts/publish-apps-root.sh` | This is what makes `https://apps.futuremagic.de/` BE the hub. Target = `$1`, else `$APPS_ROOT_DIR`, else `$HOME/apps`; refuses a target that does not exist or is not a directory; runs `npm run build` FIRST and publishes NOTHING if it fails; copies `dist/` CONTENTS in, OVERWRITING only files the hub ships and **NEVER deleting** (no `--delete`, no `rm`: the app folders belong to their own deploys); then verifies by fetching the LOCAL origin `http://127.0.0.1:8082/` and asserting the HUB (`id="app"`) rather than a directory listing. Exit 0 only if all of that held. |

## 4 · Data contracts

**`apps.index.json`** — root `{version, apps[]}`; `apps` is REQUIRED or the load throws,
`version` defaults to 1. Entry: REQUIRED `slug`/`title`/`path`; OPTIONAL `updatedAt`,
`tier`, `tagline`/`tags`/`screenshot`, and hero `description`/`screenshots`/`highlights`/
`links`/`cta`. `path` is always an ABSOLUTE URL on the apps host. Written by
`scripts/generate-app-index.mjs`. **The repo does not track it** — a fresh clone builds it.

**`<APPS_ROOT_DIR>/{folder}/futuremagic.json`** (manifesto) — ALL fields optional, read
from the LOCAL apps root at BUILD time by the generator: `title`, `tagline`, `tags`,
`screenshot`, `description`, `screenshots`, `highlights`, `links` (`{label,url}[]`), `cta`.
One is read for EVERY **visible** app folder, overlay entry or not; a folder withheld by
the overlay (`hidden: true`) is NOT read. Unknown keys are ignored. An absent / non-JSON
manifesto is a build-time warning and the card is un-enriched. `src/types.ts` keeps the
`AppManifesto` type as the documented contract between an app and the generator.

## 5 · What ships vs what is live

| Registry | In the repo | LIVE | Delta |
|---|---|---|---|
| `public/apps.index.json` | **generated, untracked** | **17 cards** | written by `npm run build` from the LOCAL apps-root directory + `seed/apps.overlay.json`; **2** entries HIDDEN — `Campaigner`, `Playtron` (PUBLISHED and still SERVED, cards withheld); **1** DORMANT (`Orion`); **1** hero (`scale`, `tier: "hero"`) |

Published folders (measured 2026-10-06, 19 app folders): `ArmchairGeneral`,
`BlasterMaster`, `Campaigner`, `Civ`, `ColossusWeb`, `Conquest`, `EccentriCity`, `Eco`,
`GM_Helper`, `LlmTable`, `Norgo`, `Playtron`, `expert` (a SYMLINK), `filestore`,
`fracvibe`, `imager`, `minion`, `scale`, `xenoworld` — plus the directories
`CosmereCharacterSheet/`, `assets/`, `shots/` which have NO `index.html` and are therefore
NOT apps (`ignored (no index.html)`), and top-level files such as `README.md`, ignored
silently. `stories/` no longer exists (ledger row 12).

## 6 · Known debt

- `escapeHtml` and the registry-parse scaffold are each implemented once in
  `src/main.ts`/`src/registry.ts` (the story copies were removed with Stories, ledger
  row 12).
- **No tests and no CI.** The gate (`npm run build` = generated index + typecheck +
  build) is the whole safety net; `npm run verify:index` is an offline differential for
  the generator alone.
- The hero banner's visual layout is a first pass — the owner iterates once he sees it.

## 7 · Open question

None blocking. The old site (`futuremagic.de`), its `deploy-clean.ps1`,
`Register-FuturemagicApp.ps1`, `$ProtectedDirs` and `seed/manifestos/` are all REMOVED
(ledger row 12); the ONLY deploy path is `scripts/publish-apps-root.sh` → the apps root.
A forward of `futuremagic.de` → `apps.futuremagic.de`, if the owner still wants it, is a
DNS/redirect act outside this repo. App-side coupling remains as ever: each app must use a
`/<name>/` base (the publish skill's step 2), and an app's root-absolute `"screenshot"`
resolves against the hub's own `shots/`.
