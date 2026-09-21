#!/usr/bin/env bash
# scripts/publish-apps-root.sh — publish the HUB into the apps root, so the root URL IS the hub.
#
# WHY THIS FILE EXISTS (ledger row 10; owner, verbatim: "Please deploy that on the apps root so
# that apps.futuremagic.de resolves to this.")
#   The static host serves `~/apps` over HTTPS. Today `/` is the host's auto-generated DIRECTORY
#   LISTING and the hub lives on the OLD host. This script copies the hub's built `dist/` into
#   that root so `https://apps.futuremagic.de/` serves the hub instead.
#
# THE ONE RULE THAT MATTERS: IT NEVER DELETES.
#   The app folders in the target (`expert/`, `fracvibe/`, ...) are NOT OURS — each app's own
#   deploy owns them, exactly as AGENTS.md §6 records for the old host. So there is no
#   `rsync --delete` and no `rm` in here, anywhere. This script only ADDS and OVERWRITES the
#   hub's own files (`index.html`, `assets/`, `apps.index.json`, `apps.json`, `stories.json`,
#   `shots/`, `favicon.svg`). A bogus `--delete` would wipe every published app at once.
#
# WHAT IT DOES
#   1. resolves the target: $1, else $APPS_ROOT_DIR, else $HOME/apps;
#   2. refuses loudly unless the target EXISTS and IS A DIRECTORY;
#   3. runs `npm run build` FIRST and publishes NOTHING if it fails (the index generator inside
#      it reads the LOCAL apps root — see scripts/generate-app-index.mjs — so the build is what
#      produces the very index this deploy ships);
#   4. copies `dist/` CONTENTS into the target, overwriting only files that already exist;
#   5. verifies by fetching the LOCAL origin http://127.0.0.1:8082/ — which BYPASSES the CDN
#      (the apps-publish skill's step 5) — asserting it returns the HUB (an `id="app"` marker)
#      rather than a directory listing, and quoting the HTTP code. This last step catches the
#      exact failure the hub's arrival creates: a root that still shows `Directory listing for /`.
#
# EXIT CODES
#   0 = the hub is copied into the target AND the local origin serves the hub
#   1 = refused or failed; nothing was published, or the target does not serve the hub
#
# Usage:
#   scripts/publish-apps-root.sh                  # publish into $HOME/apps
#   scripts/publish-apps-root.sh /tmp/some-root   # publish into a temp target (TESTING ONLY)
#   APPS_ROOT_DIR=/tmp/some-root scripts/publish-apps-root.sh
#
# NEVER run this against a target you do not own, and never to "clean up".
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$REPO/dist"
DEFAULT_TARGET="${APPS_ROOT_DIR:-$HOME/apps}"
TARGET="${1:-$DEFAULT_TARGET}"
# Every bash path is resolved to an absolute one, so a relative $1 cannot publish somewhere
# surprising. If it does not exist, `realpath -m` still gives the absolute path to NAME.
TARGET="$(realpath -m -- "$TARGET" 2>/dev/null || printf '%s' "$TARGET")"
# The local origin the static host actually listens on (bypasses any CDN, per the skill).
LOCAL_ORIGIN="${LOCAL_ORIGIN:-http://127.0.0.1:8082/}"
HUB_MARKER='id="app"'

echo "=== publish the hub into the apps root ==="
echo "repo          = $REPO"
echo "dist          = $DIST"
echo "target        = $TARGET"
echo "local origin  = $LOCAL_ORIGIN"
echo "policy        = NEVER DELETES: no --delete, no rm; only the hub's own files are overwritten"
echo

# --- 1. the target must exist and be a directory ------------------------------
if [ ! -e "$TARGET" ]; then
  echo "REFUSED: the target does not exist: $TARGET" >&2
  echo "         (pass an existing directory as \$1, or set APPS_ROOT_DIR)" >&2
  exit 1
fi
if [ ! -d "$TARGET" ]; then
  echo "REFUSED: the target is NOT a directory: $TARGET" >&2
  echo "         (it must be the directory the static host serves)" >&2
  exit 1
fi

# --- 2. build FIRST: publish nothing if the build fails ------------------------
echo "--- running 'npm run build' (its FIRST step generates the app index from the local root) ---"
if ! (cd "$REPO" && npm run build); then
  echo "REFUSED: 'npm run build' FAILED — nothing was published into $TARGET" >&2
  exit 1
fi
echo

if [ ! -d "$DIST" ]; then
  echo "REFUSED: the build reported success but $DIST does not exist — nothing published" >&2
  exit 1
fi
if [ ! -f "$DIST/index.html" ]; then
  echo "REFUSED: $DIST/index.html is missing — publishing this would leave the root with no hub" >&2
  exit 1
fi
if ! grep -q "$HUB_MARKER" "$DIST/index.html"; then
  echo "REFUSED: $DIST/index.html has no '$HUB_MARKER' marker — it does not look like the hub" >&2
  exit 1
fi

# --- 3. copy the hub in, overwriting ONLY files that already exist -------------
# `/.` is load-bearing: it copies the CONTENTS of dist, not the dist directory itself.
echo "--- copying dist/ contents into the target (no deletion) ---"
if command -v rsync >/dev/null 2>&1; then
  if ! rsync -a --exclude='*.tmp' "$DIST/." "$TARGET/"; then
    echo "FAILED: rsync reported an error — the target may be PARTIALLY updated" >&2
    exit 1
  fi
else
  # cp has no --delete to misuse, so this fallback cannot delete anything either.
  if ! cp -R "$DIST/." "$TARGET/"; then
    echo "FAILED: cp reported an error — the target may be PARTIALLY updated" >&2
    exit 1
  fi
fi

# --- 4. verify against the LOCAL origin, quoting the HTTP code -----------------
echo
echo "--- verifying $LOCAL_ORIGIN serves the HUB (not a directory listing) ---"
BODY="$(mktemp)"
trap 'rm -f "$BODY"' EXIT
CODE="$(curl -sS --max-time 10 -o "$BODY" -w '%{http_code}' "$LOCAL_ORIGIN" 2>/dev/null)" || CODE="000"
echo "HTTP $CODE from $LOCAL_ORIGIN"

if [ "$CODE" != "200" ]; then
  echo "FAILED: expected HTTP 200 from $LOCAL_ORIGIN, got $CODE." >&2
  echo "        Is the static host for the apps root running on that port?" >&2
  echo "        Nothing here was rolled back: the files ARE in $TARGET — fix forward." >&2
  exit 1
fi

if ! grep -q "$HUB_MARKER" "$BODY"; then
  echo "FAILED: $LOCAL_ORIGIN returned HTTP 200 but NOT the hub (no '$HUB_MARKER' marker)." >&2
  if grep -qi 'Directory listing for' "$BODY"; then
    echo "        It is still the host's DIRECTORY LISTING — the hub's index.html did not take" >&2
    echo "        effect at the root. Check $TARGET/index.html directly." >&2
  else
    echo "        First 200 bytes of what came back:" >&2
    head -c 200 "$BODY" >&2
    echo >&2
  fi
  exit 1
fi

echo "VERIFIED: $LOCAL_ORIGIN (HTTP $CODE) returns the hub ('$HUB_MARKER' present)."
echo
echo "PUBLISHED: $DIST -> $TARGET"
echo "  public URL: https://apps.futuremagic.de/"
echo "  nothing was deleted; every pre-existing file that the hub does not ship is untouched"
exit 0
