# 21 — Migrating the hub's app target to `apps.futuremagic.de` (examination)

> **SUPERSEDED BY ledger row 9** — the grid now MIRRORS `apps.futuremagic.de` (only what is published under `~/apps`), the old-site inventory became a decoration-only overlay, and the old host is never read; the findings below stand as history, not as the built state.

Owner's words, verbatim: *"In the long run i want to migrate my apps to apps.futuremagic.de.
This project should switch the target to that URL which resides on a server i directly
control. For now there is not much on that site, but this app should be flexible about
that. The new way to deploy apps is now in the publish skill, so thats the new base for
app discovery. I am not sure if we even need an app registry anymore since the apps will
just be in subfolders. Please examine."*

**This is an EXAMINATION, not a plan.** Nothing here is built. Every claim was measured
first-hand on 2026-09-21 (live fetches) or read from the code with `file:line`.

> **Correction of record.** The first version of this document claimed app cards render in
> *registry order, not date*. That was WRONG — it was the **stories** list ordering
> (`src/main.ts:390-392`) misapplied to app cards. The app-card order is measured in §3.
> The error is recorded as a TRAP on the board rather than quietly patched.

---

## 1 · What is on the new host today (measured)

`https://apps.futuremagic.de/` serves a **public auto-generated directory listing**
(`<li><a href="expert/">expert@</a></li>`, `<li><a href="fracvibe/">fracvibe@</a></li>`,
`README.md`). The `@` is Python's `http.server` symlink marker; `/` marks directories.
It contains **2 apps**, and `https://apps.futuremagic.de/nosuchapp/` → 404 (no SPA
fallback, as the skill warns).

Serving chain (read from this box): `python3 -m http.server 8082 --bind 127.0.0.1
--directory /home/administrator/apps`, spawned by the DSH auth proxy, with **Cloudflare**
in front. So "a server i directly control" is served from **this box**, and its document
root is `~/apps` — where the publish skill symlinks each app's `dist/`.

The **live hub links 12 apps** (fetched from `https://futuremagic.de/apps.json`) and
`https://futuremagic.de/shots/Expert.png` is 200. A hard switch therefore leaves **10 of 12
links pointing at folders that do not exist on the new host**, and a dead href has no error
path — the card simply 404s when clicked.

## 2 · The CORS blocker — the finding that decides the design

`apps.futuremagic.de` returns **no `Access-Control-Allow-Origin` on any path**, including
when the request carries `Origin: https://futuremagic.de` (tested on `/`, `/expert/`, and
`/expert/futuremagic.json`). Cloudflare passes the origin's headers through, and the origin
is a bare `python -m http.server`, which cannot be made to send one.

Consequence: **the hub's JavaScript cannot `fetch()` the folder listing or the per-app
manifests from the new host.** Navigation (`<a href>`) is exempt from CORS, so *links* work;
`<img>` display is exempt, so *pictures* would render; but **JSON cannot be read at all.**

So "discover the apps from the subfolders at runtime" is **not possible on the current host
configuration** — and the publish skill's own limits ("static only — no server-side code, no
redirects, no rewrites") mean the app-hosting layer cannot fix it from inside.

## 3 · What the hub actually shows, and where each piece comes from

Measured from the code and the live 12. Every live record carries exactly `slug`, `title`,
`path`, `updatedAt`, `manifesto`; **no live record sets `url` or `external`**, though the
code does read `url` when `external === true` (`src/registry.ts:84`).

| What the card shows | Source | If absent |
|---|---|---|
| existence | the registry (or a folder listing) | — |
| **display title** | `apps.json.title`, overridden by `futuremagic.json.title` (`src/registry.ts:127`) → `src/main.ts:62` | record is **silently dropped** (`:43-45`) |
| **"Updated …"** | `apps.json.updatedAt` → `formatUpdatedAt` (`:144-152`) → `src/main.ts:35-39` | unparseable → an **empty `<span>`**, card kept (`:146`) |
| tagline / tags | `futuremagic.json` only (`src/types.ts:18-19`) → `src/main.ts:25-34` | element omitted, card shorter |
| screenshot | `futuremagic.json.screenshot` → `resolveScreenshotUrl` (`:90-101`) → `<img>` `src/main.ts:41-49` | text fallback; **layout unchanged** (fixed 16/10 box, `src/styles.css:498-505`) |
| **card ORDER** | **`featured` first, then `title.localeCompare`** (`src/registry.ts:138-141`) | — |
| `featured` (never displayed, drives order only) | **derived**: manifesto present AND (tagline OR tags OR screenshot) (`src/registry.ts:119-123`) | not featured |

**So order is a derived function of the title and of the manifesto**, not a stored list
position — and neither input is available from a folder name (§4). `manifesto: false` (live:
`Civ`) does not hide an app; it only suppresses enrichment, which un-features it.

## 4 · What a folder listing cannot supply

A listing gives a folder name and the symlink bit — **no dates** (raw HTML measured).
Therefore not derivable:

- **Display title.** Live proof of divergence: folders `GM_Helper`, `Eco`, `Civ`,
  `BlasterMaster` vs titles *GM Cockpit*, *Ecosystem Simulator*, *CivTS*, *Blaster Master*.
- **`updatedAt`.** Required by the parser (`src/registry.ts:17,21-25`); the listing has no
  date. Synthesizing one from mtime is indistinguishable from a real date — a fabricated
  fact, not a fallback.
- **Order / featured** (§3) — depends on title and manifesto presence.
- **tagline, tags, screenshot** — live only in `{path}futuremagic.json`, which a listing
  does not name.
- The **base/host** for a link: folders are lowercase (`expert`), the registry's `path` is
  not in the listing at all.

And the listing is not a clean app list: every `<li><a>` becomes a candidate, **including
files** (`README.md` is in it today), and **nothing in `src/` filters files from directories
or reads the `@` symlink marker.** There is also no discovery code at all — `src/registry.ts:103-142`
is the only loader and it fetches a JSON registry.

## 5 · The publish path does not carry metadata (a gap in the "new base")

The publish skill publishes **build output only** and never mentions `futuremagic.json`
(grepped: no occurrence). Metadata travels **only if the app's own repo ships it**:
`projects/Expert/public/futuremagic.json` exists (→ 200 on the host); `FracVibe` has none
(→ 404). The hub repo's `seed/manifestos/` (7 files) is a **hub-side seeding step** for the
OLD deploy (`deploy-clean.ps1:261-273`) with **no equivalent** in the publish-skill world.

## 6 · Defects already visible

1. **Manifestos are not host-portable.** `Expert`'s says `"screenshot": "/shots/Expert.png"` —
   root-absolute. On the new host that is **404**; on the old host 200. The publish skill
   warns about this for *assets* (step 2); the manifesto has the same exposure and nothing
   checks it.
2. **CORRECTED 2026-09-21 — this entry was WRONG when written.** It claimed the registry
   contradicts reality because it sets `manifesto: true` for 11 apps while "only 7
   manifestos exist", leaving 4 silent fetch failures. That was a confusion of two
   different sets: **7** is the count in this repo's `seed/manifestos/` (the hub-side
   seeding step for the OLD deploy), not what the live host serves. Measured by the
   generator on 2026-09-21: the live host returns a valid manifesto for **all 11** apps
   that claim one — **found 11, missing 0**. There was no silent failure to fix, and the
   generator's 404 path (which IS real for a newly published app like `fracvibe`) is
   exercised only by the offline fixture. The wrong number reached a writer brief before
   it was caught by the writer's own measurement.

Note the asymmetry in failure modes: a broken `/apps.json` is a **visible** error
(`src/main.ts:288-292`), a broken manifesto is **silent**, and a dead app link is silent too.

## 7 · The answer: yes, and the move makes the registry MORE load-bearing

**The folder listing replaces the registry's *list of slugs* and nothing else.** Because the
host sends no ACAO, the registry is the hub's **only same-origin** carrier of everything
else the cards show beyond an app's existence. Deleting it and discovering at runtime is
impossible as configured (§2), and **even with CORS added** you would still lose the title,
the "Updated" label and the order — none of which a listing carries (§4).

So the honest successor is not "no registry" but **a GENERATED one**: a script reads the
host's folder listing (that is the *discovery* the owner wants) and each app's manifesto
(*enrichment*), and writes the hub's own same-origin index. Hand-maintenance ends; subfolders
genuinely become the base; CORS stops mattering because the browser only ever reads the hub's
own origin.

The trade to state plainly: a generated index is produced by a **build**, so a newly published
app appears when the hub is rebuilt and redeployed (today the live `apps.json` is a
server-side file protected from overwrite, so an app can appear without a hub deploy). That
is the price of dropping the cross-origin dependency.

## 8 · The forks (owner's decision, one recommendation each)

**F1 · How does the hub learn about apps?**
- **(a) Generated same-origin index — RECOMMENDED.** Discovery from the host's folders, at
  build time; enrichment folded into the hub's own index. No infrastructure change, no CORS
  dependency, and it makes the stale `public/apps.json` correct by construction (retiring
  board row 7's clobber hazard).
- **(b) Add `Access-Control-Allow-Origin` on the apps host.** Genuinely possible since the
  owner controls it — but the origin is a bare `python -m http.server` that would have to be
  replaced (or fronted by something that injects the header) behind a
  Cloudflare/DSH-proxy chain whose behaviour is **UNKNOWN**. Buys runtime discovery; still
  does not supply `updatedAt` or the editorial title. Rejected as the first step.
- **(c) Runtime discovery from the listing.** Impossible as configured (§2).

**F2 · How do the links move, given 2 of 12 apps are on the new host?**
- **(a) Staged, per record — RECOMMENDED.** And the probe proved this needs **ZERO source
  changes**: `path` is used verbatim as the href (`src/registry.ts:87`) and is not required to
  be root-relative, so a record may carry `"path": "https://apps.futuremagic.de/expert/"`.
  Pair it with `"manifesto": false`, because `fetchManifesto` would otherwise go cross-origin
  and be blocked (`:113-116`). Migrated apps keep working links and **lose only their
  tagline/tags/screenshot** until F1(a) or F1(b) lands.
- **(b) Hard switch every link now.** **Rejected on evidence:** 10 of 12 cards 404, silently.

**F3 · The stale `public/apps.json`** (3 apps vs 12 live) is both a shadow and board row 7's
DANGEROUS clobber trigger. A generated index fixes it by construction.

## 9 · Scope sketch (NOT a brief — nothing is dispatched until F1/F2 are answered)

- Under F1(a): a generator script + `public/apps.json` becoming generated + a gate step. The
  rendering code may need **no change at all** if the generated index keeps today's shape.
- If enrichment must come from the new host *without* a generated index, the smallest code
  change is 1 file, 2 expressions: `src/registry.ts:84-86` (let a non-empty `url` win) and
  `:113-116` (fetch the manifesto from `href`, not `path`) — **and it still needs CORS**,
  which is absent. Listing-discovery loses fields and costs strictly more than that edit.

## 10 · Open questions for the owner

1. **F1** — generated same-origin index (recommended), or replace the apps host's server to
   add CORS and discover at runtime?
2. **F2** — confirm staged per-record migration (recommended; zero source changes) rather
   than a hard switch.
3. **Metadata contract** — should the hub's index become the authority for
   tagline/tags/screenshot (making each app's `futuremagic.json` optional), or should the
   publish workflow require every app to ship one?
4. Is `~/apps` the permanent publish root or staging? The listing is public and
   world-readable, which is why the skill forbids source and secrets there.
