#!/usr/bin/env bash
# One-shot production recovery for Veraglo ERP (single-organization build).
#
# Run this on the EC2 server after getting a shell (SSH or EC2 Instance Connect):
#   cd ~/VeragloERP
#   git fetch origin
#   git checkout veragloerp-single-org-bb55
#   git pull origin veragloerp-single-org-bb55
#   ADMIN_EMAIL="you@example.com" ADMIN_PASSWORD="YourNewPass9!" bash scripts/recover-production.sh
#
# What it does:
#   1. Force-stops ANY process holding port 3000 (fixes "files updated but server never restarted")
#   2. Installs server deps
#   3. Migrates legacy multi-tenant data (tenants/default or tenants/13) to single-org data/erp_state.json
#   4. Starts the single-org server (pm2 if available, else nohup)
#   5. Creates or repairs the administrator so you can log in immediately
set -uo pipefail

APP_DIR="${APP_DIR:-$HOME/VeragloERP}"
PORT="${PORT:-3000}"
DATA_DIR="${VERAGLO_DATA_DIR:-$APP_DIR/data}"
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
ADMIN_NAME="${ADMIN_NAME:-System Administrator}"

cd "$APP_DIR" || { echo "FATAL: $APP_DIR not found"; exit 1; }

echo "==> 1. Stop ALL processes on port $PORT (this is the key fix)"
if command -v pm2 >/dev/null 2>&1; then
  pm2 delete veraglo-erp 2>/dev/null || true
  pm2 delete veraglo-erp-java 2>/dev/null || true
fi
# Force-free the port regardless of how the old process was started
if command -v fuser >/dev/null 2>&1; then
  sudo fuser -k "${PORT}/tcp" 2>/dev/null || fuser -k "${PORT}/tcp" 2>/dev/null || true
fi
if command -v lsof >/dev/null 2>&1; then
  PIDS="$(sudo lsof -t -i:"${PORT}" 2>/dev/null || lsof -t -i:"${PORT}" 2>/dev/null || true)"
  if [ -n "${PIDS}" ]; then
    echo "    killing PIDs on :$PORT -> ${PIDS}"
    sudo kill -9 ${PIDS} 2>/dev/null || kill -9 ${PIDS} 2>/dev/null || true
  fi
fi
sleep 2

echo "==> 2. Ensure server/.env (single-org file storage)"
mkdir -p "$DATA_DIR"
ENV_FILE="$APP_DIR/server/.env"
touch "$ENV_FILE"
set_env() { grep -q "^$1=" "$ENV_FILE" && sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE" || echo "$1=$2" >> "$ENV_FILE"; }
set_env USE_FILE_STORAGE 1
set_env HOST 0.0.0.0
set_env PORT "$PORT"
set_env VERAGLO_DATA_DIR "$DATA_DIR"
echo "    server/.env:"; grep -E '^(USE_FILE_STORAGE|HOST|PORT|VERAGLO_DATA_DIR)=' "$ENV_FILE" | sed 's/^/      /'

echo "==> 3. Migrate legacy multi-tenant data to single-org location"
SINGLE="$DATA_DIR/erp_state.json"
pick_source() {
  for cand in "$DATA_DIR/tenants/default/erp_state.json" "$DATA_DIR/tenants/13/erp_state.json"; do
    [ -f "$cand" ] || continue
    # choose the one that actually has login users
    if grep -q '"passwordHash"' "$cand" 2>/dev/null; then echo "$cand"; return; fi
  done
  # fallback: any tenant file with a password hash
  for cand in "$DATA_DIR"/tenants/*/erp_state.json; do
    [ -f "$cand" ] || continue
    if grep -q '"passwordHash"' "$cand" 2>/dev/null; then echo "$cand"; return; fi
  done
  echo ""
}
if [ ! -f "$SINGLE" ] || ! grep -q '"passwordHash"' "$SINGLE" 2>/dev/null; then
  SRC="$(pick_source)"
  if [ -n "$SRC" ]; then
    echo "    migrating $SRC -> $SINGLE"
    cp -f "$SINGLE" "$SINGLE.bak.$(date +%s)" 2>/dev/null || true
    cp -f "$SRC" "$SINGLE"
  else
    echo "    no legacy data with users found — will create a fresh admin"
  fi
else
  echo "    $SINGLE already has users — keeping it"
fi

echo "==> 4. Install deps and start server"
(cd server && npm install --no-audit --no-fund) || { echo "FATAL: npm install failed"; exit 1; }
if command -v pm2 >/dev/null 2>&1; then
  (cd server && USE_FILE_STORAGE=1 HOST=0.0.0.0 PORT="$PORT" VERAGLO_DATA_DIR="$DATA_DIR" pm2 start ecosystem.config.cjs --update-env)
  pm2 save || true
else
  (cd server && USE_FILE_STORAGE=1 HOST=0.0.0.0 PORT="$PORT" VERAGLO_DATA_DIR="$DATA_DIR" nohup node index.js > /tmp/veraglo.log 2>&1 &)
fi
sleep 5

echo "==> 5. Health + build check"
curl -s "http://127.0.0.1:$PORT/api/health" || echo "    (health not responding yet)"
echo ""
BUILD="$(grep -o 'VG_BUILD = \"[^\"]*\"' index.html 2>/dev/null | head -1)"
echo "    UI build: $BUILD  (expect 2026-06-single-org-v1)"

echo "==> 6. Create or repair administrator"
if [ -n "$ADMIN_EMAIL" ] && [ -n "$ADMIN_PASSWORD" ]; then
  cd server
  if npm run | grep -q repair-admin; then
    ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD" node scripts/repair-admin.js --email "$ADMIN_EMAIL" --password "$ADMIN_PASSWORD" || true
  fi
  # Verify login works end to end
  echo "    verifying login via API…"
  curl -s -X POST "http://127.0.0.1:$PORT/api/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" | head -c 200
  echo ""
  cd ..
else
  echo "    Skipped (set ADMIN_EMAIL and ADMIN_PASSWORD to auto-create/repair the admin)."
  echo "    Example: ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='YourPass9!' bash scripts/recover-production.sh"
fi

echo ""
echo "==> DONE. Open http://13.203.208.226:3000 and sign in with Email + Password."
echo "    If you set ADMIN_EMAIL/ADMIN_PASSWORD above, use those credentials."
