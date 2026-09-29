#!/usr/bin/env bash
# Run on the designated SSH host as an unprivileged account. Never changes SANAD production services.
set -euo pipefail
: "${RELEASE_SHA:?Missing release SHA}"
: "${MCP_PORT:=8787}"
ROOT="$HOME/sanad-mcp-demo"
PKG="$ROOT/incoming/$RELEASE_SHA.tar.gz"
RELEASE="$ROOT/releases/$RELEASE_SHA"
UNIT="$HOME/.config/systemd/user/sanad-mcp-demo.service"
command -v node >/dev/null || { echo "Node.js 22+ must be installed on the isolated target host" >&2; exit 1; }
command -v npm >/dev/null || { echo "npm must be installed" >&2; exit 1; }
node -e 'if(Number(process.versions.node.split(".")[0])<22)process.exit(1)' || { echo "Node.js 22+ required" >&2; exit 1; }
command -v systemctl >/dev/null || { echo "systemd user services are required" >&2; exit 1; }
systemctl --user show-environment >/dev/null || { echo "User systemd manager unavailable: configure lingering for the designated deployment account first" >&2; exit 1; }
test -f "$PKG" || { echo "Missing deployment archive" >&2; exit 1; }
mkdir -p "$RELEASE" "$HOME/.config/systemd/user"
tar -xzf "$PKG" -C "$RELEASE"
cd "$RELEASE"
npm ci --omit=dev --no-audit --no-fund
npm test
cat > "$UNIT" <<UNIT
[Unit]
Description=SANAD synthetic-only ChatGPT MCP demonstration
After=network-online.target

[Service]
Type=simple
WorkingDirectory=$ROOT/current
ExecStart=$(command -v node) $ROOT/current/server.mjs
Environment=HOST=127.0.0.1
Environment=PORT=$MCP_PORT
Restart=on-failure
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=default.target
UNIT
ln -sfn "$RELEASE" "$ROOT/current.next"
mv -Tf "$ROOT/current.next" "$ROOT/current"
systemctl --user daemon-reload
systemctl --user enable --now sanad-mcp-demo.service
systemctl --user restart sanad-mcp-demo.service
for i in $(seq 1 15); do
  if curl --silent --fail --max-time 3 "http://127.0.0.1:$MCP_PORT/" |
      node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{let j=JSON.parse(s);if(j.demonstration_only!==true||j.production_connected!==false)process.exit(1)})'; then
    printf 'Synthetic-only MCP ready on remote loopback port %s\n' "$MCP_PORT"
    printf 'Release: %s\n' "$RELEASE_SHA"
    exit 0
  fi
  sleep 2
done
journalctl --user -u sanad-mcp-demo.service -n 40 --no-pager || true
echo "MCP demo failed local health check" >&2
exit 1
