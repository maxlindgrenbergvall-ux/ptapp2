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
run -f supabase/migrations/20261014000000_init.sql
run -f supabase/seed.sql
# Resultatrader till /dev/null; NOTICE (ok-rader) och fel går till stderr.
run -f supabase/tests/rls.test.sql 2>&1 >/dev/null | sed 's/^psql:[^ ]* NOTICE:  /  /'
dropdb "$DB"
