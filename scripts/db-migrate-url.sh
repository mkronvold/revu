#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

readonly database_url="${DATABASE_URL:-postgresql://revu:revu@localhost:5432/revu}"
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

if ! command -v psql >/dev/null 2>&1; then
  log_error 'psql is required to apply Postgres migrations via DATABASE_URL.'
  exit 1
fi

if ! command -v pg_isready >/dev/null 2>&1; then
  log_error 'pg_isready is required to wait for Postgres before applying migrations.'
  exit 1
fi

log 'Waiting for Postgres to become ready...'
attempt=1
until pg_isready -d "$database_url" >/dev/null 2>&1; do
  if (( attempt >= wait_attempts )); then
    log_error "Postgres did not become ready after ${wait_attempts} attempts."
    exit 1
  fi

  attempt=$((attempt + 1))
  sleep "$wait_seconds"
done

psql "$database_url" -v ON_ERROR_STOP=1 \
  -c "CREATE TABLE IF NOT EXISTS schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());" >/dev/null

shopt -s nullglob
migrations=(prisma/migrations/*.sql)

if (( ${#migrations[@]} == 0 )); then
  log 'No migrations found in prisma/migrations.'
  exit 0
fi

tracked_migrations="$(psql "$database_url" -tA -v ON_ERROR_STOP=1 -c "SELECT COUNT(*) FROM schema_migrations;")"
has_existing_schema="$(
  psql "$database_url" -tA -v ON_ERROR_STOP=1 \
    -c "SELECT CASE WHEN to_regclass('public.employees') IS NOT NULL THEN 1 ELSE 0 END;"
)"

if [[ "$tracked_migrations" == "0" && "$has_existing_schema" == "1" ]]; then
  log 'Schema already exists without migration history; recording current migrations.'
  for migration in "${migrations[@]}"; do
    filename="$(basename "$migration")"
    escaped_filename="${filename//\'/\'\'}"
    psql "$database_url" -v ON_ERROR_STOP=1 \
      -c "INSERT INTO schema_migrations (filename) VALUES ('$escaped_filename') ON CONFLICT (filename) DO NOTHING;" >/dev/null
  done
  log 'Database schema is up to date.'
  exit 0
fi

for migration in "${migrations[@]}"; do
  filename="$(basename "$migration")"
  escaped_filename="${filename//\'/\'\'}"
  already_applied="$(
    psql "$database_url" -tA -v ON_ERROR_STOP=1 \
      -c "SELECT 1 FROM schema_migrations WHERE filename = '$escaped_filename' LIMIT 1;"
  )"

  if [[ "$already_applied" == "1" ]]; then
    log "Skipping ${filename} (already applied)."
    continue
  fi

  log "Applying ${filename}..."
  psql "$database_url" -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
  psql "$database_url" -v ON_ERROR_STOP=1 \
    -c "INSERT INTO schema_migrations (filename) VALUES ('$escaped_filename');" >/dev/null
done

log 'Database schema is up to date.'
