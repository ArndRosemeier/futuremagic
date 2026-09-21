#!/usr/bin/env bash
# scripts/board.sh — reconcile docs/20-ORCHESTRATION.md (the board) against reality.
#
# Read-only. Takes NO lock, so it is safe to run at any time, including beside a
# live gate. The chief of staff runs this FIRST in a session: the board is prose
# about state, and prose about state rots, so every claim it makes is CHECKED here
# instead of being believed. A stale board is a FINDING to report and fix, never a
# crash — so the exit status stays 0 and the LAST LINE says which it is.
#
# Exit codes: 0 = reconciled (last line says which) · 2 = the script could not look
# (not inside a git work tree, or the board file is missing). Exit 2 is the
# "a check that cannot look is not a check" case: it must never be silent.
#
# Usage: bash scripts/board.sh
# Env:   BOARD=<path> (default docs/20-ORCHESTRATION.md)
#        DSH_SESSION_ID (optional; the harness sets it, a bare child shell may not)
set -uo pipefail

# A bare `$DSH_SESSION_ID` under `set -u` kills the run on the first SESSION
# record, BEFORE it prints a verdict — the exact failure this script exists to
# prevent. Default it empty ONCE, here, so every read below is safe.
SESSION_ID="${DSH_SESSION_ID:-}"

_common="$(git rev-parse --git-common-dir 2>/dev/null)"
[ -n "$_common" ] || { echo "board.sh: not inside a git work tree — CANNOT LOOK"; exit 2; }
MAIN="$(cd "$(dirname "$_common")" && pwd)"
cd "$MAIN" || exit 2
BOARD="${BOARD:-docs/20-ORCHESTRATION.md}"
[ -f "$BOARD" ] || { echo "board.sh: BOARD MISSING — $MAIN/$BOARD — CANNOT LOOK"; exit 2; }

STALE=0
note() { echo "  !! $*"; STALE=1; }

# --- session root: DERIVED from this repo's own path, never hardcoded ---------
# DSH slug = the absolute path with each `/` turned into `-`, plus a LEADING dash
# and a TRAILING `--`. Matching on the basename alone can land on another box's
# dir for the same workspace name — which looks like a successful lookup while
# reading the wrong tree. Exact first; loose candidates only as a fallback.
sess_base="${DSH_HOME:-$HOME/.dsh}/sessions"
exact="$sess_base/-${MAIN//\//-}--"
SESSROOT=""
for c in "$exact" "$sess_base"/*-"${MAIN##*/}"--; do
  [ -d "$c" ] && { SESSROOT="$c"; break; }
done
echo "=== session root ==="
if [ -n "$SESSROOT" ]; then
  echo "  $SESSROOT"
  [ "$SESSROOT" = "$exact" ] || echo "  (via a LOOSE candidate — the exact slug did not exist)"
else
  echo "  NOT FOUND (looked for $exact) — the session-liveness check below CANNOT LOOK,"
  echo "  so its silence is NOT evidence that no writer is in flight"
fi

# --- git ---------------------------------------------------------------------
echo
echo "=== git ==="
BR="$(git rev-parse --abbrev-ref HEAD)"
echo "  branch=$BR  HEAD=$(git rev-parse --short HEAD)  origin/master=$(git rev-parse --short origin/master 2>/dev/null || echo NONE)"
BEHIND="$(git rev-list --count HEAD..origin/master 2>/dev/null || echo 0)"
AHEAD="$(git rev-list --count origin/master..HEAD 2>/dev/null || echo 0)"
echo "  ahead=$AHEAD behind=$BEHIND"
[ "$BEHIND" -gt 0 ] && note "local $BR is $BEHIND commit(s) BEHIND origin/master — a stale local tree, not a state of the world: pull before believing any record or gating anything"
[ "$AHEAD" -gt 0 ] && echo "  note: $AHEAD local commit(s) NOT pushed to origin/master"
DIRTY="$(git status --porcelain | wc -l)"
echo "  dirty files: $DIRTY"
[ "$DIRTY" -gt 0 ] && git status --short | sed 's/^/    /'

RECONCILED="$(grep -m1 '^reconciled: ' "$BOARD" 2>/dev/null | sed 's/^reconciled: *//; s/ .*//')"
echo "  board reconciled=${RECONCILED:-<none>}"
if [ -n "$RECONCILED" ] && [ "$RECONCILED" != "none" ]; then
  if ! git merge-base --is-ancestor "$RECONCILED" HEAD 2>/dev/null; then
    note "the board's reconciled SHA ($RECONCILED) is NOT an ancestor of HEAD — the board predates the tree it claims to describe"
  fi
fi

# --- records -----------------------------------------------------------------
echo
echo "=== records ==="
LANDED="$(grep -c '^LANDED ' "$BOARD" 2>/dev/null || echo 0)"
INFLIGHT="$(grep -c '^IN-FLIGHT ' "$BOARD" 2>/dev/null || echo 0)"
echo "  LANDED=$LANDED  IN-FLIGHT=$INFLIGHT"

# Every LANDED sha must exist on origin/master. A sha that exists only locally is
# an unlanded claim.
while IFS= read -r line; do
  [ -n "$line" ] || continue
  sha="$(printf '%s' "$line" | grep -o 'sha=[0-9a-f]\{7,\}' | head -1 | cut -d= -f2)"
  row="$(printf '%s' "$line" | grep -o 'row=[0-9]*' | head -1 | cut -d= -f2)"
  [ -n "$sha" ] || { note "LANDED row=${row:-?} has no parseable sha= — a landing with no sha cannot be verified"; continue; }
  if git merge-base --is-ancestor "$sha" origin/master 2>/dev/null; then
    echo "  LANDED row=$row sha=$sha  on origin/master: YES"
  elif git cat-file -e "$sha^{commit}" 2>/dev/null; then
    note "LANDED row=$row sha=$sha exists locally but is NOT on origin/master — an unlanded claim"
  else
    note "LANDED row=$row sha=$sha DOES NOT EXIST in this repo — invented or from another repo"
  fi
done < <(grep '^LANDED ' "$BOARD" 2>/dev/null || true)

# Every IN-FLIGHT claim: does its branch exist, does its worktree exist, and has a
# LANDED row for the same row appeared (a classic STALE PAIR)?
while IFS= read -r line; do
  [ -n "$line" ] || continue
  row="$(printf '%s' "$line" | grep -o 'row=[0-9]*' | head -1 | cut -d= -f2)"
  br="$(printf '%s' "$line" | grep -o 'branch=[^ |]*' | head -1 | cut -d= -f2)"
  wt="$(printf '%s' "$line" | grep -o 'worktree=[^ |]*' | head -1 | cut -d= -f2)"
  st="$(printf '%s' "$line" | grep -o 'state=[^|]*' | head -1 | cut -d= -f2- | sed 's/ *$//')"
  printf '  IN-FLIGHT row=%s branch=%s\n' "${row:-?}" "${br:-?}"
  [ -n "$st" ] && echo "      state: $st"
  if [ -n "$br" ] && git show-ref --verify --quiet "refs/heads/$br"; then
    echo "      branch exists: YES"
  else
    note "IN-FLIGHT row=${row:-?} claims branch '${br:-?}' which does NOT exist — the writer was retired or never started"
  fi
  if [ -n "$wt" ] && [ -d "$wt" ]; then
    echo "      worktree exists: YES"
  else
    echo "      worktree: absent (${wt:-unrecorded}) — if this writer is live, its work is UNCOMMITTED and one turn from being lost"
  fi
  if [ -n "$row" ] && grep -q "^LANDED .*row=$row\b" "$BOARD" 2>/dev/null; then
    note "STALE PAIR: row=$row has BOTH an IN-FLIGHT and a LANDED record — the board contradicts itself"
  fi
done < <(grep '^IN-FLIGHT ' "$BOARD" 2>/dev/null || true)

# --- the gate lock -----------------------------------------------------------
echo
echo "=== gate lock ==="
LOCK="$MAIN/.futuremagic-lock"
if [ -d "$LOCK" ]; then
  echo "  HELD: $LOCK"
  sed 's/^/    /' "$LOCK/owner" 2>/dev/null
  P="$(sed -n 's/^pid=//p' "$LOCK/owner" 2>/dev/null | head -1)"
  if [ -n "$P" ] && kill -0 "$P" 2>/dev/null; then
    echo "    holder pid $P is ALIVE — a gate is running. Do not start another; exit 9 is the gate refusing, which is the lock WORKING."
  else
    note "the lock is held by pid '${P:-unknown}' which is NOT alive — a STALE lock; the next gate run will clear it and say so"
  fi
else
  echo "  free"
fi

# --- host --------------------------------------------------------------------
echo
echo "=== host ==="
echo "  load: $(cut -d' ' -f1-3 /proc/loadavg)"
awk '/MemAvailable/{printf "  available memory: %d MB\n", $2/1024}' /proc/meminfo
echo "  node/tsc/vite processes (any project — this box is shared):"
if pgrep -af 'vitest|jest|playwright|tsc|vite build' 2>/dev/null | grep -v 'board.sh' | head -8 | sed 's/^/    /'; then
  :
else
  echo "    (none)"
fi

echo
if [ "$STALE" -eq 0 ]; then
  echo "BOARD RECONCILED"
else
  echo "BOARD STALE — fix $BOARD before dispatching"
fi
exit 0
