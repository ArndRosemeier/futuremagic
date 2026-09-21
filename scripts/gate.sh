#!/usr/bin/env bash
# THE gate for futuremagic — the ONE way to prove a change still builds.
#
# Established 2026-09-21 when the chief-of-staff role was assumed for this project
# and the project had no process machinery at all (no AGENTS.md, no board, no gate,
# no test suite). Ported from ~/projects/Campaigner/docs/22-DEVELOPMENT-PROCESS.md
# §7 and §13. Read that document before changing this script.
#
# WHAT THIS PROJECT'S GATE ACTUALLY IS, AND WHY IT IS NOT CAMPAIGNER'S
#   futuremagic has NO test suite and NO linter (44 tracked files, two devDeps:
#   typescript + vite). So the gate cannot be a suite: it is exactly the thing the
#   deploy runs, which is `package.json`'s build script = `tsc && vite build`.
#   Two tiers, because they answer two different questions:
#
#     0 = FULL gate GREEN       typecheck + vite build both passed → VERIFIED.
#     1 = RED                   a check failed. The raw log names it.
#     2 = COMPILE tier only     typecheck passed, `vite build` did NOT run →
#                               NOT VERIFIED. Never report this as "the gate passed".
#     3 = plan only             nothing ran (GATE_PLAN_ONLY=1). Not a result at all.
#     9 = lock held             another gate owns the lock → REFUSED and VOID.
#                               Wait and retry. Never reap the other actor's processes.
#
#   The compile tier is fast and deliberately CANNOT be quoted as a pass: a build
#   touching index.html, public/ or vite.config.ts can typecheck and still not build.
#
# WHAT IS DELIBERATELY *NOT* PORTED, AND WHY (do not "fix" these by copying
# Campaigner — they are load-bearing there and dead weight here)
#   * NO memory watchdog and NO chunking. Campaigner's 3000MB cap and two-chunk
#     ceiling exist because its vitest suite is ~12 minutes and grows off-heap to
#     multiple GB. This gate is one `tsc` plus one `vite build` on a 44-file site:
#     MEASURED 2026-09-21 at ~1s total (build 284ms). A watchdog here would be
#     ceremony protecting nothing.
#   * Peer-suite detection is DIAGNOSTIC, not a refusal. Campaigner REFUSES to start
#     while a peer project's suite runs, because asking the box for 12 more minutes
#     of multi-GB RAM next to another suite is how the box dies. A sub-second build
#     is not that, and refusing on it would stall this project behind an unrelated
#     12-minute run for no benefit. If this project ever grows a suite, this becomes
#     a refusal.
#   * NO diff-scoped skipping. There is nothing to skip. When a suite exists, the
#     mapping rule (docs/22 §7 item 6) applies: only a docs-only diff may skip the
#     suite, and every other diff runs everything.
#
# THE CLOCK (docs/22 §"The clock and the gate", owner-ratified)
#   The gate is CHEAP here, so a foreground run is acceptable — but prefer a
#   background job, and keep the raw log.
#   NEVER pipe this script through `tail`/`head`: a pipeline returns the exit status
#   of the LAST command, so `gate.sh | tail` reports success whatever the gate did,
#   and it destroys the failing evidence. Read the log file.
#
# Usage:
#   scripts/gate.sh                      # FULL gate: tsc + vite build      (exit 0)
#   GATE_TIER=compile scripts/gate.sh    # typecheck only                   (exit 2)
#   GATE_PLAN_ONLY=1 scripts/gate.sh     # print what would run, run nothing (exit 3)
#
# Env:
#   GATE_TIER      full (default) | compile
#   GATE_PLAN_ONLY 1 = print the plan and exit 3 without running anything
#   GATE_LOCK      default <main-repo>/.futuremagic-lock — the ONE gate lock, on a
#                  path shared by every shell AND every worktree. A $PWD-relative
#                  lock would give each worktree its own and exclude nothing.
#   GATE_LOGDIR    default <main-repo>/.gate-logs — IN THE WORKSPACE, never /tmp,
#                  so a background run's evidence outlives the process.
set -uo pipefail

# --- where is the MAIN tree (not the worktree we may have been called from) ----
# `git rev-parse --git-common-dir` resolves to the main tree's .git even from a
# linked worktree, so both the lock and the log dir are the same path everywhere.
_common="$(git rev-parse --git-common-dir 2>/dev/null)"
if [ -z "$_common" ]; then
  echo "gate.sh: not inside a git work tree — refusing to guess a lock path" >&2
  exit 1
fi
MAIN="$(cd "$(dirname "$_common")" && pwd)"

LOCK="${GATE_LOCK:-$MAIN/.futuremagic-lock}"
LOGDIR="${GATE_LOGDIR:-$MAIN/.gate-logs}"
TIER="${GATE_TIER:-full}"

case "$TIER" in
  full|compile) ;;
  *) echo "gate.sh: GATE_TIER must be 'full' or 'compile', got '$TIER'" >&2; exit 1 ;;
esac

mkdir -p "$LOGDIR"
STAMP="$(date +%Y%m%dT%H%M%S)"
LOG="$LOGDIR/gate-$STAMP.log"
ln -sfn "$(basename "$LOG")" "$LOGDIR/gate-latest.txt" 2>/dev/null || true

# --- plan-only mode: reviewable without running anything ----------------------
if [ "${GATE_PLAN_ONLY:-0}" = "1" ]; then
  echo "=== GATE PLAN (plan-only: NOTHING RAN) ==="
  echo "tier          = $TIER"
  echo "main tree     = $MAIN"
  echo "lock          = $LOCK"
  echo "log           = $LOG"
  echo "package mgr   = npm (package-lock.json is the committed lockfile)"
  echo "full tier     = npm run build   (= tsc && vite build)"
  echo "compile tier  = npx tsc --noEmit"
  echo "exit 0 = GREEN(verified) · 1 = RED · 2 = compile-only(not verified) · 3 = plan · 9 = lock held"
  exit 3
fi

# --- the atomic lock: mkdir succeeds or it does not ---------------------------
# NOT a pgrep snapshot: two actors can look in the same instant, both see "free",
# and both start. mkdir is atomic, so exactly one wins.
acquire_lock() {
  if mkdir "$LOCK" 2>/dev/null; then
    printf 'pid=%s\ntime=%s\nworktree=%s\ntier=%s\n' "$$" "$(date -Is)" "$PWD" "$TIER" > "$LOCK/owner"
    return 0
  fi
  # Held. Is the holder alive, or is this a stale lock from a killed run?
  local owner_pid
  owner_pid="$(sed -n 's/^pid=//p' "$LOCK/owner" 2>/dev/null | head -1)"
  if [ -n "$owner_pid" ] && kill -0 "$owner_pid" 2>/dev/null; then
    return 1
  fi
  # No live holder. Campaigner removes a >30min lock; a dead pid is strictly
  # better evidence than age, so we remove on dead-pid immediately and say so.
  echo "gate.sh: removing STALE lock (holder pid '${owner_pid:-unknown}' is not alive)"
  sed 's/^/    was: /' "$LOCK/owner" 2>/dev/null
  rm -rf "$LOCK"
  if mkdir "$LOCK" 2>/dev/null; then
    printf 'pid=%s\ntime=%s\nworktree=%s\ntier=%s\n' "$$" "$(date -Is)" "$PWD" "$TIER" > "$LOCK/owner"
    return 0
  fi
  return 1
}

if ! acquire_lock; then
  echo "gate.sh: REFUSED — the lock is held by another gate (exit 9, this run is VOID):"
  sed 's/^/    /' "$LOCK/owner" 2>/dev/null
  echo "    lock: $LOCK"
  echo "    Wait for it to finish and retry. Never reap another actor's processes."
  exit 9
fi
# Remove the lock ONLY once it is ours — a trap that removed a lock we do not own
# would delete a sibling gate's lock.
trap 'rm -rf "$LOCK"' EXIT

# --- peer-suite diagnostic (informational here — see the header) --------------
echo "=== peer suites on this box (diagnostic only, not a refusal) ==="
# Truncated to 140 columns: a vitest chunk command line is KILOBYTES of test paths
# and would otherwise bury the gate's own summary in the operator's scrollback.
if pgrep -af 'vitest|jest|playwright' 2>/dev/null | grep -v 'gate.sh' | head -5 | cut -c1-140; then
  :
else
  echo "(none)"
fi
echo "load: $(cut -d' ' -f1-3 /proc/loadavg)"

# --- the body ----------------------------------------------------------------
# This MUST be a function, not a `{ ... }` group. `exit` inside a brace group that
# is redirected exits the WHOLE script before the summary and the LOGFILE line ever
# print — the first version of this script did exactly that: it returned a correct
# exit code with NO evidence and no log path for the operator. MEASURED 2026-09-21.
run_gate() {
  echo "=== futuremagic gate · tier=$TIER · $(date -Is) ==="
  echo "tree=$MAIN ($(git rev-parse --short HEAD) on $(git rev-parse --abbrev-ref HEAD))"
  echo "lock=$LOCK log=$LOG"
  echo

  if [ ! -d "$MAIN/node_modules" ]; then
    echo "FATAL: $MAIN/node_modules is missing — run 'npm ci' first (the gate does"
    echo "not install dependencies, so a gate can never mutate the tree it checks)."
    echo "EXIT=1 (RED)"
    return 1
  fi

  echo "--- typecheck: npx tsc --noEmit ---"
  npx tsc --noEmit
  TC=$?
  echo "typecheck exit=$TC"
  if [ "$TC" -ne 0 ]; then
    echo
    echo "GATE RED: typecheck failed. EXIT=1"
    return 1
  fi

  if [ "$TIER" = "compile" ]; then
    echo
    echo "COMPILE TIER ONLY — 'vite build' did NOT run. This is NOT a verified result."
    echo "EXIT=2"
    return 2
  fi

  echo
  echo "--- build: npx vite build ---"
  npx vite build
  BC=$?
  echo "build exit=$BC"
  if [ "$BC" -ne 0 ]; then
    echo
    echo "GATE RED: vite build failed. EXIT=1"
    return 1
  fi

  echo
  echo "GATE GREEN: typecheck + vite build both passed on $(git rev-parse --short HEAD). EXIT=0"
  return 0
}

cd "$MAIN" || exit 1
run_gate > "$LOG" 2>&1
RC=$?

# The summary is quoted FROM THE LOG, never piped through tail.
echo "LOGFILE=$LOG"
echo "---------------------------------- gate summary ----------------------------------"
cat "$LOG"
echo "----------------------------------------------------------------------------------"
echo "FULL GATE EXIT = $RC   (0=GREEN/verified · 1=RED · 2=compile-only/NOT verified · 3=plan · 9=lock held)"
exit "$RC"
