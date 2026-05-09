#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

readonly database_url="${DATABASE_URL:-postgresql://revu:revu@localhost:5432/revu}"
readonly wait_attempts="${DB_WAIT_ATTEMPTS:-30}"
readonly wait_seconds="${DB_WAIT_SECONDS:-2}"

if ! command -v psql >/dev/null 2>&1; then
  printf 'psql is required to apply Postgres migrations via DATABASE_URL.\n' >&2
  exit 1
fi

if ! command -v pg_isready >/dev/null 2>&1; then
  printf 'pg_isready is required to wait for Postgres before applying migrations.\n' >&2
  exit 1
fi

printf 'Waiting for Postgres to become ready...\n'
attempt=1
until pg_isready -d "$database_url" >/dev/null 2>&1; do
  if (( attempt >= wait_attempts )); then
    printf 'Postgres did not become ready after %s attempts.\n' "$wait_attempts" >&2
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
  printf 'No migrations found in prisma/migrations.\n'
  exit 0
fi

tracked_migrations="$(psql "$database_url" -tA -v ON_ERROR_STOP=1 -c "SELECT COUNT(*) FROM schema_migrations;")"
has_existing_schema="$(
  psql "$database_url" -tA -v ON_ERROR_STOP=1 \
    -c "SELECT CASE WHEN to_regclass('public.employees') IS NOT NULL THEN 1 ELSE 0 END;"
)"

if [[ "$tracked_migrations" == "0" && "$has_existing_schema" == "1" ]]; then
  printf 'Schema already exists without migration history; recording current migrations.\n'
  for migration in "${migrations[@]}"; do
    filename="$(basename "$migration")"
    escaped_filename="${filename//\'/\'\'}"
    psql "$database_url" -v ON_ERROR_STOP=1 \
      -c "INSERT INTO schema_migrations (filename) VALUES ('$escaped_filename') ON CONFLICT (filename) DO NOTHING;" >/dev/null
  done
  printf 'Database schema is up to date.\n'
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
    printf 'Skipping %s (already applied).\n' "$filename"
    continue
  fi

  printf 'Applying %s...\n' "$filename"
  psql "$database_url" -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
  psql "$database_url" -v ON_ERROR_STOP=1 \
    -c "INSERT INTO schema_migrations (filename) VALUES ('$escaped_filename');" >/dev/null
done

printf 'Database schema is up to date.\n'
