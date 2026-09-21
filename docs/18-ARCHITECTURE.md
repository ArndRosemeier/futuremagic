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
`scripts/generate-app-index.mjs` FIRST: it discovers app folders from
`https://apps.futuremagic.de/`'s auto-generated listing, folds each app's
`futuremagic.json` inline, and writes `public/apps.index.json` (plus a byte-identical
legacy `public/apps.json`). The browser then fetches `/apps.index.json` and
`/stories.json` from its OWN origin (`src/registry.ts:87`, `src/stories.ts:36-43`) and
reads NO cross-origin JSON at all — which is the point: the apps host sends no
`Access-Control-Allow-Origin` (`docs/21` §2). Both generated index files are
**gitignored and untracked**: a fresh clone has neither, and the build creates both.
Stories are still hand-managed and still STALE in the repo — see §5.

## 2 · Layer map

| Layer | Path | Role | ~lines |
|---|---|---|---|
| entry/build | `package.json` | npm scripts + devDeps (`build` = generator + `tsc` + `vite build`; `index`; `verify:index`) | 17 |
| | `vite.config.ts` | `base: '/'`, `outDir: dist` | 9 |
| | `tsconfig.json` | strict, `noEmit`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` | 21 |
| | `index.html` | Vite entry, `#app` | 23 |
| hub UI | `src/main.ts` | shell + app/story rendering | 456 |
| | `src/styles.css` | all styling | 1184 |
| | `src/registry.ts` | apps: fetch `/apps.index.json`, parse INLINE enrichment, resolve screenshot | 129 |
| | `src/stories.ts` | stories: fetch, parse | 77 |
| | `src/storyReader.ts` | TOC, scroll-spy highlight, resume | 375 |
| | `src/vibe.ts` | canvas backdrop + agents | 399 |
| | `src/orbitBrand.ts` | brand animation | 204 |
| | `src/types.ts` | shared types (app record + inline enrichment) | 60 |
| data (generated) | `public/apps.index.json` | **GENERATED at build time**, untracked — what the browser reads | — |
| | `public/apps.json` | byte-identical legacy copy of the above, untracked; exists only for `deploy-clean.ps1:148-150` | — |
| data (hand shadow) | `public/stories.json` | **empty** — 0 vs 3 live | 4 |
| | `public/shots/*.png` | 7 screenshots | — |
| content pipeline | `seed/apps.inventory.json` | **the EDITORIAL app list** — the only hand-maintained app input | 89 |
| | `seed/manifestos/*.json` | 7 manifestos, one per app folder (OLD-host deploy seeding, NOT a generator input) | 6 each |
| | `stories/*.md` + `stories/README.md` | story source | 33 + 30 |
| | `tools/story_manager/*.py` | Python FTP story publisher | 732 total |
| | `Story manager.bat` | Windows launcher | 30 |
| generate | `scripts/generate-app-index.mjs` | discovery + enrichment → the index (atomic on success) | 321 |
| | `scripts/verify-app-index.mjs` | offline fixture differential for the generator's pins | 225 |
| | `scripts/fixtures/**` | fixture apps host + inventory used by that differential | — |
| deploy | `deploy-clean.ps1` | manual hub deploy over FTP | 283 |
| | `scripts/Register-FuturemagicApp.ps1` | app deploy calls this to upsert remote `apps.json` (which the hub no longer reads) | 242 |
| | `scripts/capture-app-shots.mjs` | screenshot capture (**broken**, §4) | 45 |

## 3 · The seams — the ONE way to do X

| The one way to do X | Owns it | Gotchas |
|---|---|---|
| **Add an app to the hub** | `scripts/generate-app-index.mjs` (DISCOVERY) + `seed/apps.inventory.json` (editorial) | Publishing a folder on the apps host ADDS a card at the next `npm run build` — folder name as title, with a LOUD warning — so no hub edit is needed. An editorial title, an `updatedAt`, or a per-record host move is a record in `seed/apps.inventory.json`. The OLD path — `scripts/Register-FuturemagicApp.ps1:102-204` upserting the **remote** `/webseiten/apps.json` — still runs on an app's own deploy, but **the hub no longer reads that file**, so it no longer adds a card. `deploy-clean.ps1` still requires `dist/apps.json` to EXIST (`:148-150`); the generator writes it. |
| **Parse an app record** | `parseRegistryApp` `src/registry.ts:7-50`, `parseRegistry` `:52-61` | Required strings: `slug`, `title`, `path` (`:13-21`). **`updatedAt` is OPTIONAL** (`src/types.ts:10`) — a record without one is KEPT (`:24-26`), because a discovered folder has no date and a synthesized date would be a fabricated fact. Optional: `external`, `url`, `manifesto`, and the INLINE enrichment `tagline`/`tags`/`screenshot` (`:31-48`). Invalid entries are still SILENTLY DROPPED (`:56-59`) — the generator's fatal-on-malformed-inventory is the build-time check that makes that safe, because the only writer of this file is the generator. `url` is read **only when `external === true`** (`:63-68`); `path` is used **verbatim** as the `href` (`:68`) and is NOT required to be root-relative — which is what makes a cross-host record a data-only change (`docs/21` §8). |
| **Order the app cards** | `src/registry.ts:115-118` | **`featured` first, then `title.localeCompare`** — NOT registry order, NOT date. `featured` is **derived**, never stored and never displayed: any inline `tagline`/`tags`/`screenshot` (`:97-99`). So losing a tagline un-features a card and reorders the grid; `updatedAt` plays no part in order. (The stories list DOES order by registry order — `src/main.ts:394-396` — which is a different list; conflating the two was a real dispatcher error, board TRAP.) |
| **Decide what is on a card** | `scripts/generate-app-index.mjs:114-127,197-241` (folds it in) → `src/registry.ts:94-108` (renders it) | Enrichment is INLINE in the generated index: the generator validates each `futuremagic.json` exactly as the old runtime `parseManifesto` did (`tags` kept only if EVERY element is a string) and copies `tagline`/`tags`/`screenshot`. The RUNTIME fetches no manifesto. The inventory title is authoritative; a discovered app is titled with its folder name. A missing manifesto is a build-time WARNING + un-enriched card; a missing `updatedAt` renders NO "Updated" element at all (`src/main.ts:38-43`). |
| **Resolve an app's image** | `resolveScreenshotUrl` `src/registry.ts:70-81` | There is NO icon field; only `screenshot` (`src/types.ts:22`). An absolute `/…` or `http(s)://…` is used verbatim; anything else is appended to the app's `href` (`:77-80`). Missing image → console warn + text fallback (`src/main.ts:281-291`). |
| **Capture screenshots** | `scripts/capture-app-shots.mjs` | **BROKEN:** imports `playwright`, which is not a dependency (`package.json:13-16`), and hardcodes 3 targets (`:8-21`) for 7 committed shots. |
| **List / render stories; TOC; highlight** | `loadStories` `src/stories.ts:36-43` → `renderStoriesList` `src/main.ts:380-414` → `mountStoryReader` `src/storyReader.ts:169-374` | TOC is built from `h1`–`h6` (`:63-65,75-106`) with slugified, deduped ids (`:86`, `:32-41`). Highlight = a reading line 22% from the top; the spy locks ~700ms after a TOC click (`:280-289,326-334`). Order is registry order, NOT date (`src/main.ts:394-396`). |
| **Publish a story** | `tools/story_manager/app.py` → `parse_story_file` (`markdown_story.py:71-98`) → `publish_selected` (`app.py:317-362`) | Slug = filename stem (`:79,31-35`); `date` defaults to today; `title` falls back to the first H1, then the filename (`:81-83`). Uploads `stories/<slug>.html` and rewrites the **remote** `stories.json` (`:338-352`). Windows-only launcher. |
| **Author a manifesto** | `{path}futuremagic.json`, fetched by `scripts/generate-app-index.mjs:201-241` | Read from the app's OWN host at BUILD time (Node has no CORS). The filename must be exactly `futuremagic.json` in the app's published folder. `seed/manifestos/<AppFolder>.json` is the OLD-host deploy's seed (`deploy-clean.ps1:261-273`) and is **NOT** an input to the generator. The generator fetches only when `external !== true && manifesto !== false` (`scripts/generate-app-index.mjs:138-143`). A 404 is a WARNING (card kept, un-enriched); a TRANSPORT failure to the host is FATAL. |
| **Build the site** | `package.json:10` — `npm run build` | `= node scripts/generate-app-index.mjs && tsc && vite build`. Requires `npm ci` first (`node_modules/` is not committed) AND a route to `apps.futuremagic.de` + `futuremagic.de`: the generator fails RED when a host is unreachable. `npm run index` (`:8`) runs just the generator; `npm run verify:index` (`:9`) is the offline fixture differential. |
| **Deploy the hub** | `deploy-clean.ps1` (manual, PowerShell, FTP) | See §5. It uploads the generated `dist/apps.index.json` (a name `:210-215` does not skip) and merely requires `dist/apps.json` to exist (`:148-150`), which the generator also writes. |
| **Register an app after its own deploy** | `scripts/Register-FuturemagicApp.ps1` | It still upserts the REMOTE `/webseiten/apps.json` for the OLD host — a file the hub NO LONGER reads (`src/registry.ts:87`). Its `manifesto` re-stamping downgrade hazard (§4.2) therefore no longer changes what the hub shows, though it still corrupts the legacy registry. |

## 4 · Data contracts, and the hazards

**`apps.index.json`** — root `{version, apps[]}`; `apps` is REQUIRED or the load throws
(`src/registry.ts:53-55`), `version` defaults to 1 (`:60`). Entry: REQUIRED
`slug`/`title`/`path`; OPTIONAL `updatedAt`, `external`, `url`, `manifesto`, and the
INLINE `tagline`/`tags`/`screenshot`. Written by `scripts/generate-app-index.mjs`;
`public/apps.json` is a byte-identical copy of the same text. **The repo tracks
neither** — a fresh clone builds them.

**`stories.json`** — root `{version, stories[]}`; `stories` REQUIRED
(`src/stories.ts:26-28`). Entry: required `slug`/`title`/`date`/`path` (`:9-20`),
optional `excerpt` defaulting to `""` (`:21`), invalid entries dropped silently
(`:31`). The Python writer is STRICTER than the reader — it raises `ValueError` on a
missing required field (`tools/story_manager/registry.py:24-30`) — so the two ends
disagree about what a valid record is.

**`{path}/futuremagic.json`** (manifesto) — ALL fields optional, read at BUILD time by
the generator (`scripts/generate-app-index.mjs:114-127`): `tagline`, `tags` (kept only
if every element is a string), `screenshot`. `title` appears in the app-side shape but
is **NOT consumed** — the inventory title (or the folder name, for a discovered app) is
authoritative. Unknown keys are ignored. A 404 is a build-time warning and the card is
un-enriched; a transport failure to the host is fatal. `src/types.ts:31-35` keeps the
`AppManifesto` type as the documented contract between an app and the generator (the
runtime no longer fetches it).

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
   The hub no longer reads that file (`src/registry.ts:87`), so the tagline/tags/shot no
   longer disappear from the hub — but that registry is still corrupted for any other
   reader.
3. **`$ProtectedDirs` is stale.** 8 names (`deploy-clean.ps1:20-29`) against 12 live
   apps: `GM_Helper`, `Campaigner`, `BlasterMaster`, `Civ`, `Orion` are missing. NOT
   destructive (the script never deletes a directory), but the FTP-root verification
   at `:179-190` warns misleadingly and those apps' manifestos are never refreshed.
4. **Windows-only toolchain.** `deploy-clean.ps1` (PowerShell/.NET), `Story
   manager.bat` (`%~dp0`, backslashes), and docs paths like `C:\Projekte\FutureMagic`
   (`tools/story_manager/README.md:8`, `stories/README.md:6`). **This box has no
   `pwsh` or `powershell`** — so neither the hub deploy nor the story publish can run
   here as written. A change to either cannot be end-to-end verified on this host.

## 5 · What ships vs what is live — measured 2026-09-21

| Registry | In the repo | LIVE | Delta |
|---|---|---|---|
| `public/apps.index.json` | **generated, untracked** | **13 cards** = 12 inventory + 1 discovered (`fracvibe`) | written by `npm run build` from `seed/apps.inventory.json` + the apps-host listing |
| `stories.json` | 0 stories (tracked shadow) | **3 stories** | `the-last-letter-at-dunmore-pier`, `abundance`, `the-dragon-kept-the-receipt` |

Inventory slugs: `Expert, LlmTable, ColossusWeb, ArmchairGeneral, Conquest, Eco,
EccentriCity, GM_Helper, Campaigner, BlasterMaster, Civ, Orion`.

**The apps half is no longer a shadow.** `seed/apps.inventory.json` is the editorial
source and the generated index is what the browser reads; the generator fetches the 11
live `futuremagic.json` files itself, so no enrichment is lost. The **stories** half is
unchanged: `public/stories.json` is owned by the server (the Story Manager writes it),
which is why `deploy-clean.ps1` tries to skip it. Do not treat the repo's empty
`public/stories.json` as the live list — fetch `https://futuremagic.de/stories.json`.

## 6 · Known debt

- `escapeHtml` duplicated: `src/main.ts:15-21` and `src/storyReader.ts:14-20`.
- `isRecord` duplicated: `src/registry.ts:3-5` and `src/stories.ts:3-5`.
- Date formatting implemented twice: `src/registry.ts:121-129` vs `src/stories.ts:53-77`.
- The registry parse scaffold is duplicated: `src/registry.ts:52-61` vs `src/stories.ts:25-34`
  (both drop bad entries silently — the app side is now fed only by the generator, the
  story side by the hand-managed server registry).
- The app list now has ONE editorial source (`seed/apps.inventory.json`) and a
  generator; `seed/manifestos/` (7) is still a second, OLD-host-only list, and
  `$ProtectedDirs` (8, `deploy-clean.ps1:20-29`) is a deploy-protection list that still
  disagrees with the 12 live apps. `stories.json` remains hand-managed with no source.
- `tools/story_manager/requirements.txt:1` pins `markdown>=3.5` — unbounded.
- `stories/the-long-road.md` is committed but absent from the live `stories.json`.
- **No tests and no CI.** The gate (`npm run build` = generated index + typecheck +
  build) is the whole safety net; `npm run verify:index` is an offline differential for
  the generator alone.

## 7 · Open question

Two publish paths exist and nothing in this repo links them:
`deploy-clean.ps1` publishes to `https://futuremagic.de/<App>/` (root-relative
`path` values in the generated index), while the `apps-publish` skill targets
`https://apps.futuremagic.de/<name>/`. **UNKNOWN which is authoritative for a new
app.** Resolve before writing an app-registration slice. The generator already accepts
either: a record whose `path` is an absolute apps-host URL is enriched from that host
(`docs/21` §8, F2(a)).
