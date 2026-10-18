#!/usr/bin/env bash
# Kör migrationen + RLS-testerna mot en lokal Postgres (inte Supabase).
# Användning: PGHOST=/tmp PGPORT=5433 PGUSER=postgres scripts/test-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${TEST_DB:-coavira_test}"

dropdb --if-exists "$DB"
createdb "$DB"
run() { psql -X -q -v ON_ERROR_STOP=1 -d "$DB" "$@"; }
run -f supabase/tests/supabase_stub.sql 2>/dev/null  # varnar om wal_level (realtid), ofarligt
for f in supabase/migrations/*.sql; do run -f "$f"; done
run -f supabase/seed.sql
# Resultatrader till /dev/null; NOTICE (ok-rader) och fel går till stderr.
for t in supabase/tests/rls.test.sql supabase/tests/rls_v2.test.sql supabase/tests/rls_v3.test.sql supabase/tests/rls_v4.test.sql supabase/tests/rls_v5.test.sql supabase/tests/rls_v6.test.sql supabase/tests/rls_v7.test.sql supabase/tests/rls_v8.test.sql supabase/tests/rls_v9.test.sql supabase/tests/rls_v10.test.sql; do
  run -f "$t" 2>&1 >/dev/null | sed 's/^psql:[^ ]* NOTICE:  /  /'
done
dropdb "$DB"

# Migreringstest: data från v1–v3 ska flyttas korrekt av v4.
dropdb --if-exists "${DB}_mig"
createdb "${DB}_mig"
m() { psql -X -q -v ON_ERROR_STOP=1 -d "${DB}_mig" "$@"; }
m -f supabase/tests/supabase_stub.sql 2>/dev/null
for f in supabase/migrations/*.sql; do
  case "$f" in *_v4_calendar.sql) m -f supabase/tests/migrate_v4.test.sql ;; esac
  m -f "$f"
done
m -v after=1 -f supabase/tests/migrate_v4.test.sql 2>&1 | sed 's/^psql:[^ ]* //'
dropdb "${DB}_mig"
