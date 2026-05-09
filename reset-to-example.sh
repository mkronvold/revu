#!/usr/bin/env bash
#
# reset-to-example.sh — Reset the persistent database to the built-in example dataset.
#
# Prerequisite: the deployment stack must have been started with up.sh (or
# "docker compose up -d") so the db service is reachable.  The script will
# wait for Postgres to become ready before proceeding.
#
# Usage:
#   ./reset-to-example.sh
#
# The script is idempotent: running it multiple times always leaves the
# database in the same clean example state.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

if ! command -v docker >/dev/null 2>&1; then
  printf 'docker is required to reset the example dataset.\n' >&2
  exit 1
fi

# 1. Apply any pending schema migrations.
printf 'Applying schema migrations...\n'
bash ./scripts/db-migrate.sh

# 2. Seed the example dataset.
#    Run the compiled seed script inside a one-shot API container so it has
#    the correct DATABASE_URL and can reach the db service on the internal
#    Docker network.  --no-deps avoids re-starting the db service (already
#    ensured by db-migrate.sh above).
printf 'Loading example dataset into Postgres...\n'
docker compose run --rm --no-deps api node apps/api/dist/seed-example.js

printf '\nDone. The database now contains the example dataset.\n'
printf '\nExample credentials:\n'
printf '  ada.admin        / AdminPass123!\n'
printf '  manny.manager    / ManagerPass123!\n'
printf '  elliot.employee  / EmployeePass123!\n'
printf '  pat.peer         / PeerPass123!\n'
