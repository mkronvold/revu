#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

readonly postgres_db="${POSTGRES_DB:-revu}"
readonly postgres_user="${POSTGRES_USER:-revu}"
readonly wait_attempts="${DB_WAIT_ATTEMPTS:-30}"
readonly wait_seconds="${DB_WAIT_SECONDS:-2}"

if ! command -v docker >/dev/null 2>&1; then
  printf 'docker is required to apply local Postgres migrations.\n' >&2
  exit 1
fi

printf 'Ensuring the db service is running...\n'
docker compose up -d db >/dev/null

printf 'Waiting for Postgres to become ready...\n'
attempt=1
until docker compose exec -T db pg_isready -U "$postgres_user" -d "$postgres_db" >/dev/null 2>&1; do
  if (( attempt >= wait_attempts )); then
    printf 'Postgres did not become ready after %s attempts.\n' "$wait_attempts" >&2
    exit 1
  fi

  attempt=$((attempt + 1))
  sleep "$wait_seconds"
done

docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "$postgres_user" -d "$postgres_db" \
  -c "CREATE TABLE IF NOT EXISTS schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());" >/dev/null

shopt -s nullglob
migrations=(prisma/migrations/*.sql)

if (( ${#migrations[@]} == 0 )); then
  printf 'No migrations found in prisma/migrations.\n'
  exit 0
fi

for migration in "${migrations[@]}"; do
  filename="$(basename "$migration")"
  already_applied="$(
    docker compose exec -T db psql -tA -U "$postgres_user" -d "$postgres_db" \
      -c "SELECT 1 FROM schema_migrations WHERE filename = '$filename' LIMIT 1;"
  )"

  if [[ "$already_applied" == "1" ]]; then
    printf 'Skipping %s (already applied).\n' "$filename"
    continue
  fi

  printf 'Applying %s...\n' "$filename"
  cat "$migration" | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "$postgres_user" -d "$postgres_db" >/dev/null
  docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "$postgres_user" -d "$postgres_db" \
    -c "INSERT INTO schema_migrations (filename) VALUES ('$filename');" >/dev/null
done

printf 'Local database schema is up to date.\n'
