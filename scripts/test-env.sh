#!/usr/bin/env bash
# Disposable local backend for end-to-end tests. NEVER points at a real project.
#
#   bash scripts/test-env.sh start   # PostgreSQL 16 + migrations + PostgREST
#   bash scripts/test-env.sh stop
#
# Writes connection details to $ELZOZ_TEST_HOME/env (sourced by the e2e runners):
#   ELZOZ_TEST_DATABASE_URL, ELZOZ_TEST_POSTGREST_URL, ELZOZ_TEST_JWT_SECRET
#
# Requirements: PostgreSQL 15+ server binaries (pg_ctl/initdb), and a PostgREST
# binary (POSTGREST_BIN, default: downloaded to $ELZOZ_TEST_HOME/postgrest).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEST_HOME="${ELZOZ_TEST_HOME:-/tmp/elzoz-test}"
PG_PORT="${ELZOZ_TEST_PG_PORT:-54329}"
REST_PORT="${ELZOZ_TEST_REST_PORT:-54331}"
PGBIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DATA="$TEST_HOME/pg"
SOCK="$TEST_HOME/sock"
POSTGREST_VERSION="v12.2.3"

as_pg() {
  # initdb/postgres refuse to run as root; use a dedicated unprivileged user when needed.
  if [ "$(id -u)" = "0" ]; then
    id elzozpg >/dev/null 2>&1 || useradd -m elzozpg
    chown -R elzozpg "$TEST_HOME/pg" "$SOCK" 2>/dev/null || true
    su elzozpg -s /bin/bash -c "$*"
  else
    bash -c "$*"
  fi
}

start() {
  mkdir -p "$TEST_HOME" "$DATA" "$SOCK"
  chmod 755 "$TEST_HOME"
  if [ ! -f "$DATA/PG_VERSION" ]; then
    as_pg "'$PGBIN/initdb' -D '$DATA' -U postgres --auth=trust >/dev/null"
  fi
  if ! "$PGBIN/pg_isready" -h "$SOCK" -p "$PG_PORT" >/dev/null 2>&1; then
    as_pg "'$PGBIN/pg_ctl' -D '$DATA' -o \"-p $PG_PORT -k $SOCK -c listen_addresses=127.0.0.1\" -l '$DATA/log' -w start >/dev/null"
  fi
  local admin="postgresql://postgres@127.0.0.1:$PG_PORT/postgres"
  psql "$admin" -q -c "drop database if exists elzoz_e2e with (force)" -c "create database elzoz_e2e"
  local db="postgresql://postgres@127.0.0.1:$PG_PORT/elzoz_e2e"
  psql "$db" -v ON_ERROR_STOP=1 -q <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator login noinherit; end if;
end $$;
grant anon, authenticated, service_role to authenticator;
SQL
  grep -v '^create role' "$ROOT/supabase/tests/supabase_stub.sql" | psql "$db" -v ON_ERROR_STOP=1 -q
  for f in "$ROOT"/supabase/migrations/*.sql; do psql "$db" -v ON_ERROR_STOP=1 -q -f "$f" 2>&1 | grep -v NOTICE || true; done

  # PostgREST, as Supabase runs it in front of the database.
  local bin="${POSTGREST_BIN:-$TEST_HOME/postgrest}"
  if [ ! -x "$bin" ]; then
    curl -sSfL -o "$TEST_HOME/pgrst.tar.xz" "https://github.com/PostgREST/postgrest/releases/download/$POSTGREST_VERSION/postgrest-$POSTGREST_VERSION-linux-static-x64.tar.xz"
    tar -xf "$TEST_HOME/pgrst.tar.xz" -C "$TEST_HOME"
  fi
  local secret
  secret="$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 48)"
  cat > "$TEST_HOME/postgrest.conf" <<CONF
db-uri = "postgresql://authenticator@127.0.0.1:$PG_PORT/elzoz_e2e"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$secret"
server-host = "127.0.0.1"
server-port = $REST_PORT
CONF
  pkill -f "postgrest $TEST_HOME/postgrest.conf" 2>/dev/null || true
  # Wait for a previous instance to release the port.
  for _ in $(seq 1 50); do
    curl -s -o /dev/null "http://127.0.0.1:$REST_PORT/" || break
    sleep 0.2
  done
  nohup "$bin" "$TEST_HOME/postgrest.conf" > "$TEST_HOME/postgrest.log" 2>&1 &
  # Ready = schema cache loaded (anonymous table read returns 401/403, not 503).
  for _ in $(seq 1 100); do
    code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$REST_PORT/credit_accounts" || true)"
    case "$code" in 401|403) break ;; esac
    sleep 0.2
  done
  case "$code" in 401|403) ;; *) echo "PostgREST did not become ready (last HTTP $code); see $TEST_HOME/postgrest.log" >&2; exit 1 ;; esac
  cat > "$TEST_HOME/env" <<ENV
export ELZOZ_TEST_DATABASE_URL="$db"
export ELZOZ_TEST_ADMIN_URL="$admin"
export ELZOZ_TEST_POSTGREST_URL="http://127.0.0.1:$REST_PORT"
export ELZOZ_TEST_JWT_SECRET="$secret"
ENV
  echo "Test backend ready: Postgres :$PG_PORT, PostgREST :$REST_PORT (env in $TEST_HOME/env)"
}

stop() {
  pkill -f "postgrest $TEST_HOME/postgrest.conf" 2>/dev/null || true
  as_pg "'$PGBIN/pg_ctl' -D '$DATA' -m fast stop >/dev/null" 2>/dev/null || true
  echo "Test backend stopped."
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  *) echo "usage: $0 start|stop" >&2; exit 2 ;;
esac
