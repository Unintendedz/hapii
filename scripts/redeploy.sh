#!/usr/bin/env bash
#
# Rebuild and redeploy the local HAPI instance.
#
# Usage:
#   ./scripts/redeploy.sh              # full: typecheck + test + build + restart + smoke
#   ./scripts/redeploy.sh --skip-test  # skip typecheck and test (faster, for trusted changes)
#   ./scripts/redeploy.sh --clean-sessions  # destructive: kill runner + runner sessions before restart
#
# Prerequisites:
#   - bun installed (~/.bun/bin/bun)
#   - launchd service org.hapii.hub loaded
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

export PATH="$HOME/.bun/bin:$PATH"

SKIP_TEST=false
CLEAN_SESSIONS=false
for arg in "$@"; do
    case "$arg" in
        --skip-test) SKIP_TEST=true ;;
        --clean-sessions) CLEAN_SESSIONS=true ;;
        *) echo "Unknown flag: $arg"; exit 1 ;;
    esac
done

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
HAPI_BIN="$REPO_ROOT/cli/dist-exe/bun-darwin-arm64/hapi"

# ---------- 1. Typecheck + Test ----------
if [ "$SKIP_TEST" = false ]; then
    step "Typecheck"
    bun typecheck

    step "Test"
    bun run test
fi

# ---------- 2. Build single-exe ----------
step "Build single-exe (web + embedded assets + binary)"
bun run build:single-exe

# ---------- 3. Ensure runner version ----------
step "Ensure runner is on current CLI version (sessions preserved)"
"$HAPI_BIN" runner start

# ---------- 4. Optional: clean runner sessions ----------
if [ "$CLEAN_SESSIONS" = true ]; then
    step "Clean runner and runner-spawned sessions (destructive)"
    "$HAPI_BIN" doctor clean || true
    "$HAPI_BIN" runner start
fi

# ---------- 5. Restart hub via launchctl ----------
step "Restart hub (launchctl kickstart)"
launchctl kickstart -k "gui/$(id -u)/org.hapii.hub"

# ---------- 6. Wait for hub ----------
step "Waiting for hub to come up"
for i in $(seq 1 30); do
    if curl -fsS -o /dev/null http://127.0.0.1:3006/version.json 2>/dev/null; then
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "Hub did not start within 30s" >&2
        exit 1
    fi
    sleep 1
done

# ---------- 7. Smoke check ----------
step "Smoke check"

BUILD=$(curl -fsS http://127.0.0.1:3006/version.json | python3 -c 'import json,sys; print(json.load(sys.stdin)["build"])')
SHA=$(git rev-parse --short HEAD)
echo "  version.json build: $BUILD"
echo "  git HEAD:           $SHA"
if echo "$BUILD" | grep -q "$SHA"; then
    echo "  OK: build matches HEAD"
else
    echo "  WARNING: build does not contain HEAD SHA ($SHA)" >&2
fi

ACCESS=$(python3 -c 'import json,os; print(json.load(open(os.path.expanduser("~/.hapi/settings.json")))["cliApiToken"])')
JWT=$(curl -fsS -X POST -H 'Content-Type: application/json' \
    -d "{\"accessToken\":\"$ACCESS\"}" \
    http://127.0.0.1:3006/api/auth | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')
curl -fsS -H "Authorization: Bearer $JWT" 'http://127.0.0.1:3006/api/sessions?archived=false' >/dev/null
echo "  API: OK"

step "Done"
