# AGENTS.md — futuremagic

A static hub site: Vite + TypeScript that links out to separate apps, plus a Python
story manager that publishes stories over FTP. 58 tracked files, **no test suite, no
linter, no CI**. Default branch **`master`**.

Everything below is binding for any agent working here. Rules marked
*(inherited)* come from `~/projects/Campaigner` and are kept because they cost
somebody a real incident there; rules marked *(measured here)* were observed on this
box.

The process is `docs/22-DEVELOPMENT-PROCESS.md` (a pointer to Campaigner's portable
doc plus this project's deltas). The record is `docs/20-ORCHESTRATION.md` (the
board). The decisions are `docs/17-DECISION-LEDGER.md` (append-only). The code map
is `docs/18-ARCHITECTURE.md`.

---

## 1 · The gate and the clock

**`bash scripts/gate.sh` is the ONE way to prove a change still builds.** Nobody
hand-rolls `tsc` or `vite build`: the script owns the lock, the log and the verdict.

| exit | means |
|---|---|
| **0** | FULL gate GREEN — `npm run build` (generated app index + typecheck + `vite build`) passed → **verified** |
| **1** | RED — a check failed; the raw log names it |
| **2** | COMPILE tier only — `npm run build` did **NOT** run → **not verified** |
| **3** | plan only — nothing ran |
| **9** | the lock is held by another gate → **refused, and this run is VOID** |

- **"It compiles" is never "it passed."** Exit 2 is not a pass, and quoting it as one
  is the failure this vocabulary exists to prevent. *(inherited)*
- **Never pipe a check through `tail`/`head`.** A pipeline's exit status is the LAST
  command's, so `gate.sh | tail` reports success whatever the gate did — and it
  destroys the failing evidence. Read the log file. *(inherited)*
- **Exit 9 is the lock WORKING**, never a failure: wait and retry.
- **Never reap another actor's processes.** Not a gate's, not another project's.
  *(inherited)* — this box runs other projects in the same account.
- **One expensive check at a time.** Enforced by the lock, never by a glance: two
  actors can look in the same instant, both see "free", and both start. *(inherited)*
- **A killed or refused run is VOID**, never evidence. Re-run it under the lock.
- **The gate is cheap here** — the local `tsc` + `vite build` is ≈250ms; the FULL tier
  additionally runs the index generator, which reads the LOCAL apps root
  (`APPS_ROOT_DIR`, default `$HOME/apps`) as a DIRECTORY and makes **NO network request at
  all** (ledger row 10), so the FULL tier needs no network either. A foreground run is
  acceptable, but prefer a background job with its log kept, and **never run a long check
  in the foreground in the session the owner is talking to.** *(measured here: the owner
  will interrupt.)* The generator writes nothing until every read has succeeded, so a
  missing apps root is a RED gate naming the path, never a silent empty grid. *(was: the
  FULL tier needed the network — the generator used to FETCH the apps host. Ledger row 10
  removed that: `APPS_HOST_BASE` is a URL prefix now, never fetched.)*
- **A subagent runs its checks IN-TURN.** A subagent's background jobs die when its
  turn ends — measured on this box: a probe's background `sleep 240` was gone ~20s
  after the turn ended. "Start it in the background and wait for the notice" works
  ONLY for a session that persists between turns. *(measured here)*

## 2 · Parallel writers

- **One worktree per writer**: `/home/administrator/projects/futuremagic/worktrees/<slice>`,
  gitignored, never `/tmp` *(measured here: in this harness a `/tmp` write can be a
  per-call tmpfs — a worktree created there does not exist for the next call)*.
- **At most TWO writers in flight.** The ceiling is about the machine, not about git.
- **Every path in a brief is ABSOLUTE, stated twice.** Every bash call runs in a fresh
  shell whose cwd is the MAIN tree, and file tools resolve relative paths against that
  same tree — so a writer told to work in a worktree edits the MAIN tree unless its
  paths are absolute. *(inherited: a six-file slice landed in the main tree while its
  own worktree sat clean and commitless.)*
- **File disjointness protects source files and CANNOT protect the docs.** Every
  landing amends the ledger, so the dispatcher assigns the ledger row number at brief
  time. A docs conflict is a mechanical **union**, renumbering your OWN row only; a
  conflict anywhere else means the disjointness check missed something: **STOP and
  report**, do not resolve it. *(inherited)*
- **Cadence contract**: report on **LANDED or BLOCKED, nothing in between.** A clean
  tree with no new commit while a session is running is NORMAL, not stagnation.
- **A writer that cannot finish COMMITS the coherent partial state on its branch** and
  reports BLOCKED. Uncommitted work dies with the session. *(inherited)*
- **Rebase before pushing**, and **push only when the owner asks** (see §6).

## 3 · Host hygiene

- **This box is shared** with other projects (`Campaigner`, `orion`, `Expert`,
  `FracVibe`) in the same user account. Check the load and available memory before
  starting anything heavy; the gate prints both.
- **Treat everything outside this project as someone else's.** Do not edit, clean,
  restart or "fix" another project — including deleting its lock files or reaping its
  processes. Report it instead.
- **Never touch `~/.openclaw`** — it belongs to a different agent platform. Read,
  write, move nothing there. If a task seems to need it, stop and ask.
- **Reuse the shared caches.** `npm`'s cache is global; do not create project-local
  stores or shims.

## 4 · Centralization, and the `COPIES:` line

There is ONE way to do each thing, and `docs/18-ARCHITECTURE.md` names the file that
owns it. Two implementations of the same idea is a defect, not a style choice.

Any landing that adds a second copy of something states it, in its commit message,
as a single line:

    COPIES: <what is duplicated> | <the one that will survive> | <why the duplicate exists>

`COPIES: none` is a valid and expected line. A duplicate with no `COPIES:` line is how
two behaviours start drifting apart. *(inherited)*

## 5 · Critique the instruction

The owner's instructions are **intent, not design**. If the requested mechanism is
wrong, say so **once**, with the evidence, and propose the alternative — then build
what he chooses. If a *brief* is wrong, prove it and report BLOCKED rather than
implementing it. Both have caught real errors. *(inherited)*

## 6 · Deploy — manual, and NOT triggered by a push

**A git push does not deploy.** Verified 2026-09-21: no `.github/` directory, no
workflow, nothing that runs a deploy on push. Deployment is the owner running
`deploy-clean.ps1` from Windows, over **FTP to `ftp.futuremagic.de`**, into
`/webseiten/` on `https://futuremagic.de/`.

Two consequences that bite:

- **`master` is safe to commit and push to** without publishing anything — but push
  only when the owner asks. This whole section is WRONG from the moment any automation
  deploys on push, and gate-then-push applies instead.
- **The deploy protects the app subfolders** (`Expert/`, `LlmTable/`, `ColossusWeb/`,
  `ArmchairGeneral/`, `Conquest/`, `Eco/`, `EccentriCity/`, `stories/`) — those are
  owned by the individual app deploys. Do not "fix" that away.
- **The registry protection is CONDITIONAL, and that condition WAS a hazard — the apps
  half is now fixed BY CONSTRUCTION.** `deploy-clean.ps1:210-215` skips `apps.json` /
  `stories.json` only when the live FTP listing ALREADY CONTAINS them (`$names`, built
  at `:169-173`). There is no longer a tracked `public/apps.json` to ship: it is
  GENERATED by `scripts/generate-app-index.mjs` and gitignored, and written only because
  `:148-150` requires `dist/apps.json` to EXIST. `public/stories.json` is still tracked
  and still EMPTY, so its half of the hazard remains open — see
  `docs/18-ARCHITECTURE.md` §4 hazard 1 and board queue row 18.
- **The hub lists ONLY what is published under `~/apps`.** The generated grid MIRRORS
  the apps root (ledger rows 9 + 11): the cards ARE the app folders, and
  `seed/apps.overlay.json` may DECORATE them with a title and a date **or WITHHOLD a
  card with `hidden: true`** — it can never add a card, and an entry whose folder is not
  an app is DORMANT (no card, reported). Hiding removes the CARD and nothing else: the
  folder stays published and the app stays **SERVED** at its URL, the run NAMES every
  withheld app (`hidden: N [names]`), the hidden app's manifesto is not read (so an
  absent one is not a warning), and deleting the one key — or `hidden: false` — restores
  the card. The overlay accepts ONLY `slug`/`title`/`updatedAt`/`hidden`; an **unknown
  key is FATAL by name** (a typo like `hiden` must never be a silent no-op), as are the
  four forbidden `path`/`manifesto`/`external`/`url`. The old copies stay serviceable but
  UNLISTED, and the old-site registry,
  `scripts/Register-FuturemagicApp.ps1`, `$ProtectedDirs` and `seed/manifestos/` are
  PARK-UNTIL-FORWARD — do not churn them, and do not edit the Windows deploy script for
  the apps half.
- **The hub lives AT the apps root (ledger row 10).** `https://apps.futuremagic.de/` IS
  this hub, so the hub's own `dist/` files (`index.html`, `assets/`, `apps.index.json`,
  `shots/`, `favicon.svg`) sit in the SAME directory as the app folders. Three things
  follow, and none of them is optional:
  - **Discovery reads the LOCAL apps root, never the host.** `scripts/generate-app-index.mjs`
    reads `APPS_ROOT_DIR` (default `$HOME/apps`) as a DIRECTORY, because the host serves a
    directory's `index.html` INSTEAD of its auto-generated listing once that file exists —
    so HTTP discovery would find ZERO apps, write an empty index and still go GREEN (board
    TRAP `hub-at-the-root-blinds-discovery`). The build makes NO HTTP request at all:
    `APPS_HOST_BASE` only PREFIXES each card's public URL.
  - **An app is a top-level DIRECTORY that CONTAINS `index.html`** — exactly what the
    static host requires in order to serve it (symlinks followed: `~/apps/expert` is a
    symlink to a dist). A directory WITHOUT one is not an app and is reported as
    `ignored (no index.html)`, which is a SUMMARY line and NOT a warning — the hub's own
    `assets/` and `shots/` live there and must not warn on every build. A top-level FILE
    is ignored silently. A missing/not-a-directory `APPS_ROOT_DIR` is a RED gate naming
    the path.
  - **Publishing the hub there is `scripts/publish-apps-root.sh`, and it NEVER DELETES.**
    No `rsync --delete`, no `rm`: the app folders in that target belong to their own
    deploys, exactly like the old host's protected subfolders below. It runs
    `npm run build` FIRST (publishing nothing if that fails), refuses a target that does
    not exist or is not a directory, and verifies against the LOCAL origin
    (`http://127.0.0.1:8082/`) that the root serves the HUB rather than a directory
    listing. Rehearse it against a TEMP target; the ONE real install is the dispatcher's act.

## 7 · The record, and where a successor starts

- **`docs/20-ORCHESTRATION.md` is CHECKED, never believed**: `bash scripts/board.sh`
  reconciles every claim against git, the session registry, the lock and the host, and
  its last line says `BOARD RECONCILED` or `BOARD STALE — fix docs/20 before
  dispatching`. A chief-of-staff session runs it FIRST, and fixes the board where it
  lied before dispatching anything. *(inherited)*
- **A discovery lands on the board before it is reported**, so a session death loses
  nothing.
- **A red gate is fixed forward immediately**, before any other change lands — never
  stacked behind another unverified commit.

## 8 · The chief-of-staff role

When the owner designates a session chief of staff, the standing rules in
`~/.dsh/AGENTS.md` §"Chief of staff" apply in full: one frozen goal created and
immediately paused, reconcile before dispatching, ≤2 writers each in its own
worktree, the dispatcher verifies every landing itself (the sha on the remote, its OWN
gate with the raw log, its OWN differential against a named pin), then retire the
writer's session, worktree and branch. Work is driven by wake events only.
