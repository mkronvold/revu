#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

readonly wait_attempts="${DB_WAIT_ATTEMPTS:-30}"
readonly wait_seconds="${DB_WAIT_SECONDS:-2}"

if ! command -v docker >/dev/null 2>&1; then
  printf 'docker is required to bootstrap the example dataset.\n' >&2
  exit 1
fi

printf 'Ensuring the db service is running...\n'
docker compose up -d db >/dev/null

db_query() {
  docker compose exec -T db sh -lc 'psql -tA -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
}

printf 'Waiting for Postgres to become ready...\n'
attempt=1
until docker compose exec -T db sh -lc 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; do
  if (( attempt >= wait_attempts )); then
    printf 'Postgres did not become ready after %s attempts.\n' "$wait_attempts" >&2
    exit 1
  fi

  attempt=$((attempt + 1))
  sleep "$wait_seconds"
done

bootstrap_state="$(
  printf '%s\n' \
    "SELECT CASE WHEN to_regclass('public.employees') IS NULL THEN 'missing' WHEN EXISTS (SELECT 1 FROM employees LIMIT 1) THEN 'seeded' ELSE 'empty' END;" \
    | db_query
)"

case "$bootstrap_state" in
  seeded)
    printf 'Example bootstrap skipped because employees already exist.\n'
    ;;
  empty)
    printf 'Database is empty. Loading the example dataset...\n'
    docker compose run --rm --no-deps api node apps/api/dist/seed-example.js
    ;;
  missing)
    printf 'Cannot seed example data before migrations create the employees table.\n' >&2
    exit 1
    ;;
  *)
    printf 'Unexpected bootstrap state: %s\n' "$bootstrap_state" >&2
    exit 1
    ;;
esac
