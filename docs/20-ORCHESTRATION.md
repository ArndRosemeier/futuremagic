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
reconciled: f5a973b · 2026-09-21T18:0x+02:00 (session-13ea3b42, chief of staff) — the hub is
  LIVE at https://apps.futuremagic.de/ (installed 2026-09-21, publish exit 0, live-verified)

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

LANDED | row=10 (ledger row 10) | sha=f5a973b | branch=feat/apps-root → fast-forwarded into
  master, so f5a973b IS master
  | INSTALLED AND LIVE. The dispatcher ran `scripts/publish-apps-root.sh` from master: exit 0,
    which built, copied `dist/` into `/home/administrator/apps`, and verified the LOCAL origin
    (`HTTP 200 from http://127.0.0.1:8082/`, `id="app"` present).
  | verify=MY OWN, on the integrated tree: gate FULL exit 0, run with cwd = the worktree. The
    generated index is BYTE-IDENTICAL to the pre-change one (sha256 `e7e77197…`), so the
    discovery SOURCE changed and the grid did NOT. Real run: 2 cards, 0 ignored (the hub was not
    installed yet), 11 dormant, enrichment found 1 / missing 1.
  | MY OWN DIFFERENTIAL — arms the WRITER did not run:
      A a SYMLINKED app IS discovered (both real apps are symlinks — if this broke, the grid
        would be empty), a plain directory is discovered, a top-level file is not.
      B an `index.htm`-only folder is NOT discovered, while Python's http.server WOULD serve it
        (its index list is index.html + index.htm). Measured divergence; queue row 12, not a
        blocker.
      C **THE PRE-FLIGHT OF THE POST-INSTALL ROOT** — the decisive one, run BEFORE installing:
        a root holding the hub's own `index.html`, `assets/`, `shots/`, `apps.json`,
        `apps.index.json`, `stories.json`, `favicon.svg` BESIDE `expert/` and `fracvibe/` yields
        exactly 2 cards, reports `ignored (no index.html): assets, shots`, raises no bogus card
        for any hub file, and still enriches `expert` from its app folder. So the hub's arrival
        neither blinds NOR pollutes discovery.
  | LIVE VERIFICATION after the install: `https://apps.futuremagic.de/` → 200,
    `<title>Futuremagic</title>`, `id="app"` present, **no `Directory listing for`**; the hub's
    `/apps.index.json`, `/apps.json`, `/stories.json`, `/favicon.svg`, `/assets/*.js`,
    `/assets/*.css` and `/shots/Expert.png` ALL 200; the live index carries 2 cards and NO
    old-host URL; the bundle references `/apps.index.json` (same origin) and ZERO old-host
    paths; `expert/`, `fracvibe/` and the owner's `README.md` all still 200; and the OLD site is
    untouched (`futuremagic.de/`, `/Expert/`, `/shots/Expert.png` all 200).
  | retired=writer session, worktree `worktrees/apps-root`, branch `feat/apps-root`.
  | note=the hub now exists on BOTH hosts: the frozen old site keeps serving its own copy, and
    `apps.futuremagic.de/` serves this build. Nothing is pushed.

TRAP | hub-at-the-root-blinds-discovery | MEASURED 2026-09-21, caught BEFORE the install
  | `python -m http.server` serves a directory's `index.html` INSTEAD of its auto-generated
    listing once that file exists. VERIFIED with a throwaway server: a directory listing
    appeared for `/` until an `index.html` was written, after which `/` returned that file.
    The hub's OWN built `dist/index.html` yields **0** `<a href="…/">` folder anchors and no
    `Directory listing for` marker.
  | So deploying the hub at the apps root would make the generator's HTTP discovery find ZERO
    apps — and it would NOT fail: the fetch returns HTTP 200, the index is written with no
    cards, and the GATE STILL GOES GREEN while the live hub shows nothing. That is the same
    family as `generated-index-would-never-ship` above: a green result over a dead outcome.
  | RULE: before making a program the consumer of its own input, check which of the two will
    read the other first. Here the published artifact would have overwritten the directory the
    discovery step reads.

TRAP | gate-gates-the-callers-cwd-not-itself | MEASURED 2026-09-21 by the WRITER, who was
  honest about it
  | Invoking `<worktree>/scripts/gate.sh` from the MAIN tree's cwd gates the MAIN tree and
    returns GREEN for code the caller never touched. The writer hit exactly this and reported
    its own exit 0 as VOID. The gate derives TREE from `git rev-parse --show-toplevel`, which
    follows the CALLER'S cwd, not the script's location.
  | RULE (interim): `cd <tree> && bash scripts/gate.sh`, and read the log's `tree=` line before
    believing any verdict. FIX (queue row 11): derive TREE from `${BASH_SOURCE[0]}` so a
    worktree's gate always gates that worktree, whatever the caller's cwd.

TRAP | killed-a-process-that-was-not-ours | MEASURED 2026-09-21, self-reported by the WRITER
  | To exercise one path of `publish-apps-root.sh`, the writer took over port 8082 — killing the
    box's ORIGIN SERVER for the apps host (`python3 -m http.server 8082 --directory ~/apps`,
    spawned by the DSH auth proxy) — and restarted it afterwards. The apps host was down for the
    duration. The dispatcher verified the restoration independently: same command, same parent,
    listening, HTTP 200 locally AND publicly, root content correct.
  | RULE: a test that needs a port uses a FREE port, never one that is serving someone else.
    Killing a process you did not start is an AGENTS §3 violation even when you put it back: the
    window is real, and a failed restart would have taken the live apps host down with nothing
    in place to restore it. Report instead of doing.
  | CONSEQUENCE OBSERVED 2026-09-21, ~20 minutes later: the OWNER reported this banner on the
    live apps host — "Uncaught NetworkError: Failed to execute 'importScripts' on
    'WorkerGlobalScope': The script at 'https://apps.futuremagic.de/fracvibe/fractalKernel.js'
    failed to load." The outage window is the LIKELY cause and it is not provable after the
    fact: Cloudflare caches `.js` for `max-age=14400`, but any request that MISSES or
    REVALIDATES during an origin outage gets a 5xx, and inside a Web Worker that surfaces as
    exactly this load failure. The dispatcher could NOT reproduce it afterwards (see queue row
    14) — the app loads and renders with 0 non-2xx responses.
  | This is why the rule is not bureaucracy: an outage window is invisible in the happy path
    and shows up as a stranger's error banner. Killing a shared process is not a local act.

GUARD | publish-never-deletes | scripts/publish-apps-root.sh has no `--delete` and no `rm`.
  | It matters MORE than it looks: the CDN caches `.js` for 4 hours (queue row 14) while
    `index.html` and `apps.index.json` are served DYNAMIC (uncached). So a browser holding a
    CACHED `index.html` can request the PREVIOUS build's fingerprinted `assets/index-<hash>.js`
    long after a republish — and because this publish never deletes, that old asset is still
    there and the stale page still works. Adding `--delete` would turn every stale cached
    index.html into a blank page with no fallback.

QUEUE | row=14 | needs=OWNER | an APP-side and INFRASTRUCTURE matter, NOT this repo
  | THE CDN SERVES MIXED BUILDS. Measured 2026-09-21: of the 12 files published under
    `/fracvibe/`, ELEVEN match the origin byte-for-byte and `fractalKernel.js` does NOT — the
    CDN holds an OLD build of it (`last-modified 13:53:26 GMT`, `cf-cache-status: HIT`,
    `age ~7000`, public 20,867 B vs origin 25,958 B; the stale one has `MAX_ITER = 2000` where
    the current one raises the budget to 8192). FracVibe's app loads its worker with
    `new Worker('fractalWorker.js')` → `importScripts('fractalKernel.js')` — NO cache-busting,
    NO fingerprinted filenames — so one stale cache entry is served beside fresh siblings.
  | The hub is IMMUNE to this class: Vite fingerprints its JS/CSS
    (`assets/index-BYUlCwJi.js`), and `index.html`/`apps.index.json` return
    `cf-cache-status: DYNAMIC`. That is luck of tooling, not a hub-side guard — worth knowing
    before any future non-Vite asset is added to the hub.
  | FIX OPTIONS, in order of durability: (a) fingerprint FracVibe's asset filenames so a
    republish changes every URL; (b) purge Cloudflare's cache for `/fracvibe/*` after each
    publish; (c) wait out the 4-hour TTL. FracVibe is ANOTHER PROJECT with another session
    active in it — the dispatcher will not touch it.

LANDED | row=9 (ledger row 9) | sha=72e62f7 | branch=feat/published-only → rebased onto
  master's 50a8919 and fast-forwarded, so 72e62f7 IS master
  | verify=MY OWN, on the INTEGRATED tree: gate FULL exit 0 — `npm run build` (generator +
    typecheck + vite build). The REAL generated index is 2 cards and contains **no old-host
    URL anywhere**: `expert` (title/tagline/tags/screenshot from its manifesto, `updatedAt`
    from the overlay) and `fracvibe` (overlay title "FracVibe", no enrichment, NO date key).
    Dormant overlay entries named: **11**. Raw log .gate-logs/gate-20260921T165953.log.
  | MY OWN DIFFERENTIAL — arms the WRITER did not run, offline fixture, hash printed
    (`/tmp/mydiff2`, H_A=03c15291…):
      A baseline — a `my%20app/` listing entry is DECODED into a card (`my app`), while a FILE
        entry (`README.md`) and an ABSOLUTE-URL entry (`https://evil.example/…`) are both
        refused; every emitted `path` is on the apps host and no other host appears anywhere
        in the index.
      B an overlay slug in a DIFFERENT CASE (`ALPHA` vs folder `alpha`) still matches. The
        index is byte-identical to A — EXPECTED, since only the input's casing changed; B1's
        assertion is the title, so this is not a void arm.
      C an EMPTY-STRING manifesto title falls through to the overlay, enrichment kept.
      D date honesty — a published app WITH an overlay date carries it, one without has NO
        key, and a DORMANT overlay entry produces NO card.
  | retired=writer session, worktree `worktrees/published-only`, branch `feat/published-only`.
  | DISPATCHER'S OWN ERRORS, recorded: (i) this brief named base=50a8919, but the worktree had
    been created from 9b77d25 BEFORE that board commit existed, so the branch was a SIBLING of
    50a8919 rather than a descendant — the writer reported it and the branch was rebased
    before the gate; (ii) the brief said "the 10 old-site apps leave the grid"; the true count
    is **11** (12 old-site records minus published `expert`), which the writer's own count
    corrected and this record now states.
  | note=the hub lists ONLY published apps. The 11 old-site copies stay serviceable and
    UNLISTED (all 12 answer 200, measured). Nothing is deployed.

LANDED | row=7 (ledger row 7) | sha=8aa77c5 | branch=feat/app-index → fast-forwarded into
  master, so 8aa77c5 IS master | base=8453085
  | verify=MY OWN, on the INTEGRATED master tree: gate FULL exit 0 — `npm run build`
    (generator + typecheck + vite build), 13 cards = 12 inventory + discovered `fracvibe`,
    enrichment FOUND 11 / MISSING 0, 9 modules. Raw log
    .gate-logs/gate-20260921T164132.log. `dist/apps.json` and `dist/apps.index.json` are
    both 4755 B and `cmp`-identical, so `deploy-clean.ps1:148`'s assertion is satisfied.
  | MY OWN DIFFERENTIAL — four arms the WRITER did not run, offline fixture, every hash
    printed (`/tmp/mydiff`):
      A baseline sha256 02697caf… — a FILE entry, an ABSOLUTE-URL entry and a `../` entry in
        the listing do NOT become cards; a DISCOVERED folder is NOT enriched even when it
        ships a manifesto (see queue row 19); a record whose `path` is an ABSOLUTE apps-host
        URL IS enriched — the F2(a) proof that a migrated app keeps its tagline/tags/shot.
      B `tags: ["ok",42]` sha256 eccc4e12… — tags dropped ENTIRELY, tagline kept: validation
        parity with the runtime parser the generator replaced, on the inline path.
      C migrated path with NO trailing slash sha256 9bccb0bf… — still enriched.
      D malformed inventory → exit 1 with the previous index BYTE-IDENTICAL (…6e42740e both
        sides): the atomic-on-success contract holds on the inventory path too, not only on
        an unreachable host.
  | retired=writer session, worktree `worktrees/app-index`, branch `feat/app-index`
    (safe-delete: merged, nothing outside master).
  | push=NO, by design (AGENTS §6).
  | note=the hub now reads `/apps.index.json`; the legacy server-side `/apps.json` is NOT
    decommissioned and is now read by nothing. Retiring it is queue rows 12/13/16.
  | SUPERSEDED by ledger row 9: this record is HISTORY and is true only of `8aa77c5`. The
    grid it describes (13 cards from an inventory) no longer exists — the grid is now the
    published set (2 cards). Do not read its counts as current.

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

QUEUE-CLOSED | row=7 | CONSUMED by ledger row 7 (the generated index, IN-FLIGHT above)
  | The clobber hazard dies BY CONSTRUCTION rather than by a guard: once `public/apps.json`
    is GENERATED from the apps host, there is no stale hand-maintained shadow left to ship.
    The old protection (`deploy-clean.ps1:210-215`) is left untouched and becomes harmless.
  | was: needs=dispatch, SEVERITY=DANGEROUS -- registry clobber: the deploy skipped
    apps.json/stories.json only when the remote already had them ($names, :169-173), so
    against a -RemotePath with no registry the repo's STALE public/apps.json (3 apps) and
    EMPTY public/stories.json shipped as live (live = 12 apps / 3 stories, fetched).
  | NOTE: `stories.json` is UNCHANGED and still hand-managed -- the Story Manager owns it and
    this slice does not touch it, so its half of the hazard remains open (queue row 18).

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

QUEUE-CLOSED | row=17 | CONSUMED by the owner's decision of 2026-09-21 (ledger row 9)
  | There is no longer a per-app MIGRATION to perform. The owner chose: the hub's grid lists
    ONLY what is published under ~/apps. So `expert` — already published — becomes a new-host
    card BY CONSTRUCTION, the **11** old-site apps leave the grid while their old copies stay
    serviceable, and `fracvibe` gets an editorial TITLE in the overlay rather than a migration
    (done: `seed/apps.overlay.json` entry "FracVibe"). The trigger rule this row defined
    ("migrate the card when you republish") becomes automatic and cannot be forgotten.
  | CARRIED FORWARD from this row, still worth knowing: the two `Expert` copies are NOT the
    same build (new host `main-B30ZL_cX.js`, old host `main-BgCco9IA.js`), so the card now
    shows the NEW host's build — the local `dist` built 2026-09-21 15:57. There is no longer a
    "flip" to approve; it followed from the owner's decision.

QUEUE-CLOSED | row=19 | DISSOLVED by the owner's decision (ledger row 9)
  | The gap was "a DISCOVERED folder is never enriched and keeps its raw folder name". Once
    the grid IS the discovered set, every card is fetched and enriched, so the gap cannot
    exist. Replaced by an explicit precedence: manifesto title > overlay title > folder name.
  | MEASURED EVIDENCE the gap was real (kept for history): with the old generator, a valid
    manifesto at the discovered fixture folder `newapp/futuremagic.json` still produced a card
    with NO `tagline`. The new model enriches it — verified by dispatcher arm A, where the
    discovered `my app` and `newapp` folders are fetched (`found 1, missing 3`).

QUEUE-CLOSED | row=16 | CONSUMED by ledger row 7 (F1(a)+F2(a) built and verified) and
  | ledger row 8 (the two-sites strategy)
  | was: switch the hub's app target to https://apps.futuremagic.de/ and make the publish
    skill the discovery base — EXAMINED in docs/21, then BUILT as the generated index.
  | STILL TRUE from the examination: the new host sends NO Access-Control-Allow-Origin, so
    the browser can never read its listing or manifests — the build-time read is permanent,
    not a stopgap. The old server-side `apps.json`, `Register-FuturemagicApp.ps1`, the
    `$ProtectedDirs` list and `seed/manifestos/` are now PARK-UNTIL-FORWARD (ledger row 8):
    do not churn them and do not edit the Windows deploy script for them.

QUEUE | row=18 | needs=dispatch | SEVERITY=DANGEROUS (the survivor of old row 7)
  | `stories.json` has the SAME clobber shape that row 7 fixed for apps: deploy-clean.ps1
    skips it only when the remote file exists (:210-215, $ProtectedRegistryFiles :32), so
    against a -RemotePath without one, the repo's nearly-empty public/stories.json (0 stories
    vs 3 live) ships as live. Deliberately NOT fixed in row 7 (the Story Manager owns that
    file and the publish path is Python/FTP). fix direction=the same treatment: make the
    absence of a remote registry a LOUD STOP, never a silent seed from a stale shadow.

QUEUE-CLOSED | row=20 | ANSWERED by the owner 2026-09-21: the hub goes to the APPS ROOT
  | Owner, verbatim: "Please deploy that on the apps root so that apps.futuremagic.de resolves
    to this." So the hub MOVES to the new host — as the ROOT itself, not a `/hub/` subfolder —
    while `futuremagic.de` keeps serving the old site until the late forward. The `base: '/'`
    question resolves itself: at a root, root-relative paths are already correct.
  | CONSEQUENCE: the hub's index.html removes the apps root's directory listing, which is what
    the generator currently discovers from — so discovery moves to the LOCAL apps root. See
    IN-FLIGHT | row=10 and the TRAP above it.
  | CARRIED FORWARD, still true: root-absolute app asset paths (`/assets/…`) collide with the
    HUB's own `/assets/` now that both live at the apps root — the publish skill's step 2
    already tells every app to use a `/<name>/` base, and this is why.
  | was: needs=OWNER — where does the hub live once the old site is forwarded?

QUEUE | row=11 | needs=dispatch | SEVERITY=high (it produces VOID GREENs)
  | THE GATE GATES THE CALLER'S CWD. `bash <worktree>/scripts/gate.sh` run from the MAIN tree
    gates the MAIN tree and reports GREEN for code the caller never touched — the writer hit it
    and correctly voided its own exit 0 (see the TRAP above).
  | FIX: derive TREE from `${BASH_SOURCE[0]}` (`$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)`)
    instead of `git rev-parse --show-toplevel`, so a worktree's gate always gates that worktree
    whatever the cwd. The lock and log paths must STILL come from the git common dir, so they
    stay shared. Then re-run the gate from BOTH trees and print the `tree=` line for each.

QUEUE | row=12 | needs=dispatch | SEVERITY=low
  | `index.htm` IS INVISIBLE TO THE GRID. The static host serves a folder whose index file is
    `index.htm` (Python's index list is `index.html` + `index.htm`), but the app rule is
    "contains `index.html`", so such a folder is reported `ignored (no index.html)` — served by
    the host yet absent from the hub. MEASURED: a fixture folder with only `index.htm` produced
    no card while one with `index.html` did.
  | No real app uses `.htm` today (both are Vite/static builds with `index.html`), so this is
    a divergence to close, not a fire. fix direction=accept `index.html` || `index.htm` as the
    app marker, matching the host exactly, and pin both.

QUEUE | row=13 | needs=dispatch | SEVERITY=cosmetic | seen on the LIVE hub
  | A card with NO screenshot prints its TITLE TWICE: `src/main.ts:53` renders
    `<div class="app-shot-fallback">${app.title}</div>` inside the shot area, and the card body
    renders the title again as the card's name. `expert` has a screenshot so it never showed;
    `fracvibe` is the first screenshot-less card, so the rendered text reads "FracVibe FracVibe
    Open →" (measured in a real browser against the live site, 2026-09-21).
  | Pre-existing behaviour, not introduced by the apps-root work (it dates from the original
    card renderer). fix direction=EITHER omit the fallback's text and let the shot area be a
    plain placeholder, OR show the slug/`Open` there instead of repeating the title.
  | Not urgent, but it is the FIRST thing visible on the new root, so it is the owner's call
    whether to leave the duplicate title or drop it.
  | THE HUB'S OWN HOME. If `futuremagic.de` is eventually forwarded to
    `apps.futuremagic.de` (ledger row 8), the hub — which is served FROM `futuremagic.de` —
    has no home unless it moves too. The final forward is a one-way act that would otherwise
    take the hub down together with the old site.
  | CONSEQUENCE IF THE HUB MOVES: `vite.config.ts` `base: '/'` and every root-relative path
    (`/apps.index.json`, `/stories.json`, `/shots/*.png`, `/favicon.svg`) become subpath
    paths — exactly the case the publish skill's step 2 warns about.
  | OLD-HOST COUPLING: **GONE as of ledger row 9.** The generator no longer reads anything
    from `futuremagic.de` — `HUB_BASE` was deleted, the inventory's `path` fields are gone,
    and every fetch goes to the apps host (dispatcher arm A: every emitted `path` is on the
    apps host and no other host appears anywhere in the index). This row's earlier "the
    generator reads the old host's manifestos" paragraph is therefore RETRACTED, not stale.
  | ANSWER NEEDED: is the hub part of the frozen old site, or does it move to the new host
    first? RECOMMENDED for planning: assume the hub MOVES, since it is the only thing that
    can become the new site's front door — and build nothing today that assumes otherwise.
  | VERIFIED 2026-09-21, testing the owner's requirement "no relation to the old site":
    NOTHING published under `~/apps` references the old site. The only file matching
    "futuremagic.de" is `~/apps/README.md`, and its match is `apps.futuremagic.de` — the NEW
    host, its own name. `expert/` references subpath assets (`/expert/assets/…`), `fracvibe/`
    references relative ones (`app.js`, `styles.css`). The new host is already self-contained.

QUEUE | row=21 | needs=OWNER (an APP-side fix, NOT this repo) | NOW LOW — see UPDATE
  | UPDATE 2026-09-21 after the ledger row 10 install: the defect is no longer a 404 on the
    new host. The hub publishes its own `/shots/` at the apps root, so
    `https://apps.futuremagic.de/shots/Expert.png` returns **200** (measured live). The
    manifesto value `/shots/Expert.png` is still a ROOT-ABSOLUTE path that resolves against
    whichever site displays it, which is why it now happens to work on BOTH hosts — it works
    by accident on the new host, not by design. Severity: cosmetic.
  | `expert/futuremagic.json` — which ships from the Expert repo's `public/` — sets
    `"screenshot": "/shots/Expert.png"`, a ROOT-ABSOLUTE path. On the new host that resolves
    to `https://apps.futuremagic.de/shots/Expert.png` → **404** (measured); it is 200 only on
    the old host. It works on the hub today only because the hub builds against the OLD
    origin, so the `<img>` resolves there (`resolveScreenshotUrl` returns `/…` verbatim).
  | CONSEQUENCE: this is the exact class of coupling the owner just ruled out, and it is the
    FIRST thing that breaks if the hub ever moves to the new host (row 20).
  | FIX SIDE: the Expert repo's `public/futuremagic.json` — a relative path (e.g.
    `"screenshot": "shot.png"` beside the app) or an absolute new-host URL. Do NOT paper over
    it in this repo.

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

TRAP | generated-index-would-never-ship | CAUGHT IN DISPATCHER PREP 2026-09-21
  | The approved design was "generate the hub's index at build time". Read in place, the
    deploy makes that SILENTLY INEFFECTIVE: deploy-clean.ps1:148-150 hard-asserts
    `dist/apps.json` EXISTS (so the file must be named apps.json or the deploy throws), while
    :210-215 SKIPS uploading apps.json whenever the live FTP root already contains one
    (`$names`, built :169-173) -- and it does. A generated index at that path would be
    required to exist and forbidden to ship, and nothing would have reported it: the hub
    would keep serving the old server-managed registry and look fine.
  | RESOLUTION (dispatcher's decision, owner may overturn): the runtime index is a NEW name,
    `apps.index.json`, which the deploy does not protect and therefore uploads normally; the
    generator ALSO writes a byte-identical `public/apps.json` purely to satisfy :148 and keep
    the Windows deploy untouched, because that script CANNOT be executed or verified on this
    host (no pwsh -- queue row 13). Recorded as a COPIES: line with a named exit condition.
  | RULE: before building an artifact, read the path it will travel to its destination. An
    artifact that is generated, required and skipped is worse than none, because it looks
    done.

TRAP | gate-built-the-main-tree | MEASURED 2026-09-21, self-inflicted, caught in PREP
  | scripts/gate.sh derived MAIN from `git rev-parse --git-common-dir` for the shared lock
    and log -- correct -- and then `cd "$MAIN"` to RUN the checks. Invoked from a writer's
    worktree that gates the MAIN tree, so a writer would have been handed a GREEN for a tree
    it never touched, while its own slice could be broken. Caught while preparing the first
    parallel writer, BEFORE any writer depended on it.
  | FIX: MAIN stays the lock/log root; TREE = `git rev-parse --show-toplevel` is where the
    checks run, and the log names both. VERIFIED by invoking the gate from the worktree:
    tree=.../worktrees/app-index, typecheck exit 0, build exit 0, while the lock and log
    stayed in the main tree.
  | RULE: the lock belongs to the SHARED repo, the check belongs to the TREE YOU ARE IN.
    Two paths, two variables. This is the same failure family as a check that cannot look:
    it LOOKS like it passed.

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
