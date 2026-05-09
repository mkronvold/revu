#!/bin/sh

set -eu

BACKUP_ARCHIVE_DIR="${BACKUP_ARCHIVE_DIR:-/var/lib/revu/backups/archive}"
BACKUP_HANDOFF_DIR="${BACKUP_HANDOFF_DIR:-/var/lib/revu/backups/handoff}"
BACKUP_DOWNLOADS_DIR="${BACKUP_DOWNLOADS_DIR:-${BACKUP_HANDOFF_DIR}/downloads}"
BACKUP_UPLOADS_DIR="${BACKUP_UPLOADS_DIR:-${BACKUP_HANDOFF_DIR}/uploads}"
BACKUP_RESTORES_DIR="${BACKUP_RESTORES_DIR:-${BACKUP_HANDOFF_DIR}/restores}"
BACKUP_DOWNLOAD_URL="${BACKUP_DOWNLOAD_URL:-http://api:4000/api/v1/admin/backups/export}"
BACKUP_RESTORE_URL="${BACKUP_RESTORE_URL:-http://api:4000/api/v1/admin/backups/restore}"
BACKUP_FILE_PREFIX="${BACKUP_FILE_PREFIX:-revu-backup}"
BACKUP_FILE_EXTENSION="${BACKUP_FILE_EXTENSION:-json}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
BACKUP_SCHEDULE_UTC="${BACKUP_SCHEDULE_UTC:-02:00}"
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
  mkdir -p "$BACKUP_ARCHIVE_DIR" "$BACKUP_DOWNLOADS_DIR" "$BACKUP_UPLOADS_DIR" "$BACKUP_RESTORES_DIR"
}

sanitize_id() {
  printf '%s' "${1:-}" | tr -cs 'A-Za-z0-9._-' '-'
}

latest_file_in_dir() {
  find "$1" -maxdepth 1 -type f -printf '%T@ %p\n' 2>/dev/null | sort -nr | sed -n '1{s/^[^ ]* //;p;}'
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
  if [ "$BACKUP_RETENTION_DAYS" -lt 0 ] 2>/dev/null; then
    log "Skipping retention pruning because BACKUP_RETENTION_DAYS=${BACKUP_RETENTION_DAYS} is negative."
    return
  fi

  find "$BACKUP_ARCHIVE_DIR" -maxdepth 1 -type f -mtime +"$BACKUP_RETENTION_DAYS" -print -delete 2>/dev/null |
    while IFS= read -r removed; do
      [ -n "$removed" ] && log "Pruned expired backup: $removed"
    done
}

backup_now() {
  ensure_dirs

  backup_name="${1:-${BACKUP_FILE_PREFIX}-$(filename_timestamp).${BACKUP_FILE_EXTENSION}}"
  case "$backup_name" in
    /*) destination="$backup_name" ;;
    *) destination="${BACKUP_ARCHIVE_DIR}/$backup_name" ;;
  esac

  partial="${destination}.partial"
  log "Downloading backup from ${BACKUP_DOWNLOAD_URL} to ${destination}"
  node /opt/revu/scripts/backup-http.mjs download "$BACKUP_DOWNLOAD_URL" "$partial"
  mv "$partial" "$destination"
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
  log "Restore completed; receipt copy stored at ${receipt_path}"
  printf '%s\n' "$receipt_path"
}

seconds_until_next_run() {
  now_epoch="$(date -u +%s)"
  today="$(date -u +%Y-%m-%d)"
  scheduled_epoch="$(date -u -d "${today} ${BACKUP_SCHEDULE_UTC}" +%s)"

  if [ "$scheduled_epoch" -le "$now_epoch" ]; then
    scheduled_epoch="$(date -u -d "${today} ${BACKUP_SCHEDULE_UTC} +1 day" +%s)"
  fi

  printf '%s\n' "$((scheduled_epoch - now_epoch))"
}

run_scheduler() {
  ensure_dirs
  log "Backup scheduler armed for ${BACKUP_SCHEDULE_UTC} UTC daily with ${BACKUP_RETENTION_DAYS}-day retention."

  while true; do
    sleep_seconds="$(seconds_until_next_run)"
    log "Sleeping ${sleep_seconds} second(s) until the next scheduled backup."
    sleep "$sleep_seconds"

    if ! backup_now >/dev/null; then
      log 'Scheduled backup failed; retrying on the next daily window.'
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
