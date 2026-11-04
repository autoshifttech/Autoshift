#!/usr/bin/env bash
# Builds the database the end-to-end tests run against: a Supabase stub plus every migration.
#   E2E_PG_DSN="host=/tmp port=5544 user=postgres dbname=t" tests/e2e/setup_db.sh
# Set STRIP_VECTOR=1 when the server has no pgvector (only the AI-knowledge search needs it).
set -euo pipefail
: "${E2E_PG_DSN:?set E2E_PG_DSN}"
here="$(cd "$(dirname "$0")" && pwd)"
migrations="$here/../../../supabase/migrations"
psql "$E2E_PG_DSN" -q -v ON_ERROR_STOP=1 -f "$here/supabase_stub.sql" >/dev/null 2>&1
for f in "$migrations"/*.sql; do
  if [ "${STRIP_VECTOR:-0}" = "1" ]; then
    sed -E 's/vector\([0-9]+\)/float8[]/g; /CREATE EXTENSION.*vector/Id; /USING (ivfflat|hnsw)/Id' "$f" | psql "$E2E_PG_DSN" -q -v ON_ERROR_STOP=1 >/dev/null 2>&1 || echo "skipped (needs pgvector): $(basename "$f")"
  else
    psql "$E2E_PG_DSN" -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1 || { echo "migration failed: $(basename "$f")"; exit 1; }
  fi
done
echo "database ready"
