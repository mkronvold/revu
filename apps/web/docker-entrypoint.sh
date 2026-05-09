#!/bin/sh

set -eu

config_path="/usr/share/nginx/html/env-config.js"
company_name="${VITE_COMPANY_NAME:-Your Company}"
escaped_company_name="$(printf '%s' "$company_name" | sed 's/\\/\\\\/g; s/"/\\"/g')"

cat > "$config_path" <<EOF
window.__REVU_CONFIG__ = Object.freeze({
  companyName: "${escaped_company_name}",
});
EOF
