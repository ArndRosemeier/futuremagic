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
| Gate | `scripts/gate.sh`, two tiers, memory watchdog | **`scripts/gate.sh`**, two tiers, no watchdog | Same exit-code vocabulary. The FULL tier runs the deploy's OWN command, `npm run build` = **generated app index + `tsc` + `vite build`** — so the gate covers the generator too. It is no longer purely offline: the generator fetches `apps.futuremagic.de` + `futuremagic.de`, so an unreachable host is a RED gate (the generator writes nothing until every fetch succeeds). The local compile+bundle is still ~250ms. The header of that script states what is deliberately NOT ported and why. |
| Hub app list | (no equivalent) | **GENERATED at build time** by `scripts/generate-app-index.mjs` from `seed/apps.inventory.json` (editorial) + the apps host's folder listing (discovery), folding each app's `futuremagic.json` inline | `docs/21` §8 F1(a), ledger row 7. The browser cannot read the apps host (it sends no `Access-Control-Allow-Origin`), so the read happens in Node at build time and ships same-origin as `public/apps.index.json`. `npm run verify:index` is the offline fixture differential (5 pins). |
| The ONE gate command | `scripts/gate.sh` | **`bash scripts/gate.sh`** | Exit 0 GREEN/verified · 1 RED · 2 compile-only/NOT verified · 3 plan-only · 9 lock held (refused, VOID). |
| Package manager | pnpm | **npm** | `package-lock.json` is the committed lockfile; there is no `pnpm-lock.yaml`. `npm ci` reproduces the committed tree exactly and adds no file to the repo. (Host rule prefers the shared pnpm store *for pnpm projects*; introducing pnpm here would mean committing a second lockfile, which is the drift this table exists to prevent.) |
| Worktrees | `<repo>/worktrees/<slice>` | **same** | In-repo, gitignored. Never `/tmp`. |
| Session registry | `--home-administrator-projects-Campaigner--` | **`--home-administrator-projects-futuremagic--`** | Derived from the repo path by `scripts/board.sh`, never hardcoded. |
| Deploy | push to `main` deploys to the live site | **manual, via `deploy-clean.ps1`; a push does NOT deploy** | See §3. |
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
this repo has no `.github/workflows`, and the deploy is a PowerShell script
(`deploy-clean.ps1`) run by the owner. So `master` is safe to commit and push to
without publishing anything; publishing is a separate, owner-run act.

The dispatcher's standing rule is therefore: **push only when the owner asks.** A
local commit is the default landing. If this ever changes — a workflow, a hook, an
FTP-on-push — this section is WRONG from that moment and the gate-then-push rule
applies instead.
