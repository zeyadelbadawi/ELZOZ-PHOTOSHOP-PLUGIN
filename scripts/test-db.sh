#!/usr/bin/env bash
# Run the credits database tests against a throwaway database.
#
#   ELZOZ_TEST_ADMIN_URL=postgresql://postgres@localhost:5432/postgres npm run test:db
#
# The admin URL must point at a PostgreSQL (15+) server where the user may
# create databases and roles. A fresh database is created, the Supabase stub
# and all migrations are applied in order, the tests run, and the database is dropped.
set -euo pipefail

: "${ELZOZ_TEST_ADMIN_URL:?Set ELZOZ_TEST_ADMIN_URL to an admin connection string}"
DB="elzoz_test_$$"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEST_URL="$(node -e 'const u=new URL(process.argv[1]); u.pathname="/"+process.argv[2]; console.log(u.toString())' "$ELZOZ_TEST_ADMIN_URL" "$DB")"

psql "$ELZOZ_TEST_ADMIN_URL" -v ON_ERROR_STOP=1 -q -c "create database $DB"
cleanup() { psql "$ELZOZ_TEST_ADMIN_URL" -q -c "drop database if exists $DB with (force)" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# Roles are cluster-wide; create them only if missing.
psql "$TEST_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;
SQL
grep -v '^create role' "$ROOT/supabase/tests/supabase_stub.sql" | psql "$TEST_URL" -v ON_ERROR_STOP=1 -q
for f in "$ROOT"/supabase/migrations/*.sql; do
  psql "$TEST_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done

ELZOZ_TEST_DATABASE_URL="$TEST_URL" npx vitest run tests/db
