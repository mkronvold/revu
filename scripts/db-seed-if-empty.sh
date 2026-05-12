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
  log_error 'docker is required to bootstrap the example dataset.'
  exit 1
fi

log 'Ensuring the db service is running...'
docker compose up -d db >/dev/null

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

bootstrap_state="$(
  printf '%s\n' \
    "SELECT CASE WHEN to_regclass('public.employees') IS NULL THEN 'missing' WHEN EXISTS (SELECT 1 FROM employees LIMIT 1) THEN 'seeded' ELSE 'empty' END;" \
    | db_query
)"

case "$bootstrap_state" in
  seeded)
    log 'Example bootstrap skipped because employees already exist.'
    ;;
  empty)
    log 'Database is empty. Loading the example dataset...'
    docker compose run --rm --no-deps api node apps/api/dist/seed-example.js
    ;;
  missing)
    log_error 'Cannot seed example data before migrations create the employees table.'
    exit 1
    ;;
  *)
    log_error "Unexpected bootstrap state: ${bootstrap_state}"
    exit 1
    ;;
esac
