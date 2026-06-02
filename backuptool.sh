#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

readonly backup_mount_target="/host-destination"
readonly backup_service="backup"
readonly backup_entrypoint_path="/opt/revu/scripts/backup-entrypoint.sh"

log_error() {
  printf '%s\n' "$*" >&2
}

usage() {
  cat <<'EOF'
Usage:
  ./backuptool.sh list
  ./backuptool.sh delete <backup-file|latest> [more-files...]
  ./backuptool.sh preserve [backup-file|latest] [destination-dir]
  ./backuptool.sh show-config
  ./backuptool.sh set-config [--autobackup on|off] [--schedule 1hr|3hr|6hr|12hr|daily|weekly] [--keep COUNT]
  ./backuptool.sh config show
  ./backuptool.sh config set [--autobackup on|off] [--schedule 1hr|3hr|6hr|12hr|daily|weekly] [--keep COUNT]
EOF
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    log_error 'docker is required to manage backups.'
    exit 1
  fi
}

backup_container_running() {
  [[ -n "$(docker compose ps -q "$backup_service" 2>/dev/null)" ]]
}

run_backup_command() {
  if backup_container_running; then
    docker compose exec -T "$backup_service" /bin/sh "$backup_entrypoint_path" "$@"
  else
    docker compose run --rm --no-deps "$backup_service" "$@"
  fi
}

run_preserve_command() {
  local destination_dir="$1"
  shift

  mkdir -p -- "$destination_dir"
  destination_dir="$(cd "$destination_dir" && pwd -P)"

  docker compose run --rm --no-deps -v "${destination_dir}:${backup_mount_target}" "$backup_service" preserve-copy "$@" "$backup_mount_target"
}

normalize_autobackup_value() {
  local raw_value="$1"

  case "${raw_value,,}" in
    1|true|yes|on|enabled)
      printf 'true\n'
      ;;
    0|false|no|off|disabled)
      printf 'false\n'
      ;;
    *)
      log_error "Invalid --autobackup value: ${raw_value}. Use on/off, true/false, or enabled/disabled."
      exit 1
      ;;
  esac
}

build_config_patch() {
  local autobackup_value="${1:-}"
  local schedule_value="${2:-}"
  local keep_value="${3:-}"

  node - "$autobackup_value" "$schedule_value" "$keep_value" <<'NODE'
const [autobackupRaw, scheduleRaw, keepRaw] = process.argv.slice(2);
const supportedSchedules = new Set(["1hr", "3hr", "6hr", "12hr", "daily", "weekly"]);
const patch = {};

if (autobackupRaw) {
  patch.automaticBackupsEnabled = autobackupRaw === "true";
}

if (scheduleRaw) {
  if (!supportedSchedules.has(scheduleRaw)) {
    console.error(`Invalid schedule: ${scheduleRaw}. Use one of ${Array.from(supportedSchedules).join(", ")}.`);
    process.exit(1);
  }
  patch.schedule = scheduleRaw;
}

if (keepRaw) {
  const parsed = Number.parseInt(keepRaw, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    console.error(`Invalid --keep value: ${keepRaw}. Use a positive integer.`);
    process.exit(1);
  }
  patch.retentionCount = parsed;
}

if (Object.keys(patch).length === 0) {
  console.error("Provide at least one of --autobackup, --schedule, or --keep.");
  process.exit(1);
}

process.stdout.write(JSON.stringify(patch));
NODE
}

show_config_command() {
  run_backup_command show-config
}

set_config_command() {
  local autobackup_value=""
  local schedule_value=""
  local keep_value=""

  while (($# > 0)); do
    case "$1" in
      --autobackup)
        if (($# < 2)); then
          log_error 'Missing value for --autobackup.'
          exit 1
        fi
        autobackup_value="$(normalize_autobackup_value "$2")"
        shift 2
        ;;
      --schedule|--how-often)
        if (($# < 2)); then
          log_error 'Missing value for --schedule.'
          exit 1
        fi
        schedule_value="$2"
        shift 2
        ;;
      --keep|--retention-count)
        if (($# < 2)); then
          log_error 'Missing value for --keep.'
          exit 1
        fi
        keep_value="$2"
        shift 2
        ;;
      help|-h|--help)
        usage
        exit 0
        ;;
      *)
        log_error "Unknown set-config option: $1"
        usage
        exit 1
        ;;
    esac
  done

  patch_json="$(build_config_patch "$autobackup_value" "$schedule_value" "$keep_value")"
  run_backup_command set-config "$patch_json"
}

preserve_command() {
  local backup_ref="${1:-latest}"
  local destination_dir="${2:-$(pwd -P)}"
  local output=""
  local container_destination=""

  output="$(run_preserve_command "$destination_dir" "$backup_ref")"
  printf '%s\n' "$output" | sed '$d'
  container_destination="$(printf '%s\n' "$output" | tail -n 1)"
  printf '%s\n' "${container_destination/${backup_mount_target}/${destination_dir}}"
}

main() {
  case "${1:-help}" in
    list)
      require_docker
      shift
      run_backup_command list-archive "$@"
      ;;
    delete)
      require_docker
      shift
      if (($# == 0)); then
        log_error 'Usage: ./backuptool.sh delete <backup-file|latest> [more-files...]'
        exit 1
      fi
      run_backup_command delete-archive "$@"
      ;;
    preserve)
      require_docker
      shift
      preserve_command "$@"
      ;;
    show-config)
      require_docker
      shift
      show_config_command "$@"
      ;;
    set-config)
      require_docker
      shift
      set_config_command "$@"
      ;;
    config)
      require_docker
      shift
      case "${1:-show}" in
        show)
          shift
          show_config_command "$@"
          ;;
        set)
          shift
          set_config_command "$@"
          ;;
        *)
          log_error "Unknown config subcommand: ${1:-}"
          usage
          exit 1
          ;;
      esac
      ;;
    help|-h|--help)
      usage
      ;;
    *)
      log_error "Unknown command: $1"
      usage
      exit 1
      ;;
  esac
}

main "$@"
