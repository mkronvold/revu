#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

readonly env_example_file=".env.example"
readonly env_file=".env"

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
  log_error 'docker is required to start the deployment stack.'
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  log_error 'git is required to update the deployment checkout.'
  exit 1
fi

prompt_yes_no() {
  local prompt="$1"
  local reply=""
  local prompt_timestamp=""

  if [[ ! -t 0 ]]; then
    return 1
  fi

  prompt_timestamp="$(timestamp)"
  printf '[%s] %s [y/N] ' "$prompt_timestamp" "$prompt"
  read -r reply || return 1
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
      log "Created ${env_file} from ${env_example_file}."
    else
      log "Skipping .env reconciliation because ${env_file} does not exist."
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
    log "${env_file} already matches the keys in ${env_example_file}."
    return
  fi

  if (( ${#missing_keys[@]} > 0 )); then
    log "Missing entries in ${env_file}:"
    for key in "${missing_keys[@]}"; do
      log "  - ${key}"
    done

    if prompt_yes_no "Add missing entries from ${env_example_file} to ${env_file}?"; then
      for key in "${missing_keys[@]}"; do
        line="$(env_line "$key" "$env_example_file")"
        if [[ -n "$line" ]]; then
          printf '\n%s\n' "$line" >> "$env_file"
        fi
      done
      log "Added missing entries to ${env_file}."
    fi
  fi

  if (( ${#removed_keys[@]} > 0 )); then
    log "Entries in ${env_file} that are no longer in ${env_example_file}:"
    for key in "${removed_keys[@]}"; do
      log "  - ${key}"
    done

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
      log "Removed obsolete entries from ${env_file}."
    fi
  fi
}

log 'Pulling latest git changes...'
git pull --ff-only

reconcile_env_file

log 'Pulling deployment images...'
docker compose pull

log 'Applying database migrations...'
bash ./scripts/db-migrate.sh

log 'Bootstrapping example data when needed...'
bash ./scripts/db-seed-if-empty.sh

log 'Starting deployment stack...'
docker compose up -d "$@"
log 'Containers up'
