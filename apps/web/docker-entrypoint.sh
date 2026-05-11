#!/bin/sh

set -eu

config_path="/usr/share/nginx/html/env-config.js"
company_name="${VITE_COMPANY_NAME:-Your Company}"
escaped_company_name="$(printf '%s' "$company_name" | sed 's/\\/\\\\/g; s/"/\\"/g')"
revision="${APP_REVISION:-}"
escaped_revision="$(printf '%s' "$revision" | sed 's/\\/\\\\/g; s/"/\\"/g')"
question_set_status_enabled="${VITE_ENABLE_QUESTION_SET_STATUS:-false}"
auto_refresh_interval_ms="${VITE_AUTO_REFRESH_INTERVAL_MS:-60000}"

case "$(printf '%s' "$question_set_status_enabled" | tr '[:upper:]' '[:lower:]')" in
  1|true|yes|on)
    question_set_status_enabled=true
    ;;
  *)
    question_set_status_enabled=false
    ;;
esac

case "$auto_refresh_interval_ms" in
  ''|*[!0-9]*)
    auto_refresh_interval_ms=60000
    ;;
esac

if [ "$auto_refresh_interval_ms" -lt 1 ]; then
  auto_refresh_interval_ms=60000
fi

cat > "$config_path" <<EOF
window.__REVU_CONFIG__ = Object.freeze({
  companyName: "${escaped_company_name}",
  revision: "${escaped_revision}",
  questionSetStatusEnabled: ${question_set_status_enabled},
  autoRefreshIntervalMs: ${auto_refresh_interval_ms},
});
EOF
