#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

if ! command -v npm >/dev/null 2>&1; then
  printf 'npm is required to run the workspace test workflow.\n' >&2
  exit 1
fi

printf 'Running workspace validation...\n'
npm run validate
