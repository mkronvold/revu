#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

readonly wait_attempts="${DB_WAIT_ATTEMPTS:-30}"
readonly wait_seconds="${DB_WAIT_SECONDS:-2}"

timestamp() {
  date '+%Y-%m-%d %H:%M:%S'
}

log() {
  printf '[%s] %s\n' "$(timestamp)" "$*"
}

log_error() {
  printf '[%s] %s\n' "$(timestamp)" "$*" >&2
}

if ! command -v docker >/dev/null 2>&1; then
  log_error 'docker is required to apply local Postgres migrations.'
  exit 1
fi

log 'Ensuring the db service is running...'
docker compose up -d db >/dev/null

db_exec() {
  docker compose exec -T db sh -lc 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
}

db_query() {
  docker compose exec -T db sh -lc 'psql -tA -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
}

log 'Waiting for Postgres to become ready...'
attempt=1
until docker compose exec -T db sh -lc 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; do
  if (( attempt >= wait_attempts )); then
    log_error "Postgres did not become ready after ${wait_attempts} attempts."
    exit 1
  fi

  attempt=$((attempt + 1))
  sleep "$wait_seconds"
done

printf '%s\n' "CREATE TABLE IF NOT EXISTS schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());" | db_exec >/dev/null

shopt -s nullglob
migrations=(prisma/migrations/*.sql)

if (( ${#migrations[@]} == 0 )); then
  log 'No migrations found in prisma/migrations.'
  exit 0
fi

tracked_migrations="$(printf '%s\n' 'SELECT COUNT(*) FROM schema_migrations;' | db_query)"
has_existing_schema="$(
  printf '%s\n' "SELECT CASE WHEN to_regclass('public.employees') IS NOT NULL THEN 1 ELSE 0 END;" | db_query
)"

if [[ "$tracked_migrations" == "0" && "$has_existing_schema" == "1" ]]; then
  log 'Schema already exists without migration history; recording current migrations.'
  for migration in "${migrations[@]}"; do
    filename="$(basename "$migration")"
    escaped_filename="${filename//\'/\'\'}"
    printf '%s\n' "INSERT INTO schema_migrations (filename) VALUES ('$escaped_filename') ON CONFLICT (filename) DO NOTHING;" | db_exec >/dev/null
  done
  log 'Local database schema is up to date.'
  exit 0
fi

for migration in "${migrations[@]}"; do
  filename="$(basename "$migration")"
  escaped_filename="${filename//\'/\'\'}"
  already_applied="$(printf '%s\n' "SELECT 1 FROM schema_migrations WHERE filename = '$escaped_filename' LIMIT 1;" | db_query)"

  if [[ "$already_applied" == "1" ]]; then
    log "Skipping ${filename} (already applied)."
    continue
  fi

  log "Applying ${filename}..."
  cat "$migration" | db_exec >/dev/null
  printf '%s\n' "INSERT INTO schema_migrations (filename) VALUES ('$escaped_filename');" | db_exec >/dev/null
done

log 'Local database schema is up to date.'
