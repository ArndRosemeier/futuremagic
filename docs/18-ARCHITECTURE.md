# 18 — Architecture and the seam index (futuremagic)

**How the code works, and where the ONE way to do X lives.** Every entry here is
CHECKABLE (`file:line`), never prose — if a landing moves a seam, it updates the row
in the SAME commit, because a stale index is worse than no index.

Created 2026-09-21 from a read-only probe whose load-bearing claims the dispatcher
re-verified independently (the live registries were fetched, and
`deploy-clean.ps1`'s skip condition was read in place).

---

## 1 · What it is

A static hub: a grid of separately-deployed browser apps plus a Stories reader,
built to `dist/` by Vite and published to <https://futuremagic.de/>.

**The single most important fact about this codebase:** most of the hub's content is
**data, not source — and the apps half is now GENERATED.** `npm run build` runs
`scripts/generate-app-index.mjs` FIRST: it reads the **LOCAL apps root**
(`APPS_ROOT_DIR`, default `$HOME/apps`) as the ONLY source of existence (**every
top-level DIRECTORY that CONTAINS `index.html` is a card**), folds each app folder's
`futuremagic.json` inline, and writes `public/apps.index.json` (plus a byte-identical
legacy `public/apps.json`). The grid MIRRORS the apps root — the list of cards IS the
list of app folders — and the generator makes **NO HTTP request at all** (ledger row
10). The hub is being installed AT that root, so a local read is the only discovery that
its own `index.html` cannot shadow (board TRAP `hub-at-the-root-blinds-discovery`). The
browser then fetches `/apps.index.json` and `/stories.json` from its OWN origin
(`src/registry.ts:77`, `src/stories.ts:36-43`) and reads NO cross-origin JSON at all —
which is the point: the apps host sends no `Access-Control-Allow-Origin` (`docs/21` §2).
Both generated index files are **gitignored and untracked**: a fresh clone has neither,
and the build creates both. Stories are still hand-managed and still STALE in the repo —
see §5.

## 2 · Layer map

| Layer | Path | Role | ~lines |
|---|---|---|---|
| entry/build | `package.json` | npm scripts + devDeps (`build` = generator + `tsc` + `vite build`; `index`; `verify:index`) | 17 |
| | `vite.config.ts` | `base: '/'`, `outDir: dist` | 9 |
| | `tsconfig.json` | strict, `noEmit`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` | 21 |
| | `index.html` | Vite entry, `#app` | 23 |
| hub UI | `src/main.ts` | shell + app/story rendering | 456 |
| | `src/styles.css` | all styling | 1184 |
| | `src/registry.ts` | apps: fetch `/apps.index.json`, parse INLINE enrichment, resolve href + screenshot | 119 |
| | `src/stories.ts` | stories: fetch, parse | 77 |
| | `src/storyReader.ts` | TOC, scroll-spy highlight, resume | 375 |
| | `src/vibe.ts` | canvas backdrop + agents | 399 |
| | `src/orbitBrand.ts` | brand animation | 204 |
| | `src/types.ts` | shared types (app record + inline enrichment) | 58 |
| data (generated) | `public/apps.index.json` | **GENERATED at build time**, untracked — what the browser reads | — |
| | `public/apps.json` | byte-identical legacy copy of the above, untracked; exists only for `deploy-clean.ps1:148-150` | — |
| data (hand shadow) | `public/stories.json` | **empty** — 0 vs 3 live | 4 |
| | `public/shots/*.png` | 7 screenshots | — |
| content pipeline | `seed/apps.overlay.json` | **the EDITORIAL overlay** — `title`/`updatedAt` decoration for PUBLISHED folders only; it cannot add a card | 69 |
| | `seed/manifestos/*.json` | 7 manifestos, one per app folder (OLD-host deploy seeding, NOT a generator input) | 6 each |
| | `stories/*.md` + `stories/README.md` | story source | 33 + 30 |
| | `tools/story_manager/*.py` | Python FTP story publisher | 732 total |
| | `Story manager.bat` | Windows launcher | 30 |
| generate | `scripts/generate-app-index.mjs` | LOCAL apps-root discovery (the ONLY source of existence) + per-folder manifesto read + overlay decoration → the index (atomic on success, NO network) | 378 |
| | `scripts/verify-app-index.mjs` | offline fixture differential for the generator's pins (8 pins, no server) | 479 |
| | `scripts/fixtures/**` | fixture apps ROOT + fixture overlay used by that differential | — |
| | `scripts/publish-apps-root.sh` | publish `dist/` into the apps root; builds first, NEVER deletes, verifies the local origin | 142 |
| deploy | `deploy-clean.ps1` | manual hub deploy over FTP | 283 |
| | `scripts/Register-FuturemagicApp.ps1` | app deploy calls this to upsert remote `apps.json` (which the hub no longer reads) | 242 |
| | `scripts/capture-app-shots.mjs` | screenshot capture (**broken**, §4) | 45 |

## 3 · The seams — the ONE way to do X

| The one way to do X | Owns it | Gotchas |
|---|---|---|
| **Add an app to the hub** | `scripts/generate-app-index.mjs` (DISCOVERY is the ONLY source of existence) + `seed/apps.overlay.json` (decoration) | Publishing a DIRECTORY **that CONTAINS `index.html`** under the apps root ADDS a card at the next `npm run build` — its title is the folder name unless decorated — so no hub edit is needed; removing the directory (or its `index.html`) removes the card. Discovery reads `APPS_ROOT_DIR` (default `$HOME/apps`) as a LOCAL DIRECTORY, never over HTTP: the hub itself lives at that root now, and its own `index.html` would shadow the host's directory listing (ledger row 10, board TRAP `hub-at-the-root-blinds-discovery`). A directory WITHOUT `index.html` is NOT an app — the static host could not serve it as one — and is reported as `ignored (no index.html): <names>` (a summary line, NOT a warning: the hub's own `assets/` and `shots/` sit there). A top-level FILE is ignored silently. `seed/apps.overlay.json` may only DECORATE an app folder (an editorial `title`, an `updatedAt`); it can NEVER add, move or link a card, and an overlay entry whose folder is not an app is DORMANT (no card; reported as `dormant overlay entries`). The OLD path — `scripts/Register-FuturemagicApp.ps1:102-204` upserting the **remote** `/webseiten/apps.json` — still runs on an app's own deploy, but **the hub no longer reads that file**, so it no longer adds a card. `deploy-clean.ps1` still requires `dist/apps.json` to EXIST (`:148-150`); the generator writes it. |
| **Parse an app record** | `parseRegistryApp` `src/registry.ts:7-41`, `parseRegistry` `:43-52` | Required strings: `slug`, `title`, `path` (`:13-18`). **`updatedAt` is OPTIONAL** (`src/types.ts:10`) — a record without one is KEPT (`:23-24`), because a published folder carries no date of its own and a synthesized date would be a fabricated fact. Optional: the INLINE enrichment `tagline`/`tags`/`screenshot` (`:28-38`). There is **NO `external`/`url`/`manifesto` any more** — dead capability removed with ledger row 9, once the generator could no longer emit them (`docs/21` §8's data-only cross-host move is gone). Invalid entries are still SILENTLY DROPPED (`:47-50`) — the generator's fatal-on-malformed-overlay is the build-time check that makes that safe, because the only writer of this file is the generator. `path` is used **verbatim** as the `href` (`:56-58`); the generator always writes it absolute on the apps host, and only the trailing slash is normalised. |
| **Order the app cards** | `src/registry.ts:105-108` | **`featured` first, then `title.localeCompare`** — NOT registry order, NOT date. `featured` is **derived**, never stored and never displayed: any inline `tagline`/`tags`/`screenshot` (`:86-88`). So losing a tagline un-features a card and reorders the grid; `updatedAt` plays no part in order. (The stories list DOES order by registry order — `src/main.ts:394-396` — which is a different list; conflating the two was a real dispatcher error, board TRAP.) |
| **Decide what is on a card** | `scripts/generate-app-index.mjs:135-148,196-289` (folds it in) → `src/registry.ts:83-103` (renders it) | A card's TITLE follows `manifesto.title` > overlay `title` > folder name (`scripts/generate-app-index.mjs:271-277`); its `updatedAt` comes from the overlay ONLY and the key is OMITTED when absent. Enrichment is INLINE in the generated index: the generator validates each `futuremagic.json` (`tags` kept only if EVERY element is a string) and copies `tagline`/`tags`/`screenshot`. The RUNTIME fetches no manifesto. EVERY app folder's LOCAL manifesto is read, overlay entry or not (the board-row-19 fix); a non-app overlay entry contributes nothing. A missing manifesto is a build-time WARNING + un-enriched card; a missing `updatedAt` renders NO "Updated" element at all (`src/main.ts:38-43`). |
| **Resolve an app's image** | `resolveScreenshotUrl` `src/registry.ts:60-71` | There is NO icon field; only `screenshot` (`src/types.ts:14`). An absolute `/…` or `http(s)://…` is used verbatim; anything else is appended to the app's `href` (`:67-70`). Missing image → console warn + text fallback (`src/main.ts:281-291`). |
| **Capture screenshots** | `scripts/capture-app-shots.mjs` | **BROKEN:** imports `playwright`, which is not a dependency (`package.json:13-16`), and hardcodes 3 targets (`:8-21`) for 7 committed shots. |
| **List / render stories; TOC; highlight** | `loadStories` `src/stories.ts:36-43` → `renderStoriesList` `src/main.ts:380-414` → `mountStoryReader` `src/storyReader.ts:169-374` | TOC is built from `h1`–`h6` (`:63-65,75-106`) with slugified, deduped ids (`:86`, `:32-41`). Highlight = a reading line 22% from the top; the spy locks ~700ms after a TOC click (`:280-289,326-334`). Order is registry order, NOT date (`src/main.ts:394-396`). |
| **Publish a story** | `tools/story_manager/app.py` → `parse_story_file` (`markdown_story.py:71-98`) → `publish_selected` (`app.py:317-362`) | Slug = filename stem (`:79,31-35`); `date` defaults to today; `title` falls back to the first H1, then the filename (`:81-83`). Uploads `stories/<slug>.html` and rewrites the **remote** `stories.json` (`:338-352`). Windows-only launcher. |
| **Author a manifesto** | `<APPS_ROOT_DIR>/{folder}/futuremagic.json`, read by `scripts/generate-app-index.mjs:214-243` | Read from the app's OWN folder in the LOCAL apps root at BUILD time. The filename must be exactly `futuremagic.json`. EVERY app folder is read — there is no `manifesto: false` opt-out any more (`external`/`url`/`manifesto` were removed as dead capability, ledger row 9). `seed/manifestos/<AppFolder>.json` is the OLD-host deploy's seed (`deploy-clean.ps1:261-273`) and is **NOT** an input to the generator. `title` IS now consumed (precedence: `manifesto.title` > overlay `title` > folder name); `tagline`/`tags`/`screenshot` are inlined. An absent or non-JSON manifesto is a WARNING (card kept, un-enriched). The LOCAL read is why nothing can shadow it: the hub's own `index.html` sits beside these folders, not on the path to them (ledger row 10). |
| **Build the site** | `package.json:10` — `npm run build` | `= node scripts/generate-app-index.mjs && tsc && vite build`. Requires `npm ci` first (`node_modules/` is not committed) and reads the LOCAL apps root (`APPS_ROOT_DIR`, default `$HOME/apps`). **It needs NO network at all** (ledger row 10): `APPS_HOST_BASE` is a URL prefix, never fetched, and an arm of `npm run verify:index` proves it by pointing that variable at an unroutable `.invalid` host through a dead proxy and still exiting 0. `npm run index` (`:8`) runs just the generator; `npm run verify:index` (`:9`) is the offline fixture differential (no server, no socket). |
| **Publish the hub to the apps root** | `scripts/publish-apps-root.sh` | This is what makes `https://apps.futuremagic.de/` BE the hub. Target = `$1`, else `$APPS_ROOT_DIR`, else `$HOME/apps`; refuses a target that does not exist or is not a directory; runs `npm run build` FIRST and publishes NOTHING if it fails; copies `dist/` CONTENTS in, OVERWRITING only files the hub ships and **NEVER deleting** (no `--delete`, no `rm`: the app folders belong to their own deploys); then verifies by fetching the LOCAL origin `http://127.0.0.1:8082/` (bypasses the CDN, per the apps-publish skill) and asserting the HUB (`id="app"`) rather than a directory listing, quoting the HTTP code. Exit 0 only if all of that held. |
| **Deploy the hub** | `deploy-clean.ps1` (manual, PowerShell, FTP) | See §5. It uploads the generated `dist/apps.index.json` (a name `:210-215` does not skip) and merely requires `dist/apps.json` to exist (`:148-150`), which the generator also writes. |
| **Register an app after its own deploy** | `scripts/Register-FuturemagicApp.ps1` | It still upserts the REMOTE `/webseiten/apps.json` for the OLD host — a file the hub NO LONGER reads (`src/registry.ts:77`). Its `manifesto` re-stamping downgrade hazard (§4.2) therefore no longer changes what the hub shows, though it still corrupts the legacy registry. |

## 4 · Data contracts, and the hazards

**`apps.index.json`** — root `{version, apps[]}`; `apps` is REQUIRED or the load throws
(`src/registry.ts:44-46`), `version` defaults to 1 (`:50`). Entry: REQUIRED
`slug`/`title`/`path`; OPTIONAL `updatedAt` and the INLINE `tagline`/`tags`/`screenshot`
— there is NO `external`/`url`/`manifesto` any more (ledger row 9). `path` is always an
ABSOLUTE URL on the apps host. Written by `scripts/generate-app-index.mjs`;
`public/apps.json` is a byte-identical copy of the same text. **The repo tracks
neither** — a fresh clone builds them.

**`stories.json`** — root `{version, stories[]}`; `stories` REQUIRED
(`src/stories.ts:26-28`). Entry: required `slug`/`title`/`date`/`path` (`:9-20`),
optional `excerpt` defaulting to `""` (`:21`), invalid entries dropped silently
(`:31`). The Python writer is STRICTER than the reader — it raises `ValueError` on a
missing required field (`tools/story_manager/registry.py:24-30`) — so the two ends
disagree about what a valid record is.

**`<APPS_ROOT_DIR>/{folder}/futuremagic.json`** (manifesto) — ALL fields optional, read
from the LOCAL apps root at BUILD time by the generator
(`scripts/generate-app-index.mjs:135-148,214-243`): `title` (now CONSUMED — it is the first
level of the title precedence), `tagline`, `tags` (kept only if every element is a
string), `screenshot`. One is read for EVERY app folder, overlay entry or not; there is no
opt-out flag. Unknown keys are ignored. An absent / non-JSON manifesto is a build-time
warning and the card is un-enriched; unlike the old HTTP read, there is no transport
failure to be fatal — a LOCAL read either returns bytes or an errno.
`src/types.ts:22-33` keeps the `AppManifesto` type as the documented contract between an
app and the generator (the runtime no longer fetches it).

### Hazards (real, with evidence — these are QUEUE items on the board)

1. **Registry clobber against a non-existent remote registry — FIXED FOR APPS BY
   CONSTRUCTION (ledger row 7); OPEN FOR STORIES.** `deploy-clean.ps1:210-215` skips
   `apps.json`/`stories.json` **only if the live FTP listing already contains them**
   (`$names`, built at `:169-173` from `List-FtpDirectoryDetails $RemotePath`). There is
   no longer a tracked `public/apps.json` to ship — it is generated and untracked — so
   the apps half of this hazard died by construction rather than by a guard. The repo's
   EMPTY `public/stories.json` is still tracked and still ships when the remote registry
   is absent (queue row 18).
2. **Registration downgrade — now cosmetic for the hub.** `Register-FuturemagicApp.ps1:170-190`
   re-stamps `manifesto` from local file presence, so omitting `-ManifestoLocalPath`
   silently flips `manifesto: true` → `false` in the LEGACY remote `/webseiten/apps.json`.
   The hub no longer reads that file (`src/registry.ts:77`), so the tagline/tags/shot no
   longer disappear from the hub — but that registry is still corrupted for any other
   reader.
3. **`$ProtectedDirs` is stale.** 8 names (`deploy-clean.ps1:20-29`) against the 12
   old-site apps: `GM_Helper`, `Campaigner`, `BlasterMaster`, `Civ`, `Orion` are missing.
   NOT destructive (the script never deletes a directory), but the FTP-root verification
   at `:179-190` warns misleadingly and those apps' manifestos are never refreshed.
   PARK-UNTIL-FORWARD (ledger row 8): this list protects the OLD site's copies, which the
   hub no longer lists (ledger row 9); do not edit the Windows deploy script for it.
4. **Windows-only toolchain.** `deploy-clean.ps1` (PowerShell/.NET), `Story
   manager.bat` (`%~dp0`, backslashes), and docs paths like `C:\Projekte\FutureMagic`
   (`tools/story_manager/README.md:8`, `stories/README.md:6`). **This box has no
   `pwsh` or `powershell`** — so neither the hub deploy nor the story publish can run
   here as written. A change to either cannot be end-to-end verified on this host.

## 5 · What ships vs what is live — measured 2026-09-21

| Registry | In the repo | LIVE | Delta |
|---|---|---|---|
| `public/apps.index.json` | **generated, untracked** | **2 cards** (`expert`, `fracvibe`) | written by `npm run build` from the LOCAL apps-root directory (`APPS_ROOT_DIR`) + `seed/apps.overlay.json` (decoration only); **11** overlay entries are DORMANT |
| `stories.json` | 0 stories (tracked shadow) | **3 stories** | `the-last-letter-at-dunmore-pier`, `abundance`, `the-dragon-kept-the-receipt` |

Published folders (measured 2026-09-21): `expert/` (a SYMLINK to the Expert repo's
`dist/`) and `fracvibe/` — plus the FILE `README.md`, which is not a card. The apps root
itself is the directory the static host serves and, after the hub is published there, the
directory this hub occupies.

Dormant overlay slugs (11): `LlmTable, ColossusWeb, ArmchairGeneral, Conquest, Eco,
EccentriCity, GM_Helper, Campaigner, BlasterMaster, Civ, Orion`.

**The apps half is no longer a shadow, and the grid MIRRORS the host.**
`seed/apps.overlay.json` is DECORATION for app folders and the generated index is
what the browser reads; the generator reads each app folder's `futuremagic.json`
itself, so a newly published folder is enriched with no hub edit (the board-row-19 fix).
Of the 12 old-site apps the overlay remembers, only `expert` is published under `~/apps`,
so the other 11 entries are inert (dormant) and produce no card until that app is
republished on the new host. The **stories** half is
unchanged: `public/stories.json` is owned by the server (the Story Manager writes it),
which is why `deploy-clean.ps1` tries to skip it. Do not treat the repo's empty
`public/stories.json` as the live list — fetch `https://futuremagic.de/stories.json`.

## 6 · Known debt

- `escapeHtml` duplicated: `src/main.ts:15-21` and `src/storyReader.ts:14-20`.
- `isRecord` duplicated: `src/registry.ts:3-5` and `src/stories.ts:3-5`.
- Date formatting implemented twice: `src/registry.ts:111-119` vs `src/stories.ts:53-77`.
- The registry parse scaffold is duplicated: `src/registry.ts:43-52` vs `src/stories.ts:25-34`
  (both drop bad entries silently — the app side is now fed only by the generator, the
  story side by the hand-managed server registry).
- The app list now has ONE source of EXISTENCE (the apps-root DIRECTORY listing) plus ONE
  editorial overlay (`seed/apps.overlay.json`, decoration only) and a generator;
  `seed/manifestos/` (7) is still a second, OLD-host-only list (PARK-UNTIL-FORWARD,
  ledger row 8), and `$ProtectedDirs` (8, `deploy-clean.ps1:20-29`) is a deploy-protection
  list that still disagrees with the 12 old-site apps and protects a site the hub no
  longer lists. `stories.json` remains hand-managed with no source.
- `tools/story_manager/requirements.txt:1` pins `markdown>=3.5` — unbounded.
- `stories/the-long-road.md` is committed but absent from the live `stories.json`.
- **No tests and no CI.** The gate (`npm run build` = generated index + typecheck +
  build) is the whole safety net; `npm run verify:index` is an offline differential for
  the generator alone.

## 7 · Open question

The GRID question is settled (ledger row 9): the cards ARE the folders under the apps
root, and the old-site registry, `Register-FuturemagicApp.ps1`, `$ProtectedDirs` and
`seed/manifestos/` are PARK-UNTIL-FORWARD decoration for the OLD site that cannot add a
card. The hub's HOME is settled too (ledger row 10, board row 20): the hub moves to the
apps root AS THE ROOT, so `base: '/'` and every root-relative path (`/apps.index.json`,
`/stories.json`, `/shots/*.png`, `/favicon.svg`) are already correct — a subpath base
would be needed only if the hub ever moved into a subfolder. The forward of
`futuremagic.de` to `apps.futuremagic.de` is still a LATE owner act (ledger row 8) and is
untouched by this row. What remains open is app-side and tracked on the board: row 21,
`expert/futuremagic.json` ships a root-absolute `"screenshot": "/shots/Expert.png"`, which
`resolveScreenshotUrl` returns verbatim, so it resolves against the HUB's origin — correct
only because the hub's own `shots/` now sits at that same root; and the converse coupling,
an APP that references root-absolute `/assets/…` now collides with the HUB's own
`/assets/`, which is why the apps-publish skill's step 2 requires each app to use a
`/<name>/` base.
