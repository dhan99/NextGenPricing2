#!/usr/bin/env bash
# Snapshot the current database to a timestamped .sql file.
#
# Usage:
#     bash scripts/audit/backup_db.sh [tag]
#
# Where [tag] is an optional human-readable label, e.g. "pre-multi-entity".
# Files are written to ./backups/ (gitignored).
#
# Requirements:
#   - $DATABASE_URL set in env or .env
#   - pg_dump available on PATH

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

if [[ -f ".env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source ./.env
    set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "[backup_db] ERROR: DATABASE_URL is not set" >&2
    exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
    echo "[backup_db] ERROR: pg_dump not found on PATH" >&2
    exit 1
fi

mkdir -p backups

TAG="${1:-snapshot}"
TS="$(date +%Y%m%d_%H%M%S)"
OUT="backups/dealpad_${TAG}_${TS}.sql"

echo "[backup_db] Dumping to ${OUT}"
pg_dump --no-owner --no-acl --format=plain "$DATABASE_URL" > "$OUT"

SIZE=$(du -h "$OUT" | cut -f1)
echo "[backup_db] Done: ${OUT} (${SIZE})"
