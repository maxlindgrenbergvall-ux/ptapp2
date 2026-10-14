#!/usr/bin/env bash
# Kör migrationen + RLS-testerna mot en lokal Postgres (inte Supabase).
# Användning: PGHOST=/tmp PGPORT=5433 PGUSER=postgres scripts/test-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${TEST_DB:-forma_test}"

dropdb --if-exists "$DB"
createdb "$DB"
run() { psql -X -q -v ON_ERROR_STOP=1 -d "$DB" "$@"; }
run -f supabase/tests/supabase_stub.sql 2>/dev/null  # varnar om wal_level (realtid), ofarligt
for f in supabase/migrations/*.sql; do run -f "$f"; done
run -f supabase/seed.sql
# Resultatrader till /dev/null; NOTICE (ok-rader) och fel går till stderr.
for t in supabase/tests/rls.test.sql supabase/tests/rls_v2.test.sql; do
  run -f "$t" 2>&1 >/dev/null | sed 's/^psql:[^ ]* NOTICE:  /  /'
done
dropdb "$DB"
