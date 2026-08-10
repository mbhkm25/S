#!/usr/bin/env bash
set -euo pipefail

required="${SANAD_FIREBASE_REQUIRED:-false}"
payload="${SANAD_FIREBASE_GOOGLE_SERVICES_JSON_BASE64:-}"
target="android/app/google-services.json"

if [[ -z "$payload" ]]; then
  rm -f "$target"
  if [[ "$required" == "true" ]]; then
    echo "SANAD_FIREBASE_GOOGLE_SERVICES_JSON_BASE64 is required for a push-ready production APK." >&2
    exit 1
  fi
  echo "Firebase Android config is not available; continuing with Native Push disabled for this non-production build."
  exit 0
fi

mkdir -p "$(dirname "$target")"
printf '%s' "$payload" | base64 --decode > "$target"
chmod 600 "$target"
test -s "$target"

node - <<'NODE'
const fs = require('fs');
const path = 'android/app/google-services.json';
const config = JSON.parse(fs.readFileSync(path, 'utf8'));
if (!config.project_info?.project_id || !config.project_info?.project_number) {
  throw new Error('Firebase project_info is incomplete');
}
const clients = Array.isArray(config.client) ? config.client : [];
const client = clients.find((entry) => entry?.client_info?.android_client_info?.package_name === 'com.sanadflow.verify');
if (!client) throw new Error('google-services.json does not contain com.sanadflow.verify');
if (!client.client_info?.mobilesdk_app_id) throw new Error('Firebase mobilesdk_app_id is missing');
const hasApiKey = Array.isArray(client.api_key) && client.api_key.some((entry) => typeof entry?.current_key === 'string' && entry.current_key.length > 10);
if (!hasApiKey) throw new Error('Firebase API key is missing');
console.log(`Firebase Android config verified for ${client.client_info.android_client_info.package_name} / ${config.project_info.project_id}`);
NODE
