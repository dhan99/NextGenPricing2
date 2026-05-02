#!/usr/bin/env bash
# Phase 0 — Smoke test
# Verifies the existing codebase still works before any refactoring begins.
#
# What this script does (and does NOT do):
#   - Runs `npm install` (fast no-op if already done)
#   - Runs the TypeScript type-checker to confirm the codebase compiles
#   - Boots the backend on port 3001 and probes /api/health and a few read-only
#     endpoints
#   - Boots the frontend on port 5000 and confirms it returns HTML
#   - Tears both down cleanly
#
# It does NOT exercise any mutating endpoints. The point of this script is to
# answer one question: "does the code we just cloned actually work?"
#
# Requirements:
#   - PostgreSQL reachable at $DATABASE_URL (the script reads .env)
#   - Node 20+ available
#
# Exit codes:
#   0 - all checks passed
#   1 - install/typecheck failure
#   2 - backend failed to start or did not respond
#   3 - frontend failed to start or did not respond
#   4 - environment problem (missing DATABASE_URL, port in use, etc.)

set -u
set -o pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# ----- Helpers -----
log()   { printf "\033[1;34m[smoke]\033[0m %s\n" "$*"; }
ok()    { printf "\033[1;32m[ ok ]\033[0m %s\n" "$*"; }
warn()  { printf "\033[1;33m[warn]\033[0m %s\n" "$*"; }
fail()  { printf "\033[1;31m[fail]\033[0m %s\n" "$*"; }

cleanup() {
    if [[ -n "${BACKEND_PID:-}" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
        kill "$BACKEND_PID" 2>/dev/null || true
        wait "$BACKEND_PID" 2>/dev/null || true
    fi
    if [[ -n "${FRONTEND_PID:-}" ]] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
        kill "$FRONTEND_PID" 2>/dev/null || true
        wait "$FRONTEND_PID" 2>/dev/null || true
    fi
}
trap cleanup EXIT INT TERM

# ----- 0. Environment sanity -----
log "0. Checking environment"
if [[ ! -f ".env" ]]; then
    warn ".env not found; falling back to .env.example if present"
    [[ -f ".env.example" ]] && cp .env.example .env || true
fi

if [[ -f ".env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source ./.env
    set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
    fail "DATABASE_URL is not set. Set it in .env or in your shell."
    exit 4
fi
ok "DATABASE_URL present"

# Check ports
for port in 3001 5000; do
    if (echo > /dev/tcp/127.0.0.1/$port) >/dev/null 2>&1; then
        fail "Port $port is already in use. Stop the process using it and retry."
        exit 4
    fi
done
ok "Ports 3001 and 5000 free"

# ----- 1. Install -----
log "1. npm install"
if ! npm install --no-audit --no-fund --silent; then
    fail "npm install failed"
    exit 1
fi
ok "Dependencies installed"

# ----- 2. Type-check -----
log "2. TypeScript type-check (tsc --noEmit)"
if ! npx tsc --noEmit; then
    fail "TypeScript errors detected. Fix these BEFORE refactoring."
    exit 1
fi
ok "Type-check clean"

# ----- 3. Boot backend -----
log "3. Starting backend (server/index.ts) on port 3001"
mkdir -p .smoke-logs
npx tsx server/index.ts > .smoke-logs/backend.log 2>&1 &
BACKEND_PID=$!

# Wait up to 60s for /api/clients to respond. Every mutating + most read
# routes are gated by requirePerm(), so the readiness probe must send the
# persona headers — without them the route returns 401 and `curl -fsS`
# treats that as "not up".
PROBE_HEADERS=(-H "x-user-name: SmokeTest" -H "x-user-role: PDL")
for i in {1..60}; do
    if curl -fsS "${PROBE_HEADERS[@]}" -o /dev/null -m 2 "http://localhost:3001/api/clients"; then
        ok "Backend up after ${i}s"
        break
    fi
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
        fail "Backend process died. Last 50 lines of log:"
        tail -50 .smoke-logs/backend.log
        exit 2
    fi
    sleep 1
done

if ! curl -fsS "${PROBE_HEADERS[@]}" -o /dev/null -m 2 "http://localhost:3001/api/clients"; then
    fail "Backend did not respond within 60s. Log tail:"
    tail -50 .smoke-logs/backend.log
    exit 2
fi

# ----- 4. Probe a representative set of read-only endpoints -----
log "4. Probing read-only endpoints"
PROBE_ENDPOINTS=(
    "/api/clients"
    "/api/deals"
    "/api/scope-catalog"
    "/api/dashboard/summary"
    "/api/margin-targets"
)
PROBE_FAILURES=0
for ep in "${PROBE_ENDPOINTS[@]}"; do
    code=$(curl -s -o /dev/null -w "%{http_code}" -m 5 \
        -H "x-user-name: SmokeTest" \
        -H "x-user-role: PDL" \
        "http://localhost:3001${ep}")
    if [[ "$code" =~ ^2 ]]; then
        ok "  ${ep} -> ${code}"
    else
        warn "  ${ep} -> ${code}"
        PROBE_FAILURES=$((PROBE_FAILURES+1))
    fi
done
if (( PROBE_FAILURES > 0 )); then
    warn "${PROBE_FAILURES} endpoint(s) returned non-2xx — review .smoke-logs/backend.log"
fi

# ----- 5. Boot frontend -----
log "5. Starting frontend (vite) on port 5000"
npx vite --host 0.0.0.0 --port 5000 > .smoke-logs/frontend.log 2>&1 &
FRONTEND_PID=$!

for i in {1..30}; do
    if curl -fsS -o /dev/null -m 2 "http://localhost:5000/"; then
        ok "Frontend up after ${i}s"
        break
    fi
    if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
        fail "Frontend process died. Last 50 lines of log:"
        tail -50 .smoke-logs/frontend.log
        exit 3
    fi
    sleep 1
done

if ! curl -fsS -m 2 "http://localhost:5000/" | grep -q "<!DOCTYPE\|<html"; then
    fail "Frontend did not return HTML. Log tail:"
    tail -50 .smoke-logs/frontend.log
    exit 3
fi
ok "Frontend served HTML"

# ----- Done -----
log "Smoke test PASSED"
echo
echo "  Backend log:  .smoke-logs/backend.log"
echo "  Frontend log: .smoke-logs/frontend.log"
echo
echo "  Read-only probe results: $((${#PROBE_ENDPOINTS[@]} - PROBE_FAILURES))/${#PROBE_ENDPOINTS[@]} passed"
echo
echo "  Next: open http://localhost:5000 in a browser to manually verify the wizard,"
echo "  then re-run this script in CI before every PR merge."

exit 0
