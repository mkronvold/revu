#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

readonly api_service="api"

log_error() {
  printf '%s\n' "$*" >&2
}

usage() {
  cat <<'EOF'
Usage:
  ./passwordtool.sh list
  ./passwordtool.sh reset <employee-id|username> [temporary-password]
  ./passwordtool.sh set <employee-id|username> <password|-> 
EOF
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    log_error 'docker is required to manage users.'
    exit 1
  fi
}

prompt_yes_no() {
  local prompt="$1"
  local reply=""

  if [[ ! -t 0 ]]; then
    return 1
  fi

  printf '%s [y/N] ' "$prompt" >&2
  read -r reply || return 1
  [[ "$reply" =~ ^[Yy]([Ee][Ss])?$ ]]
}

api_container_running() {
  [[ -n "$(docker compose ps -q "$api_service" 2>/dev/null)" ]]
}

run_api_node_command() {
  local action="$1"
  local employee_identifier="${2:-}"
  local password_value="${3:-}"
  local -a docker_api_command=(docker compose run --rm --no-deps "$api_service")

  if api_container_running; then
    docker_api_command=(docker compose exec -T "$api_service")
  fi

  "${docker_api_command[@]}" node --input-type=module - "$action" "$employee_identifier" "$password_value" <<'NODE'
import { createApiStore } from "./apps/api/dist/store.js";
import { closePool } from "./apps/api/dist/db.js";

const [action, employeeIdentifier = "", password = ""] = process.argv.slice(2);
const store = createApiStore();

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

async function listUsers() {
  const users = await store.listEmployees();
  for (const user of users) {
    console.log(
      `${user.id}\t${user.username}\t${user.role}\t${user.status}\tresetRequired=${user.passwordResetRequired ? "yes" : "no"}`,
    );
  }
}

async function resolveEmployee(identifier) {
  const needle = identifier.trim();
  const users = await store.listEmployees();

  if (isUuid(needle)) {
    const normalizedId = needle.toLowerCase();
    const exact = users.find((item) => item.id.toLowerCase() === normalizedId);
    if (!exact) {
      throw new Error(`Employee not found for id "${identifier}"`);
    }
    return exact;
  }

  const normalizedUsername = needle.toLowerCase();
  const byUsername = users.filter((item) => item.username.toLowerCase() === normalizedUsername);
  if (byUsername.length !== 1) {
    throw new Error(`Unable to find exactly one employee for "${identifier}"`);
  }

  return byUsername[0];
}

async function inspectEmployee(identifier) {
  const employee = await resolveEmployee(identifier);
  console.log(`${employee.id}\t${employee.username}\t${employee.status}`);
}

async function activateEmployee(identifier) {
  const employee = await resolveEmployee(identifier);
  if (employee.status === "active") {
    console.log(`Employee ${employee.username} (${employee.id}) is already active`);
    return;
  }

  await store.updateEmployee({ id: employee.id, role: "admin" }, employee.id, { status: "active" });
  console.log(`Activated ${employee.username} (${employee.id})`);
}

async function resetPassword(identifier, requestedPassword) {
  const employee = await resolveEmployee(identifier);
  const result = await store.resetPassword(employee.id, requestedPassword || undefined);
  console.log(
    `Reset password for ${employee.username} (${employee.id}) temporaryPassword=${result.temporaryPassword} passwordResetRequired=${result.passwordResetRequired ? "yes" : "no"}`,
  );
}

async function setPassword(identifier, nextPassword) {
  if (!nextPassword) {
    throw new Error("A password is required for the set command");
  }

  const employee = await resolveEmployee(identifier);
  const result = await store.setPassword(employee.id, nextPassword);
  console.log(
    `Set password for ${employee.username} (${employee.id}) passwordResetRequired=${result.passwordResetRequired ? "yes" : "no"}`,
  );
}

try {
  if (action === "list") {
    await listUsers();
  } else if (action === "inspect") {
    await inspectEmployee(employeeIdentifier);
  } else if (action === "activate") {
    await activateEmployee(employeeIdentifier);
  } else if (action === "reset") {
    await resetPassword(employeeIdentifier, password);
  } else if (action === "set") {
    await setPassword(employeeIdentifier, password);
  } else {
    throw new Error(`Unsupported action: ${action}`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
} finally {
  await closePool();
}
NODE
}

inspect_employee() {
  local identifier="$1"
  run_api_node_command inspect "$identifier"
}

activate_employee() {
  local identifier="$1"
  run_api_node_command activate "$identifier"
}

prepare_employee_for_password_change() {
  local identifier="$1"
  local employee_info=""
  local employee_id=""
  local username=""
  local status=""

  employee_info="$(inspect_employee "$identifier")"
  IFS=$'\t' read -r employee_id username status <<<"$employee_info"

  if [[ "$status" != "inactive" ]]; then
    return 0
  fi

  log_error "Warning: ${username} (${employee_id}) is inactive."
  if [[ -t 0 ]]; then
    if prompt_yes_no "Make ${username} active before changing the password?"; then
      activate_employee "$employee_id" >&2
    fi
  else
    log_error "Proceeding without reactivating ${username} because stdin is not interactive."
  fi
}

read_password_from_input() {
  local password=""

  if [[ -t 0 ]]; then
    read -r -s -p "Password: " password
    printf '\n' >&2
  else
    IFS= read -r password
  fi

  printf '%s\n' "$password"
}

main() {
  require_docker

  case "${1:-help}" in
    list)
      shift
      if (($# > 0)); then
        log_error 'Usage: ./passwordtool.sh list'
        exit 1
      fi
      run_api_node_command list
      ;;
    reset)
      shift
      if (($# < 1 || $# > 2)); then
        log_error 'Usage: ./passwordtool.sh reset <employee-id|username> [temporary-password]'
        exit 1
      fi
      prepare_employee_for_password_change "$1"
      run_api_node_command reset "$1" "${2:-}"
      ;;
    set)
      shift
      if (($# != 2)); then
        log_error 'Usage: ./passwordtool.sh set <employee-id|username> <password|->'
        exit 1
      fi

      prepare_employee_for_password_change "$1"

      local password="$2"
      if [[ "$password" == "-" ]]; then
        password="$(read_password_from_input)"
      fi

      run_api_node_command set "$1" "$password"
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
