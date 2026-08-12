#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
command -v flutter >/dev/null || { echo "Flutter غير مثبت أو غير موجود في PATH" >&2; exit 1; }
command -v python3 >/dev/null || { echo "Python 3 غير مثبت أو غير موجود في PATH" >&2; exit 1; }

flutter create --platforms=android --org com.sanadflow --project-name sanad_local .
python3 tool/configure_android.py
install -m 644 tool/android/MainActivity.kt \
  android/app/src/main/kotlin/com/sanadflow/sanad_local/MainActivity.kt
bash tool/prepare_assets.sh
flutter pub get

echo "SANAD Local Android workspace is ready."
