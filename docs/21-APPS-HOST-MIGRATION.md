# 21 — Migrating the hub's app target to `apps.futuremagic.de` (examination)

Owner's words, verbatim: *"In the long run i want to migrate my apps to apps.futuremagic.de.
This project should switch the target to that URL which resides on a server i directly
control. For now there is not much on that site, but this app should be flexible about
that. The new way to deploy apps is now in the publish skill, so thats the new base for
app discovery. I am not sure if we even need an app registry anymore since the apps will
just be in subfolders. Please examine."*

**This document is an EXAMINATION, not a plan.** It is the answer to "please examine",
with the evidence that produced it. Nothing here is built yet. Every claim was measured on
2026-09-21 by the dispatcher, first-hand.

---

## 1 · What is actually on the new host today (measured)

`https://apps.futuremagic.de/` returns a **public, auto-generated directory listing**
(`<li><a href="expert/">expert@</a></li>`, `<li><a href="fracvibe/">fracvibe@</a></li>`,
plus `README.md`). The `@` is Python's `http.server` symlink marker; the `/` marks
directories. Content: **2 apps** — `expert`, `fracvibe`.

Serving chain (read from this box): `python3 -m http.server 8082 --bind 127.0.0.1
--directory /home/administrator/apps`, spawned by the DSH auth proxy (`server.js`), with
**Cloudflare** in front (`server: cloudflare`). So "a server i directly control" is in fact
**served from this box**, and its whole document root is `~/apps` — where the publish skill
symlinks each app's build output.

The **live hub today links 12 apps** (`/Expert/`, `/LlmTable/`, … fetched from
`https://futuremagic.de/apps.json`), and `https://futuremagic.de/shots/Expert.png` is 200.
So a hard switch to the new host would leave **10 of 12 links pointing at folders that do
not exist there yet.**

## 2 · The CORS blocker — the finding that decides the design

`apps.futuremagic.de` returns **no `Access-Control-Allow-Origin` on any path**, including
when the request carries `Origin: https://futuremagic.de` (tested on `/`, `/expert/`, and
`/expert/futuremagic.json`). Cloudflare passes through the origin's headers, and the origin
is a bare `python -m http.server`, which cannot be configured to send one.

Consequence: **the hub's JavaScript cannot `fetch()` the folder listing or the per-app
manifests from the new host.** Browser CORS forbids it. Folders can be *linked to* and
screenshots can be *displayed* (`<img src>` is not subject to CORS), but **JSON cannot be
read**. So "discover the apps from the subfolders at runtime" is **not possible on the
current host configuration** — and the publish skill's own limits ("static only — no
server-side code, no redirects, no rewrites") mean the app-hosting layer cannot fix it from
inside.

Three ways out, and they are the real fork (see §7): add the header at the host/proxy; move
discovery to **build time** in the hub repo; or keep discovery same-origin and use the folder
listing only as a *check*, never as the runtime source.

## 3 · What a folder name can and cannot tell you

Measured from the **live 12**: every entry carries exactly `slug`, `title`, `path`,
`updatedAt`, `manifesto` — and **no entry uses `url` or `external`** (both are dead in
practice). A directory listing yields only a folder name. So:

| The hub needs | Comes from a folder name? | Evidence |
|---|---|---|
| the app's existence | **YES** | the listing |
| display **title** | **NO** | `Eco` → *"Ecosystem Simulator"*, `GM_Helper` → *"GM Cockpit"*. Editorial, not derivable. 12/12 entries set it. |
| **`updatedAt`** ("Updated …") | **NO** | 12/12 set it; `python -m http.server` listings carry no mtime. |
| **card ORDER** | **NO** | cards render in registry order, not date (`src/main.ts:390-392`). A listing is filesystem/alphabetical order. |
| **`manifesto`** flag | **NO** | 11 true / 1 false (`Civ`); it decides whether the hub even tries to fetch `{path}/futuremagic.json` (`src/registry.ts:113-114`). |
| label, tagline, tags, screenshot | partly | these live in `{app}/futuremagic.json` (`src/types.ts:17-22`) — which travels with the APP, not with the hub. |

## 4 · The publish path does not carry metadata (a gap in the "new base")

The owner calls the publish skill "the new base for app discovery". It publishes **build
output only**. It does not mention `futuremagic.json` or manifestos at all (grepped: no
occurrence). Metadata therefore travels **only if the app's own repo ships it**:
`/home/administrator/projects/Expert/public/futuremagic.json` exists (→ served, 200), while
`FracVibe` has none (→ 404). The hub repo's `seed/manifestos/` (7 files) is a **hub-side
seeding step** for the OLD deploy (`deploy-clean.ps1:261-273`) that has **no equivalent** in
the publish-skill world.

So under the new model: discovery of *folders* works, discovery of *metadata* does not happen
unless each app carries a manifesto — and nothing in the publish path requires one.

## 5 · Two migration defects already visible

1. **Manifestos are not host-portable.** `Expert`'s manifesto says
   `"screenshot": "/shots/Expert.png"` — a **root-absolute** path. On the new host that
   resolves to `https://apps.futuremagic.de/shots/Expert.png` → **404**; on the old host it
   is 200. The publish skill warns about exactly this class of bug for *assets* (step 2); the
   manifesto path has the same exposure and nothing checks it.
2. **The registry and reality already disagree.** The live registry claims
   `manifesto: true` for 11 apps, but only **7** manifestos exist in the hub repo — so 4 apps
   make the hub attempt a fetch that fails, silently, into a console warning
   (`src/registry.ts:68-80`). This predates the migration and will get worse when the
   registry and the folders are on different hosts.

## 6 · Answer to "do we even need an app registry anymore?"

**Yes today — but its job should shrink, and the reason is specific.** The folder listing
replaces the registry's *list of slugs*, and nothing else. The registry is currently the only
**same-origin** (therefore uncensored) carrier of the display title, `updatedAt`, the
editorial order, and the `manifesto` flag. Five of the twelve apps have no manifesto file at
all, so for those the registry title is the *only* title that exists anywhere.

What disappears when the registry goes, if nothing replaces it: **"Ecosystem Simulator"
becomes "Eco", "GM Cockpit" becomes "GM_Helper", every "Updated …" label vanishes, and card
order becomes alphabetical** — plus, on the current host config, nothing can be read at
runtime at all (§2).

The honest successor is not "no registry": it is **a generated index** (build time) plus
**per-app manifestos** (the natural home, already half-adopted), with the folder listing used
as a **check** — an app that exists in `~/apps` but not in the index is a finding to report,
not something to silently include or drop.

## 7 · The fork (owner's decision — options, with one recommendation)

**F1 · How does the hub learn about apps?**
- **(a) Build-time index — RECOMMENDED.** A script in the hub repo reads the host listing
  (and/or the app repos) during `npm run build` and emits `public/apps.json`. No
  infrastructure change, no CORS dependency, works today, and the gate already covers it.
  Cost: a newly published app needs a hub rebuild (today it needs a deploy too, so this is
  not a new class of delay).
- **(b) Add `Access-Control-Allow-Origin` on the apps host** — genuinely possible because the
  owner controls it, and it would allow true runtime discovery *and* cross-origin manifesto
  reads. **Rejected as the first step**, not because it is wrong but because it changes
  shared infrastructure (the `http.server` would have to be replaced by something that emits
  the header, behind a Cloudflare/DSH-proxy chain whose behaviour is UNKNOWN) to buy a
  convenience the hub does not need yet. Worth revisiting if the owner wants a new app to
  appear without a rebuild.
- **(c) Runtime discovery via the listing.** **Impossible as configured** (§2). Not an option
  until (b) happens.

**F2 · How do links move, given only 2 of 12 apps are on the new host?**
- **(a) Per-record base host, migrated app by app — RECOMMENDED.** Each record gets a
  `base`/`host`; the default becomes `https://apps.futuremagic.de/`, and the not-yet-migrated
  apps keep `https://futuremagic.de/`. Nothing breaks while migration proceeds, which is the
  "flexible about that" the owner asked for.
- **(b) Hard switch every link now.** **Rejected on evidence:** 10 of 12 cards would 404, and
  the code has no fallback (a failed link is just a link).

**F3 · What happens to `public/apps.json`'s stale copy?** It is a shadow of live state (3 vs
12) *and* the trigger of the DANGEROUS clobber hazard (board row 7). A generated index makes
it correct by construction and retires the hazard — which is why F1(a) is worth doing even
before the host migration.

## 8 · What the first slice would touch (scope sketch only — NOT yet briefed)

`src/registry.ts` (parse + resolve + the fetch, `:12-48`, `:90-118`), `src/types.ts` (the
record type, `:17-22` + the app type), `src/main.ts` (ordering + card render, `:390-392`),
`public/apps.json` (becomes generated), plus a new generator script and its gate coverage.
No `index.html`, `vite.config.ts` or CSS change is implied. **This is a sketch to size the
work, not a brief** — it is not dispatched until the owner answers F1 and F2.

## 9 · Open questions for the owner

1. **F1** — build-time index (recommended), or do you want CORS added on the apps host so the
   hub can discover at runtime?
2. **F2** — confirm the staged per-record migration (recommended) rather than a hard switch.
3. Do the app repos' `public/futuremagic.json` files become the metadata contract (i.e. the
   publish skill gains a step that checks/creates one), or does the hub's registry stay the
   metadata authority?
4. Is `~/apps` the permanent publish root, or a staging area? The listing is public and
   world-readable, which is why the skill forbids source and secrets there.
