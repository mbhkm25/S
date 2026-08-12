#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
command -v flutter >/dev/null || { echo "Flutter غير مثبت أو غير موجود في PATH" >&2; exit 1; }
command -v adb >/dev/null || { echo "ADB غير مثبت أو غير موجود في PATH" >&2; exit 1; }

if [[ ! -f android/app/build.gradle.kts ]]; then
  bash tool/bootstrap_android.sh
fi

mapfile -t devices < <(adb devices | awk 'NR > 1 && $2 == "device" {print $1}')
device_id="${1:-}"
if [[ -z "$device_id" ]]; then
  if [[ "${#devices[@]}" -eq 1 ]]; then
    device_id="${devices[0]}"
  else
    echo "الأجهزة المتاحة:" >&2
    flutter devices >&2
    echo "شغّل: bash tool/run_on_device.sh DEVICE_ID" >&2
    exit 1
  fi
fi

echo "تشغيل سند المحلي على: $device_id"
echo "Hot Reload: اضغط r | Hot Restart: اضغط R | خروج: اضغط q"
exec flutter run --debug -d "$device_id" \
  --dart-define=SANAD_SUPABASE_URL=https://api.sanadflow.com
