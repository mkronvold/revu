#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

readonly env_example_file=".env.example"
readonly env_file=".env"

if ! command -v docker >/dev/null 2>&1; then
  printf 'docker is required to start the deployment stack.\n' >&2
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  printf 'git is required to update the deployment checkout.\n' >&2
  exit 1
fi

prompt_yes_no() {
  local prompt="$1"
  local reply=""

  if [[ ! -t 0 ]]; then
    return 1
  fi

  read -r -p "$prompt [y/N] " reply || return 1
  [[ "$reply" =~ ^[Yy]([Ee][Ss])?$ ]]
}

env_keys() {
  local file_path="$1"
  awk -F= '/^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*=/{gsub(/^[[:space:]]+|[[:space:]]+$/, "", $1); print $1}' "$file_path"
}

env_line() {
  local key="$1"
  local file_path="$2"
  awk -v key="$key" -F= '$1 == key { print; exit }' "$file_path"
}

reconcile_env_file() {
  local missing_keys=()
  local removed_keys=()
  local key=""
  local line=""
  local temp_file=""
  declare -A removed_lookup=()

  if [[ ! -f "$env_example_file" ]]; then
    return
  fi

  if [[ ! -f "$env_file" ]]; then
    if prompt_yes_no ".env is missing. Create it from .env.example?"; then
      cp -- "$env_example_file" "$env_file"
      printf 'Created %s from %s.\n' "$env_file" "$env_example_file"
    else
      printf 'Skipping .env reconciliation because %s does not exist.\n' "$env_file"
    fi
    return
  fi

  while IFS= read -r key; do
    if ! grep -Eq "^[[:space:]]*${key}=" "$env_file"; then
      missing_keys+=("$key")
    fi
  done < <(env_keys "$env_example_file")

  while IFS= read -r key; do
    if ! grep -Eq "^[[:space:]]*${key}=" "$env_example_file"; then
      removed_keys+=("$key")
    fi
  done < <(env_keys "$env_file")

  if (( ${#missing_keys[@]} == 0 && ${#removed_keys[@]} == 0 )); then
    printf '%s already matches the keys in %s.\n' "$env_file" "$env_example_file"
    return
  fi

  if (( ${#missing_keys[@]} > 0 )); then
    printf 'Missing entries in %s:\n' "$env_file"
    printf '  - %s\n' "${missing_keys[@]}"

    if prompt_yes_no "Add missing entries from ${env_example_file} to ${env_file}?"; then
      for key in "${missing_keys[@]}"; do
        line="$(env_line "$key" "$env_example_file")"
        if [[ -n "$line" ]]; then
          printf '\n%s\n' "$line" >> "$env_file"
        fi
      done
      printf 'Added missing entries to %s.\n' "$env_file"
    fi
  fi

  if (( ${#removed_keys[@]} > 0 )); then
    printf 'Entries in %s that are no longer in %s:\n' "$env_file" "$env_example_file"
    printf '  - %s\n' "${removed_keys[@]}"

    if prompt_yes_no "Remove obsolete entries from ${env_file}?"; then
      temp_file="$(mktemp)"
      for key in "${removed_keys[@]}"; do
        removed_lookup["$key"]=1
      done

      while IFS= read -r line || [[ -n "$line" ]]; do
        if [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)= ]]; then
          key="${BASH_REMATCH[1]}"
          if [[ -n "${removed_lookup[$key]:-}" ]]; then
            continue
          fi
        fi
        printf '%s\n' "$line" >> "$temp_file"
      done < "$env_file"

      mv -- "$temp_file" "$env_file"
      printf 'Removed obsolete entries from %s.\n' "$env_file"
    fi
  fi
}

printf 'Pulling latest git changes...\n'
git pull --ff-only

reconcile_env_file

printf 'Pulling deployment images...\n'
docker compose pull

printf 'Applying database migrations...\n'
bash ./scripts/db-migrate.sh

printf 'Bootstrapping example data when needed...\n'
bash ./scripts/db-seed-if-empty.sh

printf 'Starting deployment stack...\n'
docker compose up -d "$@"
