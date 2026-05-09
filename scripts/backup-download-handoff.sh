#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if ! command -v docker >/dev/null 2>&1; then
  printf 'docker is required to stage a backup download handoff.\n' >&2
  exit 1
fi

if [[ -n "$(docker compose ps -q backup 2>/dev/null)" ]]; then
  docker compose exec -T backup /bin/sh /opt/revu/scripts/backup-entrypoint.sh download-handoff "$@"
else
  docker compose run --rm --no-deps backup download-handoff "$@"
fi
