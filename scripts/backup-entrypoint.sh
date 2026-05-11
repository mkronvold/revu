#!/bin/sh

set -eu

BACKUP_ARCHIVE_DIR="${BACKUP_ARCHIVE_DIR:-/var/lib/revu/backups/archive}"
BACKUP_HANDOFF_DIR="${BACKUP_HANDOFF_DIR:-/var/lib/revu/backups/handoff}"
BACKUP_CONFIG_DIR="${BACKUP_CONFIG_DIR:-/var/lib/revu/backups/config}"
BACKUP_STATUS_PATH="${BACKUP_STATUS_PATH:-/var/lib/revu/backups/config/status.json}"
BACKUP_DOWNLOADS_DIR="${BACKUP_DOWNLOADS_DIR:-${BACKUP_HANDOFF_DIR}/downloads}"
BACKUP_UPLOADS_DIR="${BACKUP_UPLOADS_DIR:-${BACKUP_HANDOFF_DIR}/uploads}"
BACKUP_RESTORES_DIR="${BACKUP_RESTORES_DIR:-${BACKUP_HANDOFF_DIR}/restores}"
BACKUP_DOWNLOAD_URL="${BACKUP_DOWNLOAD_URL:-http://api:4000/internal/backups/export}"
BACKUP_RESTORE_URL="${BACKUP_RESTORE_URL:-http://api:4000/internal/backups/restore}"
BACKUP_FILE_PREFIX="${BACKUP_FILE_PREFIX:-revu-backup}"
BACKUP_FILE_EXTENSION="${BACKUP_FILE_EXTENSION:-json}"
BACKUP_AUTOMATIC_ENABLED="${BACKUP_AUTOMATIC_ENABLED:-false}"
BACKUP_SCHEDULE="${BACKUP_SCHEDULE:-daily}"
BACKUP_RETENTION_COUNT="${BACKUP_RETENTION_COUNT:-${BACKUP_RETENTION_DAYS:-14}}"
BACKUP_RESTORE_MODE="${BACKUP_RESTORE_MODE:-replace}"
BACKUP_RESTORE_TARGET="${BACKUP_RESTORE_TARGET:-full}"

timestamp() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

filename_timestamp() {
  date -u +"%Y%m%dT%H%M%SZ"
}

log() {
  printf '[%s] %s\n' "$(timestamp)" "$*"
}

ensure_dirs() {
  mkdir -p "$BACKUP_ARCHIVE_DIR" "$BACKUP_DOWNLOADS_DIR" "$BACKUP_UPLOADS_DIR" "$BACKUP_RESTORES_DIR" "$BACKUP_CONFIG_DIR"
}

sanitize_id() {
  printf '%s' "${1:-}" | tr -cs 'A-Za-z0-9._-' '-'
}

latest_file_in_dir() {
  find "$1" -maxdepth 1 -type f -printf '%T@ %p\n' 2>/dev/null | sort -nr | sed -n '1{s/^[^ ]* //;p;}'
}

default_status_json() {
  node - "$BACKUP_AUTOMATIC_ENABLED" "$BACKUP_SCHEDULE" "$BACKUP_RETENTION_COUNT" <<'NODE'
const [enabledRaw, scheduleRaw, retentionRaw] = process.argv.slice(2);
const supportedSchedules = new Set(["1hr", "3hr", "6hr", "12hr", "daily", "weekly"]);
const automaticBackupsEnabled = ["1", "true", "yes", "on"].includes(String(enabledRaw ?? "").toLowerCase());
const retentionCount = Number.parseInt(String(retentionRaw ?? ""), 10);

process.stdout.write(
  JSON.stringify({
    automaticBackupsEnabled,
    schedule: supportedSchedules.has(scheduleRaw) ? scheduleRaw : "daily",
    retentionCount: Number.isInteger(retentionCount) && retentionCount > 0 ? retentionCount : 14,
    lastBackupAt: null,
    lastRestoreAt: null,
  }),
);
NODE
}

read_status_json() {
  defaults_json="$(default_status_json)"
  node - "$BACKUP_STATUS_PATH" "$defaults_json" <<'NODE'
const fs = require("node:fs");

const [statusPath, defaultsJson] = process.argv.slice(2);
const supportedSchedules = new Set(["1hr", "3hr", "6hr", "12hr", "daily", "weekly"]);
const defaults = JSON.parse(defaultsJson);
let parsed = {};

try {
  if (statusPath && fs.existsSync(statusPath)) {
    parsed = JSON.parse(fs.readFileSync(statusPath, "utf8"));
  }
} catch {
  parsed = {};
}

const nextStatus = { ...defaults };
if (typeof parsed.automaticBackupsEnabled === "boolean") {
  nextStatus.automaticBackupsEnabled = parsed.automaticBackupsEnabled;
} else if (typeof parsed.dailyBackupsEnabled === "boolean") {
  nextStatus.automaticBackupsEnabled = parsed.dailyBackupsEnabled;
}
if (typeof parsed.schedule === "string" && supportedSchedules.has(parsed.schedule)) {
  nextStatus.schedule = parsed.schedule;
}
if (typeof parsed.retentionCount === "number" && Number.isInteger(parsed.retentionCount) && parsed.retentionCount > 0) {
  nextStatus.retentionCount = parsed.retentionCount;
} else if (typeof parsed.retentionDays === "number" && Number.isInteger(parsed.retentionDays) && parsed.retentionDays > 0) {
  nextStatus.retentionCount = parsed.retentionDays;
}
if (typeof parsed.lastBackupAt === "string" && !Number.isNaN(new Date(parsed.lastBackupAt).valueOf())) {
  nextStatus.lastBackupAt = new Date(parsed.lastBackupAt).toISOString();
} else if (parsed.lastBackupAt === null) {
  nextStatus.lastBackupAt = null;
}
if (typeof parsed.lastRestoreAt === "string" && !Number.isNaN(new Date(parsed.lastRestoreAt).valueOf())) {
  nextStatus.lastRestoreAt = new Date(parsed.lastRestoreAt).toISOString();
} else if (parsed.lastRestoreAt === null) {
  nextStatus.lastRestoreAt = null;
}

process.stdout.write(JSON.stringify(nextStatus));
NODE
}

write_status_patch() {
  if [ -z "${BACKUP_STATUS_PATH:-}" ]; then
    return
  fi

  current_json="$(read_status_json)"
  node - "$BACKUP_STATUS_PATH" "$current_json" "${1:-{}}" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const [statusPath, currentJson, patchJson] = process.argv.slice(2);
const current = JSON.parse(currentJson);
const patch = JSON.parse(patchJson);
const nextStatus = {
  ...current,
  ...patch,
};

fs.mkdirSync(path.dirname(statusPath), { recursive: true });
fs.writeFileSync(statusPath, `${JSON.stringify(nextStatus, null, 2)}\n`, "utf8");
NODE
}

load_runtime_config() {
  status_json="$(read_status_json)"
  runtime_values="$(node - "$status_json" <<'NODE'
const [statusJson] = process.argv.slice(2);
const status = JSON.parse(statusJson);
process.stdout.write(
  [
    status.automaticBackupsEnabled ? "true" : "false",
    status.schedule,
    String(status.retentionCount),
    status.lastBackupAt ?? "",
  ].join("\n"),
);
NODE
)"

  runtime_automatic_backups_enabled="$(printf '%s\n' "$runtime_values" | sed -n '1p')"
  runtime_backup_schedule="$(printf '%s\n' "$runtime_values" | sed -n '2p')"
  runtime_retention_count="$(printf '%s\n' "$runtime_values" | sed -n '3p')"
  runtime_last_backup_at="$(printf '%s\n' "$runtime_values" | sed -n '4p')"
}

resolve_archive_source() {
  if [ "${1:-}" = "" ] || [ "${1:-}" = "latest" ]; then
    latest_file_in_dir "$BACKUP_ARCHIVE_DIR"
    return
  fi

  if [ -f "$1" ]; then
    printf '%s\n' "$1"
    return
  fi

  if [ -f "${BACKUP_ARCHIVE_DIR}/$1" ]; then
    printf '%s\n' "${BACKUP_ARCHIVE_DIR}/$1"
    return
  fi

  return 1
}

resolve_upload_source() {
  if [ -f "$1" ]; then
    printf '%s\n' "$1"
    return
  fi

  if [ -f "${BACKUP_UPLOADS_DIR}/$1" ]; then
    printf '%s\n' "${BACKUP_UPLOADS_DIR}/$1"
    return
  fi

  find "$BACKUP_UPLOADS_DIR" -type f -name "$(basename "$1")" -print 2>/dev/null | sort | tail -n 1
}

prune_retention() {
  if [ "${runtime_retention_count:-}" = "" ] || [ "$runtime_retention_count" -lt 1 ] 2>/dev/null; then
    log "Skipping retention pruning because BACKUP_RETENTION_COUNT=${runtime_retention_count:-unset} is invalid."
    return
  fi

  find "$BACKUP_ARCHIVE_DIR" -maxdepth 1 -type f -printf '%T@ %p\n' 2>/dev/null |
    sort -nr |
    awk "NR>${runtime_retention_count} { sub(/^[^ ]* /, \"\"); print }" |
    while IFS= read -r removed; do
      [ -n "$removed" ] || continue
      rm -f -- "$removed"
      log "Pruned expired backup: $removed"
    done
}

backup_now() {
  ensure_dirs
  load_runtime_config

  backup_name="${1:-${BACKUP_FILE_PREFIX}-$(filename_timestamp).${BACKUP_FILE_EXTENSION}}"
  case "$backup_name" in
    /*) destination="$backup_name" ;;
    *) destination="${BACKUP_ARCHIVE_DIR}/$backup_name" ;;
  esac

  partial="${destination}.partial"
  log "Downloading backup from ${BACKUP_DOWNLOAD_URL} to ${destination}"
  node /opt/revu/scripts/backup-http.mjs download "$BACKUP_DOWNLOAD_URL" "$partial"
  mv "$partial" "$destination"

  backed_up_at="$(timestamp)"
  write_status_patch "$(node - "$backed_up_at" <<'NODE'
const [lastBackupAt] = process.argv.slice(2);
process.stdout.write(JSON.stringify({ lastBackupAt }));
NODE
)"

  log "Backup saved to ${destination}"
  prune_retention
  printf '%s\n' "$destination"
}

download_handoff() {
  ensure_dirs

  source_path="$(resolve_archive_source "${1:-latest}")"
  if [ -z "$source_path" ] || [ ! -f "$source_path" ]; then
    printf 'No archived backup is available for download handoff.\n' >&2
    exit 1
  fi

  request_id="$(sanitize_id "${2:-download-$(filename_timestamp)}")"
  destination_dir="${BACKUP_DOWNLOADS_DIR}/${request_id}"
  destination_path="${destination_dir}/$(basename "$source_path")"

  mkdir -p "$destination_dir"
  cp "$source_path" "$destination_path"
  log "Prepared download handoff at ${destination_path}"
  printf '%s\n' "$destination_path"
}

upload_handoff() {
  ensure_dirs

  if [ "${1:-}" = "" ]; then
    printf 'Usage: upload-handoff <source-file> [request-id]\n' >&2
    exit 1
  fi

  if [ ! -f "$1" ]; then
    printf 'Upload handoff source does not exist: %s\n' "$1" >&2
    exit 1
  fi

  request_id="$(sanitize_id "${2:-upload-$(filename_timestamp)}")"
  destination_dir="${BACKUP_UPLOADS_DIR}/${request_id}"
  destination_path="${destination_dir}/$(basename "$1")"

  mkdir -p "$destination_dir"
  cp "$1" "$destination_path"
  log "Prepared upload handoff at ${destination_path}"
  printf '%s\n' "$destination_path"
}

restore_execute() {
  ensure_dirs

  if [ "${1:-}" = "" ]; then
    printf 'Usage: restore-execute <backup-file> [target] [request-id]\n' >&2
    exit 1
  fi

  source_path="$(resolve_upload_source "$1")"
  if [ -z "$source_path" ] || [ ! -f "$source_path" ]; then
    printf 'Restore source does not exist: %s\n' "$1" >&2
    exit 1
  fi

  target="${2:-$BACKUP_RESTORE_TARGET}"
  request_id="$(sanitize_id "${3:-restore-$(filename_timestamp)}")"
  receipt_dir="${BACKUP_RESTORES_DIR}/${request_id}"
  receipt_path="${receipt_dir}/$(basename "$source_path")"

  mkdir -p "$receipt_dir"
  log "Executing ${BACKUP_RESTORE_MODE} restore for target ${target} using ${source_path}"
  node /opt/revu/scripts/backup-http.mjs restore "$BACKUP_RESTORE_URL" "$target" "$BACKUP_RESTORE_MODE" "$source_path"
  cp "$source_path" "$receipt_path"

  restored_at="$(timestamp)"
  write_status_patch "$(node - "$restored_at" <<'NODE'
const [lastRestoreAt] = process.argv.slice(2);
process.stdout.write(JSON.stringify({ lastRestoreAt }));
NODE
)"

  log "Restore completed; receipt copy stored at ${receipt_path}"
  printf '%s\n' "$receipt_path"
}

schedule_to_seconds() {
  case "$1" in
    1hr) printf '3600\n' ;;
    3hr) printf '10800\n' ;;
    6hr) printf '21600\n' ;;
    12hr) printf '43200\n' ;;
    daily) printf '86400\n' ;;
    weekly) printf '604800\n' ;;
    *) printf '86400\n' ;;
  esac
}

seconds_until_next_run() {
  interval_seconds="$(schedule_to_seconds "$runtime_backup_schedule")"
  if [ -z "${runtime_last_backup_at:-}" ]; then
    printf '0\n'
    return
  fi

  last_epoch="$(date -u -d "$runtime_last_backup_at" +%s 2>/dev/null || true)"
  if [ -z "$last_epoch" ]; then
    printf '0\n'
    return
  fi

  now_epoch="$(date -u +%s)"
  remaining="$((last_epoch + interval_seconds - now_epoch))"
  if [ "$remaining" -lt 0 ]; then
    remaining=0
  fi

  printf '%s\n' "$remaining"
}

run_scheduler() {
  ensure_dirs
  log "Backup scheduler started. Settings come from ${BACKUP_STATUS_PATH}."

  while true; do
    load_runtime_config

    if [ "$runtime_automatic_backups_enabled" != "true" ]; then
      sleep 60
      continue
    fi

    sleep_seconds="$(seconds_until_next_run)"
    if [ "$sleep_seconds" -gt 0 ]; then
      if [ "$sleep_seconds" -gt 60 ]; then
        sleep 60
      else
        sleep "$sleep_seconds"
      fi
      continue
    fi

    if ! backup_now >/dev/null; then
      log "Scheduled backup failed; retrying in 60 second(s)."
      sleep 60
      continue
    fi

    sleep 1
  done
}

usage() {
  cat <<'EOF'
Usage: backup-entrypoint.sh [scheduler|backup-now|download-handoff|upload-handoff|restore-execute]
EOF
}

command="${1:-scheduler}"
shift || true

case "$command" in
  scheduler)
    run_scheduler "$@"
    ;;
  backup-now)
    backup_now "$@"
    ;;
  download-handoff)
    download_handoff "$@"
    ;;
  upload-handoff)
    upload_handoff "$@"
    ;;
  restore-execute)
    restore_execute "$@"
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
