#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

if ! command -v docker >/dev/null 2>&1; then
  printf 'docker is required to stop the deployment stack.\n' >&2
  exit 1
fi

printf 'Stopping deployment stack...\n'
docker compose down "$@"
