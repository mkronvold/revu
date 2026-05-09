#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

readonly default_interval_minutes=30
readonly ghcr_services=(api web)

if ! command -v docker >/dev/null 2>&1; then
  printf 'docker is required to monitor and update the deployment stack.\n' >&2
  exit 1
fi

if (( $# > 1 )); then
  printf 'Usage: %s [interval-minutes]\n' "$0" >&2
  exit 1
fi

interval_minutes="${1:-$default_interval_minutes}"

if ! [[ "$interval_minutes" =~ ^[0-9]+$ ]] || (( interval_minutes <= 0 )); then
  printf 'Interval must be a positive number of minutes.\n' >&2
  exit 1
fi

readonly interval_minutes
readonly sleep_seconds=$(( interval_minutes * 60 ))

timestamp() {
  date '+%Y-%m-%d %H:%M:%S'
}

log() {
  printf '[%s] %s\n' "$(timestamp)" "$*"
}

service_image() {
  local service="$1"
  docker compose config "$service" | awk -F': ' '/^[[:space:]]*image:[[:space:]]*/ { print $2; exit }'
}

local_image_id() {
  local image="$1"
  docker image inspect "$image" --format '{{.Id}}' 2>/dev/null || true
}

pull_updates() {
  local service=""
  local image=""
  local after_id=""
  local updated_services=()
  declare -A image_refs=()
  declare -A before_ids=()

  for service in "${ghcr_services[@]}"; do
    image="$(service_image "$service")"
    if [[ -z "$image" ]]; then
      log "Could not resolve an image for compose service '${service}'."
      return 1
    fi
    if [[ "$image" != ghcr.io/* ]]; then
      log "Compose service '${service}' is not using a GHCR image: ${image}"
      return 1
    fi

    image_refs["$service"]="$image"
    before_ids["$service"]="$(local_image_id "$image")"
  done

  log "Checking GHCR for updated images..."
  if ! docker compose pull "${ghcr_services[@]}"; then
    log 'Failed to pull deployment images from GHCR.'
    return 1
  fi

  for service in "${ghcr_services[@]}"; do
    after_id="$(local_image_id "${image_refs[$service]}")"
    if [[ "${before_ids[$service]}" != "$after_id" ]]; then
      updated_services+=("$service")
    fi
  done

  if (( ${#updated_services[@]} == 0 )); then
    log 'No new GHCR images found.'
    return 1
  fi

  log "New images detected for: ${updated_services[*]}"
  return 0
}

restart_stack() {
  log 'Stopping deployment stack...'
  docker compose down

  log 'Starting deployment stack...'
  docker compose up -d
}

log "Watching GHCR deployment images every ${interval_minutes} minute(s)."

while true; do
  if pull_updates; then
    restart_stack
  fi

  log "Sleeping for ${interval_minutes} minute(s)..."
  sleep "$sleep_seconds"
done
