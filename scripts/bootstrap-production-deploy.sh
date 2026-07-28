#!/usr/bin/env bash
set -Eeuo pipefail

DEPLOY_USER="${DEPLOY_USER:-sanad-deploy}"
APP_REPO="${APP_REPO:-/opt/sanad-app}"
PUBLIC_KEY="${1:-${DEPLOY_PUBLIC_KEY:-}}"

fail() { printf '[sanad-bootstrap] ERROR: %s\n' "$*" >&2; exit 1; }
log() { printf '[sanad-bootstrap] %s\n' "$*"; }

[[ "$(id -u)" -eq 0 ]] || fail "Run this bootstrap as root."
[[ -n "$PUBLIC_KEY" ]] || fail "Pass the dedicated GitHub Actions SSH public key as the first argument."
[[ "$PUBLIC_KEY" == ssh-ed25519* || "$PUBLIC_KEY" == ssh-rsa* ]] || fail "Unsupported SSH public key format."
[[ -d "$APP_REPO/.git" ]] || fail "Repository not found at $APP_REPO"

for package in git rsync curl nginx npm util-linux; do
  command -v "${package%%-*}" >/dev/null 2>&1 || true
done

if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  log "Creating restricted deployment user $DEPLOY_USER"
  useradd --create-home --shell /bin/bash "$DEPLOY_USER"
fi

SSH_DIR="/home/$DEPLOY_USER/.ssh"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$SSH_DIR"
printf '%s\n' "$PUBLIC_KEY" > "$SSH_DIR/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "$SSH_DIR/authorized_keys"
chmod 600 "$SSH_DIR/authorized_keys"

cat > /usr/local/sbin/sanad-deploy-production <<'WRAPPER'
#!/usr/bin/env bash
set -Eeuo pipefail
EXPECTED_SHA="${1:-}"
[[ "$EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]] || {
  echo "A full 40-character commit SHA is required." >&2
  exit 2
}
exec /bin/bash /opt/sanad-app/scripts/deploy-production.sh "$EXPECTED_SHA"
WRAPPER
chown root:root /usr/local/sbin/sanad-deploy-production
chmod 755 /usr/local/sbin/sanad-deploy-production

cat > "/etc/sudoers.d/$DEPLOY_USER-sanad-production" <<EOF
$DEPLOY_USER ALL=(root) NOPASSWD: /usr/local/sbin/sanad-deploy-production *
EOF
chmod 440 "/etc/sudoers.d/$DEPLOY_USER-sanad-production"
visudo -cf "/etc/sudoers.d/$DEPLOY_USER-sanad-production"

chown -R root:root "$APP_REPO"
chmod -R g-w,o-w "$APP_REPO"

log "Bootstrap completed. Test with:"
log "sudo -u $DEPLOY_USER sudo /usr/local/sbin/sanad-deploy-production <FULL_MAIN_SHA>"