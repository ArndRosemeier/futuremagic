# 22 — The development process (futuremagic)

**This file is a POINTER, not a copy.** The authority for the process is:

    /home/administrator/projects/Campaigner/docs/22-DEVELOPMENT-PROCESS.md

Read that first — it is written to be portable (roles, board vocabulary, the gate
doctrine, verification doctrine, brief template, porting checklist). This file
records only what futuremagic does DIFFERENTLY, plus the brief you copy for a slice.

**Why a pointer and not a copy.** Two copies of a rule set drift, and the one that
gets read is whichever the reader finds first. Campaigner's §5 carries a rule about
exactly this (`COPIES:`), so it would be self-refuting to duplicate 784 lines here.
When Campaigner's doc changes in a way that matters to this project, change the
deltas below in the same landing.

---

## 1 · The local deltas (everything here overrides the reference doc)

| Thing | Campaigner | **futuremagic** | Why |
|---|---|---|---|
| Default branch | `main` | **`master`** | The remote's default is `master`. Every `origin/main` in the reference doc means `origin/master` here. |
| Suite | ~4431 vitest tests, ~12 min | **NONE** | 44 tracked files, two devDeps. There is nothing to chunk, cap or skip. |
| Gate | `scripts/gate.sh`, two tiers, memory watchdog | **`scripts/gate.sh`**, two tiers, no watchdog | Same exit-code vocabulary. The FULL tier runs the deploy's OWN command, `npm run build` = **generated app index + `tsc` + `vite build`** — so the gate covers the generator too. **It is OFFLINE again** (ledger row 10): the generator reads the LOCAL apps root (`APPS_ROOT_DIR`, default `$HOME/apps`) as a directory and makes NO HTTP request, so `APPS_HOST_BASE` is a URL prefix and nothing at all is fetched at build time. A host with no route to `apps.futuremagic.de` builds exactly as well as one with a route. The local compile+bundle is still ~250ms. The header of that script states what is deliberately NOT ported and why. |
| Hub app list | (no equivalent) | **GENERATED at build time** by `scripts/generate-app-index.mjs` from the **LOCAL apps root** (`APPS_ROOT_DIR`, default `$HOME/apps`) — DISCOVERY, the ONLY source of existence — plus `seed/apps.overlay.json` (EDITORIAL decoration `title`/`updatedAt` **or withholding `hidden: true`**), folding each app folder's `futuremagic.json` inline | `docs/21` §8 F1(a), ledger row 7 — reshaped by ledger rows 9, 10 AND 11. The grid MIRRORS the apps root: the cards ARE the app folders, so an overlay entry whose folder is not an app is DORMANT — no card, reported as `dormant overlay entries`. Title precedence is `manifesto.title` > overlay `title` > folder name. **An app is a top-level DIRECTORY that CONTAINS `index.html`** (what the static host requires to serve it; symlinks are followed). A directory WITHOUT one is not an app and is reported as `ignored (no index.html)`, NOT warned about — the hub's own `assets/` and `shots/` live at that root. A missing/not-a-directory `APPS_ROOT_DIR` exits non-zero naming the path. **`hidden: true` WITHHOLDS a published folder's card without touching the app**: the card vanishes, the app stays SERVED at its URL, the run NAMES it (`hidden: N [names]`), its manifesto is NOT read (so its absence is not a warning), and `hidden: false` (or deleting the key) restores the card. The overlay accepts ONLY `slug`/`title`/`updatedAt`/`hidden` — an UNKNOWN key (a typo like `hiden`) is FATAL by name, because a silently-ignored key is how a withdrawal would become a no-op. **NO old-host read AND no HTTP at all**: the generator reads only `APPS_ROOT_DIR` + `APPS_OVERLAY`, and uses `APPS_HOST_BASE` only to build each card's public URL. The browser cannot read the apps host (it sends no `Access-Control-Allow-Origin`), so the read happens in Node at build time and ships same-origin as `public/apps.index.json`. `npm run verify:index` is the offline fixture differential (8 pin families, no server). `scripts/publish-apps-root.sh` is what installs the hub at the root, never deleting anything. |
| The ONE gate command | `scripts/gate.sh` | **`bash scripts/gate.sh`** | Exit 0 GREEN/verified · 1 RED · 2 compile-only/NOT verified · 3 plan-only · 9 lock held (refused, VOID). |
| Package manager | pnpm | **npm** | `package-lock.json` is the committed lockfile; there is no `pnpm-lock.yaml`. `npm ci` reproduces the committed tree exactly and adds no file to the repo. (Host rule prefers the shared pnpm store *for pnpm projects*; introducing pnpm here would mean committing a second lockfile, which is the drift this table exists to prevent.) |
| Worktrees | `<repo>/worktrees/<slice>` | **same** | In-repo, gitignored. Never `/tmp`. |
| Session registry | `--home-administrator-projects-Campaigner--` | **`--home-administrator-projects-futuremagic--`** | Derived from the repo path by `scripts/board.sh`, never hardcoded. |
| Deploy | push to `main` deploys to the live site | **manual, via `deploy-clean.ps1` for the OLD host; `scripts/publish-apps-root.sh` installs the hub AT the apps root; a push does NOT deploy** | See §3. |
| What "LANDED" means | the sha is on `origin/main`, pushed as part of landing | **committed locally AND verified by the dispatcher; PUSHING is a separate, owner-requested act** | `scripts/board.sh` therefore REPORTS an unpushed landing as `on origin/master: NO (local by design)` instead of flagging it stale. In Campaigner the flag is right because every landing pushes; here it would cry stale on every single one. |

---

## 2 · The brief (copy this)

A brief is self-contained: **the writer never sees the dispatcher's conversation.**
Paths are ABSOLUTE. Replace every `<...>`.

```markdown
You are a WRITER on futuremagic (a static hub site: Vite + TypeScript, no test
suite). Read `/home/administrator/projects/futuremagic/AGENTS.md` FIRST — the
binding rules. Then read `docs/18-ARCHITECTURE.md` (the seam index) for the area
you are touching, and `docs/22-DEVELOPMENT-PROCESS.md` §1 for the local deltas.

# Where you work (READ THIS TWICE)
Your worktree is `/home/administrator/projects/futuremagic/worktrees/<slice>` on
branch `<branch>`, based on origin/master = `<sha>`, with `npm ci` already run.
Every bash call runs in a FRESH shell whose working directory is the MAIN tree, and
file tools resolve RELATIVE paths against that same tree — so EVERY read/edit/write/
bash call MUST use an ABSOLUTE path under your worktree (or pass a working
directory). A relative path edits the MAIN tree. Never touch the main tree.
<N> other writer(s) may be in flight; your files are disjoint from theirs.

# Your ledger row: <N>
A DOCS conflict is a mechanical UNION (renumber YOUR row only). A conflict anywhere
else means the disjointness check missed something: STOP and report it.

# The owner's report (verbatim) and the intent
"<paste the owner's words exactly>" — then: the outcome the request is reaching for,
and the MEASURED state of the code today, with `file:line`.

# What to build
One numbered list. Name the ONE seam it extends. State the design decisions already
made (and that you may prove wrong). Name what is deliberately OUT of scope and why.

# Pins
The behaviours that must go red when broken, each phrased as a statement. There is
no test harness in this project yet: if your slice needs one, say so in your report
and use the smallest harness that proves the pin — do not invent a second one.

# Verification (yours)
1. `bash /home/administrator/projects/futuremagic/scripts/gate.sh` — exit 0 is
   GREEN, 1 is RED, 2 is compile-only (NOT a pass), 9 means the lock is held by
   another gate: WAIT and retry, never reap another actor's processes. Keep the raw
   log. NEVER pipe the gate through `tail`/`head` — a pipeline's exit status is the
   LAST command's, so the gate would report success whatever it did.
2. Your own differential where the slice admits one: change the thing, watch the
   pin go red, restore it, watch it go green. Print the file hash of each arm.
3. Commit style: one logical change, imperative subject.
4. If you cannot finish, COMMIT the coherent partial state on your branch and report
   BLOCKED with the reasoning. Uncommitted work dies with your session.

# Docs to amend in the SAME commit
The ledger row, and `docs/18-ARCHITECTURE.md` if a seam moved.

# Your report (short)
LANDED or BLOCKED, then: sha; the gate exit code and its counts; each differential
arm with its printed hash and what went red; judgement calls; docs amended; **and
every way this brief was wrong**. Report NOTHING in between — silence until LANDED
or BLOCKED. If you can PROVE a rule here is wrong (including this brief's own
design), report BLOCKED with the evidence rather than implementing it.
```

Two clauses do the most work: **"the brief may be wrong — prove it and report
BLOCKED"** (it has caught real dispatcher errors) and **"silence until LANDED or
BLOCKED"** (report-churn burns a writer's context for nothing).

---

## 3 · Deploy

**Deployment is MANUAL and is NOT triggered by a git push** — verified 2026-09-21:
this repo has no `.github/workflows`, and the old-host deploy is a PowerShell script
(`deploy-clean.ps1`) run by the owner. So `master` is safe to commit and push to
without publishing anything; publishing is a separate, owner-run act.

The dispatcher's standing rule is therefore: **push only when the owner asks.** A
local commit is the default landing. If this ever changes — a workflow, a hook, an
FTP-on-push — this section is WRONG from that moment and the gate-then-push rule
applies instead.

**There are TWO deploy targets now, and they are independent.**

| Target | How | What it serves |
|---|---|---|
| `https://futuremagic.de/` (the OLD site, FROZEN — ledger row 8) | `deploy-clean.ps1`, PowerShell over FTP, run by the owner on Windows. Cannot run on this host (no `pwsh`, queue row 13). | the old site, with its own protected app subfolders |
| `https://apps.futuremagic.de/` (the hub AT the root — ledger row 10) | `bash scripts/publish-apps-root.sh`, runnable here. Target = `$1`, else `$APPS_ROOT_DIR`, else `$HOME/apps`. | THIS hub: `index.html` + `assets/` + the generated `apps.index.json` |

`scripts/publish-apps-root.sh` runs `npm run build` FIRST and publishes nothing if the
build fails, **NEVER deletes** (the app folders in that target belong to their own
deploys — no `--delete`, no `rm`), refuses a target that does not exist or is not a
directory, and then verifies by fetching the LOCAL origin `http://127.0.0.1:8082/`
(bypassing the CDN, per the `apps-publish` skill) and asserting it returns the HUB
rather than the directory listing it used to be. Exercise it against a TEMP target
first — never against `$HOME/apps` as a rehearsal.
