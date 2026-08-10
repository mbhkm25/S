#!/usr/bin/env bash
set -Eeuo pipefail

APP_REPO="${APP_REPO:-/opt/sanad-app}"
WEB_ROOT="${WEB_ROOT:-/var/www/app.sanadflow.com/html}"
SHARED_ROOT="${SHARED_ROOT:-/var/www/app.sanadflow.com/shared}"
DOWNLOADS_ROOT="${DOWNLOADS_ROOT:-$SHARED_ROOT/downloads}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/sanad-app}"
HEALTH_URL="${HEALTH_URL:-https://app.sanadflow.com}"
EXPECTED_SHA="${EXPECTED_SHA:-${1:-}}"
LOCK_FILE="${LOCK_FILE:-/var/lock/sanad-production-deploy.lock}"
KEEP_BACKUPS="${KEEP_BACKUPS:-10}"

log() { printf '[sanad-deploy] %s\n' "$*"; }
fail() { printf '[sanad-deploy] ERROR: %s\n' "$*" >&2; exit 1; }

[[ "$(id -u)" -eq 0 ]] || fail "Run as root or through approved sudo."
command -v git >/dev/null || fail "git is required"
command -v npm >/dev/null || fail "npm is required"
command -v rsync >/dev/null || fail "rsync is required"
command -v curl >/dev/null || fail "curl is required"
command -v nginx >/dev/null || fail "nginx is required"
command -v flock >/dev/null || fail "flock is required"

exec 9>"$LOCK_FILE"
flock -n 9 || fail "Another production deployment is already running."

[[ -d "$APP_REPO/.git" ]] || fail "Repository not found at $APP_REPO"
mkdir -p "$WEB_ROOT" "$DOWNLOADS_ROOT" "$BACKUP_ROOT"

cd "$APP_REPO"
[[ -z "$(git status --porcelain)" ]] || fail "Server repository has uncommitted changes."

git fetch --prune origin main
git checkout main
git reset --keep origin/main

CURRENT_SHA="$(git rev-parse HEAD)"
if [[ -n "$EXPECTED_SHA" && "$CURRENT_SHA" != "$EXPECTED_SHA" ]]; then
  fail "Expected commit $EXPECTED_SHA but server resolved $CURRENT_SHA"
fi

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="$BACKUP_ROOT/${TIMESTAMP}-${CURRENT_SHA:0:12}"
STAGING_DIR="$(mktemp -d /tmp/sanad-dist.XXXXXX)"
HEALTH_BODY="$(mktemp /tmp/sanad-health.XXXXXX)"
DEPLOY_STARTED=0

restore_downloads_link() {
  rm -rf "$WEB_ROOT/downloads"
  ln -s ../shared/downloads "$WEB_ROOT/downloads"
}

rollback() {
  local exit_code=$?
  rm -rf "$STAGING_DIR" "$HEALTH_BODY"
  if [[ $exit_code -ne 0 && $DEPLOY_STARTED -eq 1 && -d "$BACKUP_DIR" ]]; then
    log "Deployment failed; restoring $BACKUP_DIR"
    rsync -a --delete "$BACKUP_DIR/" "$WEB_ROOT/" || true
    restore_downloads_link || true
    chown -R www-data:www-data "$WEB_ROOT" || true
    nginx -t && systemctl reload nginx || true
  fi
  exit "$exit_code"
}
trap rollback EXIT

log "Installing locked dependencies"
npm ci
log "Running TypeScript checks"
npm run lint
log "Checking application routes"
npm run check:routes
log "Building production PWA"
npm run build
[[ -f dist/index.html ]] || fail "dist/index.html was not generated"

log "Preparing staging copy"
rsync -a --delete dist/ "$STAGING_DIR/"

log "Backing up current production files to $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"
rsync -a "$WEB_ROOT/" "$BACKUP_DIR/"
DEPLOY_STARTED=1

log "Publishing commit $CURRENT_SHA"
rsync -a --delete "$STAGING_DIR/" "$WEB_ROOT/"
printf '%s\n' "$CURRENT_SHA" > "$WEB_ROOT/.sanad-release"
printf '%s\n' "$TIMESTAMP" > "$WEB_ROOT/.sanad-deployed-at"
chown -R www-data:www-data "$WEB_ROOT"
find "$WEB_ROOT" -type d -exec chmod 755 {} +
find "$WEB_ROOT" -type f -exec chmod 644 {} +

log "Restoring shared Android download path"
restore_downloads_link

nginx -t
systemctl reload nginx

log "Running production health check"
HTTP_CODE="$(curl --silent --show-error --location --max-time 30 --output "$HEALTH_BODY" --write-out '%{http_code}' "$HEALTH_URL")"
[[ "$HTTP_CODE" =~ ^[23][0-9][0-9]$ ]] || fail "Health check returned HTTP $HTTP_CODE"
grep -Eqi '<!doctype html|<html' "$HEALTH_BODY" || fail "Health response is not an HTML application"

if [[ -f "$DOWNLOADS_ROOT/sanad-latest.apk" ]]; then
  DOWNLOAD_HTTP_CODE="$(curl --silent --show-error --location --head --max-time 30 --output /dev/null --write-out '%{http_code}' "$HEALTH_URL/downloads/sanad-latest.apk")"
  [[ "$DOWNLOAD_HTTP_CODE" =~ ^[23][0-9][0-9]$ ]] || fail "APK download health check returned HTTP $DOWNLOAD_HTTP_CODE"
fi

# The web deployment is complete at this point. Push-worker deployment has its own rollback,
# so a worker failure must not roll the healthy web release backwards.
DEPLOY_STARTED=0
rm -rf "$STAGING_DIR" "$HEALTH_BODY"

if [[ -f "$APP_REPO/scripts/deploy-push-worker.sh" ]]; then
  log "Checking for staged push-worker credentials/runtime rollout"
  /bin/bash "$APP_REPO/scripts/deploy-push-worker.sh" "$CURRENT_SHA"
fi

log "Pruning old backups; keeping $KEEP_BACKUPS"
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
  | sort -nr \
  | awk -v keep="$KEEP_BACKUPS" 'NR > keep {sub(/^[^ ]+ /, ""); print}' \
  | xargs -r rm -rf

trap - EXIT
log "Production deployment succeeded: $CURRENT_SHA"
