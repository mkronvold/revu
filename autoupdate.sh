#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

readonly default_interval_minutes=30
readonly no_updates_exit_code=10
readonly ghcr_services=(api web)
readonly manifest_accept_header='application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json'
readonly docker_config_path="${DOCKER_CONFIG:-$HOME/.docker}/config.json"

if ! command -v docker >/dev/null 2>&1; then
  printf 'docker is required to monitor and update the deployment stack.\n' >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  printf 'curl is required to query GHCR for image metadata.\n' >&2
  exit 1
fi

one_shot=false
interval_minutes="$default_interval_minutes"

if (( $# > 1 )); then
  printf 'Usage: %s [interval-minutes]\n       %s --once\n' "$0" "$0" >&2
  exit 1
fi

case "${1:-}" in
  '')
    ;;
  --once)
    one_shot=true
    ;;
  *)
    interval_minutes="$1"
    if ! [[ "$interval_minutes" =~ ^[0-9]+$ ]] || (( interval_minutes <= 0 )); then
      printf 'Interval must be a positive number of minutes.\n' >&2
      exit 1
    fi
    ;;
esac

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

image_repository() {
  local image="$1"
  local repository="${image#ghcr.io/}"

  repository="${repository%@*}"
  if [[ "$repository" == *:* ]]; then
    repository="${repository%:*}"
  fi

  printf '%s\n' "$repository"
}

image_tag() {
  local image="$1"
  local name_with_tag="${image#ghcr.io/}"

  name_with_tag="${name_with_tag%@*}"
  if [[ "$name_with_tag" == *:* ]]; then
    printf '%s\n' "${name_with_tag##*:}"
    return 0
  fi

  printf 'latest\n'
}

image_digest() {
  local image="$1"

  if [[ "$image" != *@* ]]; then
    return 1
  fi

  printf '%s\n' "${image#*@}"
}

local_image_digest() {
  local image="$1"
  local repository="$2"

  docker image inspect "$image" --format '{{range .RepoDigests}}{{println .}}{{end}}' 2>/dev/null |
    awk -v repository="ghcr.io/${repository}@" 'index($0, repository) == 1 { sub(/^.*@/, "", $0); print; exit }'
}

response_status() {
  awk 'toupper($1) ~ /^HTTP\// { status=$2 } END { gsub(/\r/, "", status); print status }'
}

header_value() {
  local name="$1"

  awk -v name="$name" '
    BEGIN { IGNORECASE = 1 }
    {
      line = $0
      sub(/\r$/, "", line)
      if (line ~ "^" name ":") {
        value = substr(line, index(line, ":") + 1)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
        found = value
      }
    }
    END { print found }
  '
}

ghcr_credentials() {
  local auth_entry=""

  if [[ -n "${GHCR_USERNAME:-}" && -n "${GHCR_TOKEN:-}" ]]; then
    printf '%s:%s\n' "$GHCR_USERNAME" "$GHCR_TOKEN"
    return 0
  fi

  if [[ ! -f "$docker_config_path" ]]; then
    return 1
  fi

  auth_entry="$(tr -d '\n' < "$docker_config_path" | sed -n 's/.*"ghcr\.io"[[:space:]]*:[[:space:]]*{[^}]*"auth"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
  if [[ -z "$auth_entry" ]]; then
    return 1
  fi

  printf '%s' "$auth_entry" | base64 --decode 2>/dev/null || return 1
}

manifest_headers() {
  local manifest_url="$1"
  local bearer_token="${2:-}"
  local -a curl_args=(-sSIL -D - -o /dev/null -H "Accept: ${manifest_accept_header}")

  if [[ -n "$bearer_token" ]]; then
    curl_args+=(-H "Authorization: Bearer ${bearer_token}")
  fi

  curl "${curl_args[@]}" "$manifest_url" 2>/dev/null
}

fetch_registry_token() {
  local authenticate_header="$1"
  local realm=""
  local service=""
  local scope=""
  local credentials=""
  local response=""
  local token=""

  realm="$(printf '%s' "$authenticate_header" | sed -n 's/^[Bb]earer[[:space:]]\+.*realm="\([^"]*\)".*/\1/p')"
  service="$(printf '%s' "$authenticate_header" | sed -n 's/.*service="\([^"]*\)".*/\1/p')"
  scope="$(printf '%s' "$authenticate_header" | sed -n 's/.*scope="\([^"]*\)".*/\1/p')"

  if [[ -z "$realm" || -z "$service" || -z "$scope" ]]; then
    return 1
  fi

  credentials="$(ghcr_credentials || true)"
  if [[ -n "$credentials" ]]; then
    response="$(curl -sSL -u "$credentials" -G --data-urlencode "service=${service}" --data-urlencode "scope=${scope}" "$realm" 2>/dev/null)"
  else
    response="$(curl -sSL -G --data-urlencode "service=${service}" --data-urlencode "scope=${scope}" "$realm" 2>/dev/null)"
  fi

  token="$(printf '%s' "$response" | tr -d '\n' | sed -n 's/.*"token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
  if [[ -z "$token" ]]; then
    token="$(printf '%s' "$response" | tr -d '\n' | sed -n 's/.*"access_token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
  fi

  if [[ -z "$token" ]]; then
    return 1
  fi

  printf '%s\n' "$token"
}

remote_image_digest() {
  local image="$1"
  local pinned_digest=""
  local repository=""
  local tag=""
  local manifest_url=""
  local headers=""
  local status=""
  local authenticate_header=""
  local bearer_token=""
  local digest=""

  pinned_digest="$(image_digest "$image" || true)"
  if [[ -n "$pinned_digest" ]]; then
    printf '%s\n' "$pinned_digest"
    return 0
  fi

  repository="$(image_repository "$image")"
  tag="$(image_tag "$image")"
  manifest_url="https://ghcr.io/v2/${repository}/manifests/${tag}"
  headers="$(manifest_headers "$manifest_url")"
  status="$(printf '%s\n' "$headers" | response_status)"

  if [[ "$status" == "401" ]]; then
    authenticate_header="$(printf '%s\n' "$headers" | header_value 'WWW-Authenticate')"
    bearer_token="$(fetch_registry_token "$authenticate_header" || true)"
    if [[ -z "$bearer_token" ]]; then
      return 1
    fi

    headers="$(manifest_headers "$manifest_url" "$bearer_token")"
    status="$(printf '%s\n' "$headers" | response_status)"
  fi

  if [[ "$status" != "200" ]]; then
    return 1
  fi

  digest="$(printf '%s\n' "$headers" | header_value 'Docker-Content-Digest')"
  if [[ -z "$digest" ]]; then
    return 1
  fi

  printf '%s\n' "$digest"
}

check_for_updates() {
  local service=""
  local image=""
  local updated_services=()
  local repository=""
  local local_digest=""
  local remote_digest=""

  log 'Checking GHCR manifest digests for updated images...'

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

    repository="$(image_repository "$image")"
    local_digest="$(local_image_digest "$image" "$repository")"
    remote_digest="$(remote_image_digest "$image" || true)"

    if [[ -z "$remote_digest" ]]; then
      log "Failed to resolve the remote manifest digest for '${service}' (${image})."
      if [[ -z "${GHCR_TOKEN:-}" && ! -f "$docker_config_path" ]]; then
        log 'Set GHCR_USERNAME and GHCR_TOKEN if the package is private.'
      fi
      return 1
    fi

    if [[ -z "$local_digest" ]]; then
      updated_services+=("$service")
      continue
    fi

    if [[ "$local_digest" != "$remote_digest" ]]; then
      updated_services+=("$service")
    fi
  done

  if (( ${#updated_services[@]} == 0 )); then
    log 'No new GHCR images found.'
    return "$no_updates_exit_code"
  fi

  log "New images detected for: ${updated_services[*]}"
  pull_updates "${updated_services[@]}"
  return 0
}

pull_updates() {
  local services=("$@")

  if (( ${#services[@]} == 0 )); then
    return 0
  fi

  log "Pulling updated images for: ${services[*]}"
  docker compose pull "${services[@]}"
}

restart_stack() {
  log 'Stopping deployment stack...'
  docker compose down

  log 'Restarting deployment stack through up.sh so migrations stay aligned with manual startup.'
  bash ./up.sh
}

ensure_stack_running() {
  local -a expected_services=()
  local -a running_services=()
  local -a missing_services=()
  local -A running_lookup=()
  local service=""

  mapfile -t expected_services < <(docker compose config --services)
  mapfile -t running_services < <(docker compose ps --services --filter status=running)

  for service in "${running_services[@]}"; do
    [[ -n "$service" ]] || continue
    running_lookup["$service"]=1
  done

  for service in "${expected_services[@]}"; do
    [[ -n "$service" ]] || continue
    if [[ -z "${running_lookup[$service]:-}" ]]; then
      missing_services+=("$service")
    fi
  done

  if (( ${#missing_services[@]} == 0 )); then
    log 'Deployment stack is already running.'
    return 0
  fi

  log "Starting deployment stack before monitoring because these services are not running: ${missing_services[*]}"
  bash ./up.sh
}

wait_for_next_check() {
  local remaining_seconds="$sleep_seconds"
  local key=""

  if [[ ! -t 0 ]]; then
    sleep "$remaining_seconds"
    return 1
  fi

  while (( remaining_seconds > 0 )); do
    if IFS= read -r -s -n 1 -t 1 key; then
      if [[ "$key" == "r" || "$key" == "R" ]]; then
        log 'Manual refresh requested. Checking for updates now.'
        return 0
      fi
    fi

    (( remaining_seconds -= 1 ))
  done

  return 1
}

ensure_stack_running

if [[ "$one_shot" == true ]]; then
  log 'Running a single GHCR update check.'
  if check_for_updates; then
    restart_stack
  else
    status="$?"
    if (( status != no_updates_exit_code )); then
      exit "$status"
    fi
  fi
  exit 0
fi

log "Watching GHCR deployment images every ${interval_minutes} minute(s). Press r to refresh immediately."

while true; do
  if check_for_updates; then
    restart_stack
  else
    status="$?"
    if (( status != no_updates_exit_code )); then
      log 'Update check failed. Will retry on the next interval.'
    fi
  fi

  if [[ -t 0 ]]; then
    log "Waiting ${interval_minutes} minute(s) before the next check. Press r to refresh now."
  else
    log "Sleeping for ${interval_minutes} minute(s)..."
  fi
  if wait_for_next_check; then
    continue
  fi
done
