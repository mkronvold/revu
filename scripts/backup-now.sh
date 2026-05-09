#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if ! command -v docker >/dev/null 2>&1; then
  printf 'docker is required to run backup-now.\n' >&2
  exit 1
fi

if [[ -n "$(docker compose ps -q backup 2>/dev/null)" ]]; then
  docker compose exec -T backup /bin/sh /opt/revu/scripts/backup-entrypoint.sh backup-now "$@"
else
  docker compose run --rm backup backup-now "$@"
fi
