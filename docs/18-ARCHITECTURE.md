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

**The single most important fact about this codebase:** the hub's content is
**runtime data, not source.** The browser fetches `/apps.json` and `/stories.json`
from the site root and enriches each app from `{path}/futuremagic.json`
(`src/registry.ts:104-118`, `src/stories.ts:36-43`). The copies in `public/` are
therefore **shadows**, and they are STALE — see §5. Editing `public/apps.json` does
not change the live hub.

## 2 · Layer map

| Layer | Path | Role | ~lines |
|---|---|---|---|
| entry/build | `package.json` | npm scripts + devDeps (`build` = `tsc && vite build`) | 15 |
| | `vite.config.ts` | `base: '/'`, `outDir: dist` | 9 |
| | `tsconfig.json` | strict, `noEmit`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` | 21 |
| | `index.html` | Vite entry, `#app` | 23 |
| hub UI | `src/main.ts` | shell + app/story rendering | 452 |
| | `src/styles.css` | all styling | 1184 |
| | `src/registry.ts` | apps: fetch, parse, resolve screenshot | 152 |
| | `src/stories.ts` | stories: fetch, parse | 77 |
| | `src/storyReader.ts` | TOC, scroll-spy highlight, resume | 375 |
| | `src/vibe.ts` | canvas backdrop + agents | 399 |
| | `src/orbitBrand.ts` | brand animation | 204 |
| | `src/types.ts` | shared types | 46 |
| data (shadows) | `public/apps.json` | **stale** — 3 apps vs 12 live | 23 |
| | `public/stories.json` | **empty** — 0 vs 3 live | 4 |
| | `public/shots/*.png` | 7 screenshots | — |
| content pipeline | `seed/manifestos/*.json` | 7 manifestos, one per app folder | 6 each |
| | `stories/*.md` + `stories/README.md` | story source | 33 + 30 |
| | `tools/story_manager/*.py` | Python FTP story publisher | 732 total |
| | `Story manager.bat` | Windows launcher | 30 |
| deploy | `deploy-clean.ps1` | manual hub deploy over FTP | 283 |
| | `scripts/Register-FuturemagicApp.ps1` | app deploy calls this to upsert remote `apps.json` | 242 |
| | `scripts/capture-app-shots.mjs` | screenshot capture (**broken**, §4) | 45 |

## 3 · The seams — the ONE way to do X

| The one way to do X | Owns it | Gotchas |
|---|---|---|
| **Add an app to the hub** | `scripts/Register-FuturemagicApp.ps1:102-204` — upserts the **remote** `/webseiten/apps.json` from the app's own deploy | Editing `public/apps.json` does NOT ship it (`deploy-clean.ps1:210-215` skips a registry the remote already has). The app's folder must also be listed in `$ProtectedDirs` (`deploy-clean.ps1:20-29`) or the hub deploy will not protect it. |
| **Parse an app record** | `parseRegistryApp` `src/registry.ts:12-37`, `parseRegistry` `:39-48` | Required strings: `slug`, `title`, `path`, `updatedAt` (`:18-25`). Optional: `external`, `url`, `manifesto`. **Invalid entries are SILENTLY DROPPED** (`:43-45`) — no schema, no build-time check. `url` is read **only when `external === true`** (`:84`), and no live record sets either. `path` is used **verbatim** as the `href` (`:87`) and is NOT required to be root-relative — which is what makes a cross-host record a data-only change (`docs/21` §8). |
| **Order the app cards** | `src/registry.ts:138-141` | **`featured` first, then `title.localeCompare`** — NOT registry order, and NOT date. `featured` is **derived**, never stored and never displayed: manifesto present AND (tagline OR tags OR screenshot) (`:119-123`). So renaming an app reorders the grid, and losing its manifesto un-features it. (The stories list DOES order by registry order — `src/main.ts:390-392` — which is a different list; conflating the two was a real dispatcher error, board TRAP.) |
| **Decide what is on a card** | `src/types.ts:17-22` (manifesto shape), `src/registry.ts:127,131-132` (resolution) | The manifesto OVERRIDES the registry title (`:127`); tagline/tags/screenshot exist ONLY there (`:54-61`). A missing manifesto is a **silent** `console.warn` + `null` (`:72-80`) while a broken `/apps.json` is a **visible** error (`src/main.ts:288-292`) — the two failure modes are deliberately different and should stay that way. |
| **Resolve an app's image** | `resolveScreenshotUrl` `src/registry.ts:90-101` | There is NO icon field; only `screenshot` (`src/types.ts:21`). An absolute `/…` or `http(s)://…` is used verbatim; anything else is appended to the app's `href` (`:97-100`). Missing image → console warn + text fallback (`src/main.ts:277-287`). |
| **Capture screenshots** | `scripts/capture-app-shots.mjs` | **BROKEN:** imports `playwright`, which is not a dependency (`package.json:11-14`), and hardcodes 3 targets (`:8-21`) for 7 committed shots. |
| **List / render stories; TOC; highlight** | `loadStories` `src/stories.ts:36-43` → `renderStoriesList` `src/main.ts:376-410` → `mountStoryReader` `src/storyReader.ts:169-374` | TOC is built from `h1`–`h6` (`:63-65,75-106`) with slugified, deduped ids (`:86`, `:32-41`). Highlight = a reading line 22% from the top; the spy locks ~700ms after a TOC click (`:280-289,326-334`). Order is registry order, NOT date (`src/main.ts:390-392`). |
| **Publish a story** | `tools/story_manager/app.py` → `parse_story_file` (`markdown_story.py:71-98`) → `publish_selected` (`app.py:317-362`) | Slug = filename stem (`:79,31-35`); `date` defaults to today; `title` falls back to the first H1, then the filename (`:81-83`). Uploads `stories/<slug>.html` and rewrites the **remote** `stories.json` (`:338-352`). Windows-only launcher. |
| **Author a manifesto** | `seed/manifestos/<AppFolder>.json` → synced to `{App}/futuremagic.json` by `deploy-clean.ps1:261-273`, or uploaded via Register `:207-240` | The filename must EXACTLY match a `$ProtectedDirs` entry (`:264-265`) or it is silently skipped. The hub fetches it only when `external !== true && manifesto !== false` (`src/registry.ts:113-114`). |
| **Build the site** | `package.json:8` — `npm run build` | `= tsc && vite build`. Requires `npm ci` first: `node_modules/` is not committed. |
| **Deploy the hub** | `deploy-clean.ps1` (manual, PowerShell, FTP) | See §5. |
| **Register an app after its own deploy** | `scripts/Register-FuturemagicApp.ps1` | See the downgrade hazard in §4. |

## 4 · Data contracts, and the hazards

**`apps.json`** — root `{version, apps[]}`; `apps` is REQUIRED or the load throws
(`src/registry.ts:40-42`), `version` defaults to 1 (`:46`).

**`stories.json`** — root `{version, stories[]}`; `stories` REQUIRED
(`src/stories.ts:26-28`). Entry: required `slug`/`title`/`date`/`path` (`:9-20`),
optional `excerpt` defaulting to `""` (`:21`), invalid entries dropped silently
(`:31`). The Python writer is STRICTER than the reader — it raises `ValueError` on a
missing required field (`tools/story_manager/registry.py:24-30`) — so the two ends
disagree about what a valid record is.

**`{path}/futuremagic.json`** (manifesto) — ALL fields optional (`src/types.ts:17-22`):
`title`, `tagline`, `tags` (kept only if every element is a string,
`src/registry.ts:55-60`), `screenshot`. Unknown keys are ignored; a missing file is a
console warn + `null` (`:68-80`) and the card degrades to the `apps.json` title,
unfeatured (`:119-134,138-141`).

### Hazards (real, with evidence — these are QUEUE items on the board)

1. **Registry clobber against a non-existent remote registry.**
   `deploy-clean.ps1:210-215` skips `apps.json`/`stories.json` **only if the live FTP
   listing already contains them** (`$names`, built at `:169-173` from
   `List-FtpDirectoryDetails $RemotePath`). Point the script at a `-RemotePath` whose
   registry is absent and the repo's stale `public/apps.json` (3 apps) and empty
   `public/stories.json` ship as the live registry.
2. **Registration downgrade.** `Register-FuturemagicApp.ps1:170-190` re-stamps
   `manifesto` from local file presence, so omitting `-ManifestoLocalPath` silently
   flips a `manifesto: true` app to `false` and its tagline/tags/shot disappear from
   the hub (`src/registry.ts:113-114`).
3. **`$ProtectedDirs` is stale.** 8 names (`deploy-clean.ps1:20-29`) against 12 live
   apps: `GM_Helper`, `Campaigner`, `BlasterMaster`, `Civ`, `Orion` are missing. NOT
   destructive (the script never deletes a directory), but the FTP-root verification
   at `:179-190` warns misleadingly and those apps' manifestos are never refreshed.
4. **Windows-only toolchain.** `deploy-clean.ps1` (PowerShell/.NET), `Story
   manager.bat` (`%~dp0`, backslashes), and docs paths like `C:\Projekte\FutureMagic`
   (`tools/story_manager/README.md:8`, `stories/README.md:6`). **This box has no
   `pwsh` or `powershell`** — so neither the hub deploy nor the story publish can run
   here as written. A change to either cannot be end-to-end verified on this host.

## 5 · The registries are stale — measured 2026-09-21

| Registry | In the repo | LIVE at futuremagic.de | Delta |
|---|---|---|---|
| `apps.json` | 3 apps | **12 apps** | missing `GM_Helper`, `Campaigner`, `BlasterMaster`, `Civ`, `Orion`, and others |
| `stories.json` | 0 stories | **3 stories** | `the-last-letter-at-dunmore-pier`, `abundance`, `the-dragon-kept-the-receipt` |

Live slugs: `Expert, LlmTable, ColossusWeb, ArmchairGeneral, Conquest, Eco,
EccentriCity, GM_Helper, Campaigner, BlasterMaster, Civ, Orion`.

**This is by design, not rot:** the registries are owned by the server (app deploys
and the Story Manager write them), which is exactly why `deploy-clean.ps1` tries to
skip them. The stale repo copies exist because `dist/` must contain *something* for
the build and for a fresh host. **Anyone treating `public/apps.json` as the source of
truth about what is live is reading a shadow** — fetch `https://futuremagic.de/apps.json`.

## 6 · Known debt

- `escapeHtml` duplicated: `src/main.ts:15-21` and `src/storyReader.ts:14-20`.
- `isRecord` duplicated: `src/registry.ts:8-10` and `src/stories.ts:3-5`.
- Date formatting implemented twice: `src/registry.ts:144-152` vs `src/stories.ts:53-77`.
- The registry parse scaffold is duplicated: `src/registry.ts:39-48` vs `src/stories.ts:25-34`
  (both drop bad entries silently).
- Three hand-maintained lists that disagree: `public/apps.json` (3),
  `seed/manifestos/` (7), `$ProtectedDirs` (8), live (12). **No single source.**
- `tools/story_manager/requirements.txt:1` pins `markdown>=3.5` — unbounded.
- `stories/the-long-road.md` is committed but absent from the live `stories.json`.
- **No tests and no CI.** The gate (typecheck + build) is the whole safety net.

## 7 · Open question

Two publish paths exist and nothing in this repo links them:
`deploy-clean.ps1` publishes to `https://futuremagic.de/<App>/` (root-relative
`path` values in `apps.json`), while the `apps-publish` skill targets
`https://apps.futuremagic.de/<name>/`. **UNKNOWN which is authoritative for a new
app.** Resolve before writing an app-registration slice.
