# 20 — Orchestration: the board (futuremagic)

**What is happening right now.** One screen, overwritten in place. A record that no
longer describes the present belongs in `docs/17-DECISION-LEDGER.md` or nowhere.

**This file is CHECKED, never believed.** `bash scripts/board.sh` compares every claim
below against reality — git, the DSH session registry, the gate lock, the host — and
prints `BOARD RECONCILED` or `BOARD STALE — fix docs/20 before dispatching`. A
chief-of-staff session runs it FIRST and fixes the board where it lied BEFORE
dispatching anything.

---

## The contract

- **Writer of the board:** the chief of staff (dispatcher). A WRITER does not edit
  this file — it reports, and the dispatcher records.
- **When:** a discovery lands here before it is REPORTED, so a session death loses
  nothing. A landing lands here when it is verified, with the dispatcher's own
  numbers.
- **Vocabulary:** the records below are one line each with stable prefixes and
  `field=value` pairs, so a query is a `grep` and the answer is a line, not a
  paragraph.
- **A landing is a commit that exists.** A `LANDED` row must name a sha that exists,
  and the dispatcher's `verify=` field must carry ITS OWN numbers, not the writer's.

| Prefix | Means |
|---|---|
| `reconciled:` | the commit everything below was checked against |
| `SESSION` | an actor that may dispatch (id, model, state) |
| `PROBE` | a read-only agent and the question it answers |
| `IN-FLIGHT` | a writer/landing in progress: scope, branch, base, state |
| `LANDED` | a verified landing: sha, the dispatcher's numbers, what was retired |
| `QUEUE` | owner requests and known debt not yet dispatched, with the row reserved |
| `TRAP` | a mistake that ACTUALLY happened, with the rule that prevents it |
| `GUARD` | a mechanism protecting the process, and how to verify it |
| `RECOVERY` | where a successor finds lost context |

---

## Board

```
reconciled: d3f9b92 · 2026-09-21T16:2x+02:00 (session-13ea3b42, chief of staff)

SESSION | cos=session-13ea3b42-847e-4025-97fa-e6aa5b169aba | model=deepseek-flash
  | role=chief of staff (designated by the owner 2026-09-21) | state=active
  | goal=goal-78202b25-87c8-496c-927f-c045e28e585d (created + PAUSED, never re-scoped)
  | session_log_root=/home/administrator/.dsh/sessions/--home-administrator-projects-futuremagic--

HOST | load=8.66/5.17/4.30 | mem_available~16GB of 23GB | disk=7% of 581GB
  | note=Campaigner's FULL gate is IN FLIGHT (pid 1997637, .campaigner-lock, ~12min,
    a peer project in another session). Do NOT reap it, do NOT wait on it. This
    project's gate is sub-second and takes its OWN lock; peer detection is
    diagnostic here by design (AGENTS §1).

PROBE | probe=88f60cd3-2ca7-473b-a099-1eea2b9b8c6b | read-only
  | question="map the architecture, seams, data contracts and deploy path"
  | state=REPORTED, CONSUMED into docs/18-ARCHITECTURE.md §1-§7 and queue rows 7-15,
    and RETIRED (session deleted) as part of this landing
  | note=its report changed the repo under it mid-probe (the machinery was being written
    concurrently) and it correctly reported its own correction. Its load-bearing claims
    were re-verified by the dispatcher: live registries FETCHED (12 apps / 3 stories),
    and deploy-clean.ps1's skip condition read in place. RETIRE after this landing.

PROBE | probe=5e18d0c9-aa0c-4075-b125-3a0201c78e94 | read-only
  | question="how does the hub consume the registry and the per-app manifesto, and what
    breaks if the app list comes from a folder listing on another origin?"
  | state=REPORTED, CONSUMED into docs/21-APPS-HOST-MIGRATION.md (§3 and §7-§9 are its
    findings), into docs/18 §3 (the app-card ORDER seam, which the FIRST probe missed),
    and RETIRED as part of this landing
  | note=it CORRECTED the dispatcher: docs/21's first version claimed app cards render in
    registry order, which was the STORIES ordering (src/main.ts:390-392) misapplied to app
    cards. The real order is featured-then-title (src/registry.ts:138-141). See the TRAP
    below. Its decisive find: the migration is achievable with ZERO source changes.

LANDED | row=2-6 (ledger rows 2-6) | sha=1040796 | branch=master | base=6e9a6e1
  | verify=MY OWN, on the COMMITTED tree and with the COMMITTED script: gate FULL GREEN
    exit 0 (typecheck exit 0; vite build exit 0, 9 modules, 237-284ms; raw log
    .gate-logs/gate-20260921T160416.log) PLUS my own injection of ALL SIX gate exit
    paths -- 0 normal, 9 with the lock held by a LIVE pid, 0 after clearing a STALE
    dead-pid lock, 2 compile tier, 3 plan-only, 1 bad tier -- with the lock ABSENT after
    every run. Also fetched the LIVE registries myself rather than trusting the probe
    (12 apps / 3 stories, vs 3 / 0 in the repo).
  | scope=AGENTS.md, docs/17, docs/18, docs/20, docs/22, scripts/gate.sh, scripts/board.sh,
    .gitignore. NOTHING under src/ or public/ is touched (verified: `git status --porcelain
    -- src public index.html package.json` returned 0 lines).
  | push=NO -- a local landing by design (AGENTS §6). The owner has not asked for a push,
    and a push publishes nothing anyway.
  | retired=nothing to retire but the PROBE session (records above); no worktree and no
    writer branch exist for this landing, because the dispatcher was its own writer.
  | note=the gate's FIRST version swallowed its own summary by exiting from inside a
    redirected brace group (TRAP gate-summary-swallowed); it was fixed forward BEFORE the
    commit, so 1040796 contains the fixed script and the numbers above are a run of it.
    This board and `scripts/board.sh` were then corrected once more in the commit following
    this record, because Campaigner's "landed = pushed" check would have flagged this
    landing stale on every future local landing here.

VERIFY | sha=5fa6a23 (docs-only delta from the gated tip 1040796)
  | Gate FULL GREEN exit 0 on the FINAL tree: typecheck exit 0, vite build exit 0. Raw
    log .gate-logs/gate-20260921T160623.log. A docs-only commit does not re-run the
    suite; this one was run anyway because it costs ~1s, which makes the final tree's
    state a MEASUREMENT rather than an inference.

QUEUE | row=7 | needs=dispatch | SEVERITY=DANGEROUS
  | Registry clobber. deploy-clean.ps1:210-215 skips apps.json/stories.json only when the
    live FTP listing already has them ($names, :169-173). Against a -RemotePath with no
    registry, the repo's STALE public/apps.json (3 apps) and EMPTY public/stories.json
    ship as live. Live today = 12 apps / 3 stories (fetched 2026-09-21).
  | fix direction=make the absence of a remote registry a LOUD STOP (or require an
    explicit -AllowRegistrySeed), never a silent seed from a stale shadow.

QUEUE | row=8 | needs=dispatch
  | Register-FuturemagicApp.ps1:170-190 re-stamps `manifesto` from LOCAL file presence, so
    omitting -ManifestoLocalPath silently flips manifesto:true -> false and the app's
    tagline/tags/shot vanish from the hub (src/registry.ts:113-114).

QUEUE | row=9 | needs=dispatch
  | FOUR hand-maintained lists that disagree: public/apps.json (3), seed/manifestos/ (7),
    $ProtectedDirs (8, deploy-clean.ps1:20-29), live (12). $ProtectedDirs is missing
    GM_Helper, Campaigner, BlasterMaster, Civ, Orion. NOT destructive (the script never
    deletes directories) but their manifestos are never refreshed and the FTP-root check
    at :179-190 warns misleadingly. fix direction=ONE source, generated.

QUEUE | row=10 | needs=dispatch
  | scripts/capture-app-shots.mjs cannot run: imports `playwright` (undeclared,
    package.json:11-14) and hardcodes 3 targets (:8-21) for 7 committed shots.

QUEUE | row=11 | needs=dispatch
  | Duplication debt for the COPIES: rule -- escapeHtml (src/main.ts:15-21 +
    src/storyReader.ts:14-20), isRecord (src/registry.ts:8-10 + src/stories.ts:3-5),
    date formatting (registry.ts:144-152 vs stories.ts:53-77), registry parse scaffold
    (registry.ts:39-48 vs stories.ts:25-34).

QUEUE | row=12 | needs=OWNER | blocks=any app-registration slice
  | UNKNOWN which publish host is authoritative: deploy-clean.ps1 publishes to
    https://futuremagic.de/<App>/ (root-relative paths in apps.json) while the
    `apps-publish` skill targets https://apps.futuremagic.de/<name>/. Nothing in this repo
    links them. docs/18 §7.

QUEUE | row=13 | needs=OWNER
  | The whole publish path is Windows-only (deploy-clean.ps1, Story manager.bat, and
    C:\Projekte\FutureMagic paths in the READMEs) and THIS HOST HAS NO pwsh/powershell
    (verified). So a change to either publisher cannot be end-to-end verified here -- only
    its syntax and its logic can be read. Decide: keep Windows-only, or port the publish
    path to something runnable here.

QUEUE | row=14 | needs=OWNER
  | ~/projects/.gitignore (180 B, a bare `/*` ignore rule) is vestigial after the marker
    repo was removed (ledger row 1) and would silently ignore everything if anyone runs
    `git init` in ~/projects. Left in place deliberately; say the word to delete it.

QUEUE | row=15 | needs=OWNER
  | NO test suite and NO CI anywhere. scripts/gate.sh (typecheck + vite build) is the
    ENTIRE safety net, so a behaviour regression that still compiles is invisible. Decide
    whether the hub earns a test harness; if yes, that harness is itself a slice and
    docs/08-TESTING.md gets created by it.

QUEUE | row=16 | needs=OWNER | blocks=the apps-host migration (docs/21)
  | Switch the hub's app target to https://apps.futuremagic.de/ and make the publish skill
    the discovery base. EXAMINED, not dispatched: docs/21-APPS-HOST-MIGRATION.md.
  | MEASURED: the new host serves a public folder listing with 2 apps (expert, fracvibe)
    while the hub links 12; and it sends NO Access-Control-Allow-Origin, so the hub cannot
    read the listing or the manifests at runtime. The registry's LIST role is replaceable;
    its METADATA role (title, updatedAt, order, enrichment) is not.
  | RECOMMENDED: F1(a) a GENERATED same-origin index (build-time discovery from the host's
    folders + enrichment folded in) and F2(a) staged per-record migration, which needs ZERO
    source changes (`path` is used verbatim as href, src/registry.ts:87) but costs the
    migrated app its tagline/tags/screenshot until F1 lands.
  | REJECTED: a hard switch (10 of 12 links 404 silently) and runtime listing discovery
    (impossible without ACAO on the apps host).
  | WAITING ON: the owner answering F1 and F2 (docs/21 §8), plus the metadata-contract and
    ~/apps-permanence questions in §10.

TRAP | gate-summary-swallowed | MEASURED 2026-09-21, self-inflicted
  | The first scripts/gate.sh ran its body inside a `{ ... } > "$LOG"` group. `exit`
    inside that group exits the WHOLE script, so the run returned a CORRECT exit code
    (0) with NO summary and NO LOGFILE line -- the operator saw a verdict with no
    evidence. RULE: the gate body is a FUNCTION and uses `return`; a redirected brace
    group with `exit` in it silently skips everything after it.

TRAP | protection-asserted-from-a-variable-name | MEASURED 2026-09-21, self-inflicted
  | The dispatcher wrote into AGENTS.md §6 that the deploy "deliberately protects the
    registry files", reading the `$ProtectedRegistryFiles` name and the
    "(keeping existing remote ...)" message. The actual condition is `$names -contains
    $reg` -- protection ONLY when the remote file already exists. RULE: read the
    CONDITION, not the variable's name; a plausible reading is not evidence.

TRAP | tmp-worktree | INHERITED
  | A worktree created in /tmp may not exist for the next call in this harness. RULE:
    worktrees live at <repo>/worktrees/<slice>, gitignored.

TRAP | gate-piped-through-tail | INHERITED
  | `gate.sh | tail` returned SUCCESS whatever the gate did (the pipeline's status is the
    last command's) and destroyed the failing evidence. RULE: read the log file.

TRAP | relative-path-edits-the-main-tree | INHERITED
  | File tools resolve RELATIVE paths against the MAIN tree, so a writer's slice landed
    there while its own worktree sat clean. RULE: every path in a brief is ABSOLUTE.

TRAP | gate-output-piped-through-grep | MEASURED 2026-09-21, self-inflicted
  | While reporting, the dispatcher ran `bash scripts/gate.sh | grep -E ...` to trim the
    output -- the exact anti-pattern AGENTS §1 forbids, because a pipeline's exit status
    is the LAST command's, so that invocation reported GREP's success, not the gate's.
    The true exit was then captured by re-running the gate unpiped (exit 0). RULE: the
    gate's raw output goes to its log and the log is what gets read; never filter the
    gate itself, not even for display.

TRAP | stories-order-applied-to-app-cards | MEASURED 2026-09-21, self-inflicted
  | docs/21's first version asserted app cards render in "registry order, not date" and
    cited src/main.ts:390-392. That citation is the STORIES list ordering; the app-card
    order is featured-then-title at src/registry.ts:138-141. The claim was not invented --
    it was a TRUE fact about a DIFFERENT list, carried across. RULE: before reusing a
    finding, re-read the line it came from and confirm it is about the thing you are
    describing. A neighbouring fact is the easiest wrong fact to believe.

GUARD | gate-lock | mkdir-based, path=<main>/.futuremagic-lock derived from the git COMMON
  dir so every worktree shares ONE lock; owner file names pid/time/worktree/tier; a DEAD
  pid is cleared and announced; the trap removes only a lock it OWNS.
  | VERIFIED 2026-09-21 by the dispatcher, all six paths: 0 normal GREEN, 9 with the lock
    held by a live pid, 0 after clearing a STALE (dead-pid) lock, 2 compile tier,
    3 plan-only, 1 bad tier. Lock absent after every run.

GUARD | board-reconciler | scripts/board.sh, read-only, takes no lock, exit 2 if it
  CANNOT LOOK. VERIFY: `bash scripts/board.sh` must end in BOARD RECONCILED.

GUARD | machinery-ignored | .gitignore covers worktrees/, .gate-logs/, .futuremagic-lock/.

RECOVERY | start here
  | 1. `bash scripts/board.sh` -- if it says BOARD STALE, fix this file first.
  | 2. AGENTS.md (binding rules) -> docs/22 §1 (the local deltas vs Campaigner).
  | 3. docs/18-ARCHITECTURE.md (the seam index) before touching any code.
  | 4. docs/17-DECISION-LEDGER.md row 2 records why this machinery exists.
  | The probe's full report is CONSUMED: docs/18 §1-§7 and queue rows 7-15 carry every
  | finding with a file:line, so a successor does not need the probe's transcript.
```

---

## Guard: why this board has teeth

The records above are not a summary of a conversation — `scripts/board.sh` fails them
against the filesystem, and the two TRAP entries about the dispatcher's OWN errors are
here because a masked symptom is how a process rots: a correct exit code with no
evidence, and a protection asserted from the shape of a variable name.
