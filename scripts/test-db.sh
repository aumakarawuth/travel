#!/usr/bin/env bash
# Applies migrations to a throwaway Postgres DB and runs the RLS tests.
# Usage: DATABASE_URL=postgres://user:pass@host:5432/postgres scripts/test-db.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ADMIN_URL="${DATABASE_URL:-postgres:///postgres}"
DB="tripsync_test_$$"
psql "$ADMIN_URL" -qc "create database $DB"
trap 'psql "$ADMIN_URL" -qc "drop database if exists $DB" >/dev/null' EXIT
URL="${ADMIN_URL%/*}/$DB"
psql "$URL" -q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/00_supabase_stub.sql" 2>/dev/null
for f in "$ROOT"/supabase/migrations/*.sql; do psql "$URL" -q -v ON_ERROR_STOP=1 -f "$f"; done
psql "$URL" -q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/01_rls_test.sql"
