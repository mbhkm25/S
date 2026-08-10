#!/usr/bin/env bash
set -Eeuo pipefail

APP_REPO="${APP_REPO:-/opt/sanad-app}"
SECRETS_DIR="${PUSH_WORKER_SECRETS_DIR:-/opt/sanad-secrets}"
ENV_FILE="$SECRETS_DIR/push-worker.env"
EXPECTED_SHA="${1:-}"
EXPECTED_PROJECT_ID="sanad-prod-1786344160"
EXPECTED_CLIENT_EMAIL="fcm-sender@sanad-prod-1786344160.iam.gserviceaccount.com"
IMAGE_TAG="sanad-push-worker:${EXPECTED_SHA:0:12}"

log() { printf '[sanad-push-worker-deploy] %s\n' "$*"; }
fail() { printf '[sanad-push-worker-deploy] ERROR: %s\n' "$*" >&2; exit 1; }

[[ "$(id -u)" -eq 0 ]] || fail "root_required"
[[ "$EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "full_commit_sha_required"
command -v docker >/dev/null || fail "docker_required"
command -v node >/dev/null || fail "node_required"
command -v base64 >/dev/null || fail "base64_required"
[[ -d "$APP_REPO/services/push-worker" ]] || fail "push_worker_source_missing"

SUDO_DEPLOY_USER="${SUDO_USER:-}"
SUDO_DEPLOY_UID="${SUDO_UID:-}"
[[ -n "$SUDO_DEPLOY_USER" && "$SUDO_DEPLOY_USER" != "root" && "$SUDO_DEPLOY_UID" =~ ^[0-9]+$ ]] || fail "approved_sudo_context_required"
DEPLOY_HOME="$(getent passwd "$SUDO_DEPLOY_USER" | cut -d: -f6)"
[[ -n "$DEPLOY_HOME" && -d "$DEPLOY_HOME" ]] || fail "deploy_home_not_found"
STAGE_DIR="$DEPLOY_HOME/.sanad-deploy-staging"
STAGED_B64="$STAGE_DIR/firebase-service-account.json.b64"

if [[ ! -e "$STAGED_B64" ]]; then
  log "No staged Firebase credentials; keeping current push worker unchanged."
  exit 0
fi
[[ -f "$STAGED_B64" && ! -L "$STAGED_B64" ]] || fail "invalid_staged_credential_file"
[[ "$(stat -c '%u' "$STAGED_B64")" == "$SUDO_DEPLOY_UID" ]] || fail "staged_credential_owner_mismatch"
STAGE_MODE="$(stat -c '%a' "$STAGED_B64")"
[[ "$STAGE_MODE" == "600" ]] || fail "staged_credential_mode_must_be_600"

TMP_ROOT="$(mktemp -d /tmp/sanad-push-worker-deploy.XXXXXX)"
SA_JSON="$TMP_ROOT/service-account.json"
FCM_FRAGMENT="$TMP_ROOT/fcm.env"
CURRENT_FRAGMENT="$TMP_ROOT/current.env"
NEW_ENV="$TMP_ROOT/push-worker.env"
OLD_CONTAINER=""
BACKUP_CONTAINER=""
NEW_STARTED=0

cleanup() {
  local rc=$?
  rm -rf "$TMP_ROOT"
  if [[ $rc -ne 0 && $NEW_STARTED -eq 1 && -n "$OLD_CONTAINER" ]]; then
    log "New push worker failed; restoring previous container."
    docker rm -f "$OLD_CONTAINER" >/dev/null 2>&1 || true
    if [[ -n "$BACKUP_CONTAINER" ]]; then
      docker rename "$BACKUP_CONTAINER" "$OLD_CONTAINER" >/dev/null 2>&1 || true
      docker start "$OLD_CONTAINER" >/dev/null 2>&1 || true
    fi
  fi
  exit "$rc"
}
trap cleanup EXIT

umask 077
base64 --decode "$STAGED_B64" > "$SA_JSON" || fail "service_account_base64_decode_failed"

node - "$SA_JSON" "$FCM_FRAGMENT" "$EXPECTED_PROJECT_ID" "$EXPECTED_CLIENT_EMAIL" <<'NODE'
const fs = require('node:fs');
const [jsonPath, outPath, expectedProject, expectedEmail] = process.argv.slice(2);
let value;
try { value = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); } catch { process.exit(20); }
if (value?.type !== 'service_account') process.exit(21);
if (value?.project_id !== expectedProject) process.exit(22);
if (value?.client_email !== expectedEmail) process.exit(23);
if (typeof value?.private_key !== 'string' || !value.private_key.includes('-----BEGIN PRIVATE KEY-----') || !value.private_key.includes('-----END PRIVATE KEY-----')) process.exit(24);
const oneLineKey = value.private_key.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n');
fs.writeFileSync(outPath,
  `FIREBASE_PROJECT_ID=${value.project_id}\n` +
  `FIREBASE_CLIENT_EMAIL=${value.client_email}\n` +
  `FIREBASE_PRIVATE_KEY=${oneLineKey}\n`,
  { mode: 0o600 }
);
NODE
[[ $? -eq 0 ]] || fail "service_account_validation_failed"

mapfile -t MATCHING_CONTAINERS < <(
  for cid in $(docker ps -q); do
    if docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$cid" 2>/dev/null | grep -q '^PUSH_WORKER_INSTANCE_ID='; then
      docker inspect -f '{{.Name}}' "$cid" | sed 's#^/##'
    fi
  done
)
[[ ${#MATCHING_CONTAINERS[@]} -eq 1 ]] || fail "expected_exactly_one_live_push_worker_found_${#MATCHING_CONTAINERS[@]}"
OLD_CONTAINER="${MATCHING_CONTAINERS[0]}"
log "Located existing push worker container: $OLD_CONTAINER"

# Preserve only the known SANAD push-worker runtime variables. Values are never logged.
docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$OLD_CONTAINER" \
  | grep -E '^(SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|WEB_PUSH_VAPID_PUBLIC_KEY|WEB_PUSH_VAPID_PRIVATE_KEY|WEB_PUSH_SUBJECT|PUSH_WORKER_[A-Z0-9_]+)=' \
  > "$CURRENT_FRAGMENT"

for required_name in SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY WEB_PUSH_VAPID_PUBLIC_KEY WEB_PUSH_VAPID_PRIVATE_KEY WEB_PUSH_SUBJECT PUSH_WORKER_INSTANCE_ID; do
  grep -q "^${required_name}=" "$CURRENT_FRAGMENT" || fail "existing_worker_missing_${required_name}"
done

cat "$CURRENT_FRAGMENT" "$FCM_FRAGMENT" > "$NEW_ENV"
chmod 600 "$NEW_ENV"

# Validate the combined environment through the production worker itself before touching the live container.
log "Building push worker image for $EXPECTED_SHA"
docker build --pull --tag "$IMAGE_TAG" "$APP_REPO/services/push-worker" >/dev/null

docker run --rm --env-file "$NEW_ENV" --entrypoint node "$IMAGE_TAG" -e "import('./dist/config.js').then(m=>m.loadConfig()).then(()=>process.exit(0)).catch(()=>process.exit(31))" >/dev/null \
  || fail "combined_push_worker_environment_invalid"

# Validate that the Firebase private key can obtain an OAuth token, without printing the token or credentials.
docker run --rm --env-file "$NEW_ENV" --entrypoint node "$IMAGE_TAG" - <<'NODE' >/dev/null
const { createSign } = require('node:crypto');
const projectId = process.env.FIREBASE_PROJECT_ID;
const email = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
if (!projectId || !email || !privateKey) process.exit(40);
const b64u = x => Buffer.from(x).toString('base64url');
const now = Math.floor(Date.now()/1000);
const unsigned = `${b64u(JSON.stringify({alg:'RS256',typ:'JWT'}))}.${b64u(JSON.stringify({iss:email,scope:'https://www.googleapis.com/auth/firebase.messaging',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+600}))}`;
const signer = createSign('RSA-SHA256'); signer.update(unsigned); signer.end();
const assertion = `${unsigned}.${signer.sign(privateKey).toString('base64url')}`;
fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})})
 .then(r=>{ if(!r.ok) process.exit(41); return r.json(); })
 .then(j=>process.exit(j?.access_token ? 0 : 42))
 .catch(()=>process.exit(43));
NODE
[[ $? -eq 0 ]] || fail "firebase_oauth_validation_failed"

mkdir -p "$SECRETS_DIR"
chmod 700 "$SECRETS_DIR"
install -m 600 -o root -g root "$NEW_ENV" "$ENV_FILE.new"
mv -f "$ENV_FILE.new" "$ENV_FILE"
rm -f "$STAGED_B64"
rmdir "$STAGE_DIR" 2>/dev/null || true

BACKUP_CONTAINER="${OLD_CONTAINER}-rollback-$(date -u +%Y%m%dT%H%M%SZ)"
log "Stopping existing push worker for controlled replacement."
docker stop --time 30 "$OLD_CONTAINER" >/dev/null
docker rename "$OLD_CONTAINER" "$BACKUP_CONTAINER"

log "Starting updated push worker with preserved Web Push configuration and FCM credentials."
docker run -d \
  --name "$OLD_CONTAINER" \
  --env-file "$ENV_FILE" \
  --init \
  --read-only \
  --tmpfs /tmp:size=16m,noexec,nosuid \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --restart unless-stopped \
  "$IMAGE_TAG" >/dev/null
NEW_STARTED=1

HEALTH=""
for _ in $(seq 1 30); do
  HEALTH="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$OLD_CONTAINER" 2>/dev/null || true)"
  [[ "$HEALTH" == "healthy" ]] && break
  [[ "$HEALTH" == "unhealthy" || "$HEALTH" == "exited" || "$HEALTH" == "dead" ]] && break
  sleep 2
done
[[ "$HEALTH" == "healthy" ]] || fail "push_worker_health_check_failed_${HEALTH:-unknown}"

NEW_STARTED=0
docker rm "$BACKUP_CONTAINER" >/dev/null
BACKUP_CONTAINER=""
log "Push worker is healthy with FCM enabled; existing Web Push credentials were preserved."
trap - EXIT
rm -rf "$TMP_ROOT"
