#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if ! command -v docker >/dev/null 2>&1; then
  printf 'docker is required to stage a backup upload handoff.\n' >&2
  exit 1
fi

if (( $# == 0 )); then
  printf 'Usage: %s <file> [request-id]\n' "$0" >&2
  exit 1
fi

if [[ -f "$1" ]]; then
  source_file="$(cd "$(dirname "$1")" && pwd -P)/$(basename "$1")"
  source_dir="$(dirname "$source_file")"
  source_name="$(basename "$source_file")"
  remaining_args=("/host-source/${source_name}")
  if (( $# > 1 )); then
    remaining_args+=("${@:2}")
  fi
  docker compose run --rm --no-deps -v "${source_dir}:/host-source:ro" backup upload-handoff "${remaining_args[@]}"
elif [[ -n "$(docker compose ps -q backup 2>/dev/null)" ]]; then
  docker compose exec -T backup /bin/sh /opt/revu/scripts/backup-entrypoint.sh upload-handoff "$@"
else
  docker compose run --rm --no-deps backup upload-handoff "$@"
fi
