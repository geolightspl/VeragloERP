#!/usr/bin/env bash
# Run on EC2 after files are synced (called by GitHub Actions or manually).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# scripts/deploy/deploy.sh → repo root (works for ~/VeragloERP or any clone path)
DEFAULT_APP_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
APP_DIR="${VERAGLO_APP_DIR:-${DEFAULT_APP_DIR}}"
SERVER_DIR="${APP_DIR}/server"
ENV_FILE="${SERVER_DIR}/.env"

echo "==> Deploying from ${APP_DIR}"
cd "${SERVER_DIR}"

if [ ! -f "${ENV_FILE}" ]; then
  echo "ERROR: Missing ${ENV_FILE}"
  echo "Create it once on the server (see docs/AWS-DEPLOY.md)."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js is not installed. Run scripts/deploy/ec2-setup.sh on this host first."
  exit 1
fi

echo "==> Installing API dependencies…"
if [ -f package-lock.json ]; then
  npm ci --omit=dev
else
  npm install --omit=dev
fi

if [ "${USE_FILE_STORAGE:-}" = "1" ] || [ "${USE_FILE_STORAGE:-}" = "true" ]; then
  echo "==> file storage mode — skipping db:init"
elif [ -f "${ENV_FILE}" ] && grep -q '^DATABASE_URL=' "${ENV_FILE}" 2>/dev/null; then
  echo "==> Applying database schema (idempotent)…"
  npm run db:init
else
  echo "==> no DATABASE_URL — skipping db:init"
fi

echo "==> Restarting application…"
if command -v pm2 >/dev/null 2>&1; then
  pm2 delete veraglo-erp 2>/dev/null || true
  pm2 start ecosystem.config.cjs
  pm2 save
else
  echo "WARN: pm2 not found — starting node in background (install pm2 for production)."
  pkill -f "node.*${SERVER_DIR}/index.js" 2>/dev/null || true
  nohup node index.js >> "${APP_DIR}/veraglo.log" 2>&1 &
fi

echo "==> Deploy finished at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
