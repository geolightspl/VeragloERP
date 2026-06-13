#!/usr/bin/env bash
# One-time bootstrap on a fresh Ubuntu 22.04 / Amazon Linux 2023 EC2 instance.
# Run as root or with sudo:  sudo bash scripts/deploy/ec2-setup.sh
set -euo pipefail

DEPLOY_USER="${VERAGLO_DEPLOY_USER:-ubuntu}"
APP_DIR="${VERAGLO_APP_DIR:-/home/${DEPLOY_USER}/VeragloERP}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo: sudo bash $0"
  exit 1
fi

echo "==> Installing Node.js 20 LTS…"
if command -v apt-get >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y curl rsync
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
elif command -v dnf >/dev/null 2>&1; then
  dnf install -y curl rsync
  curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
  dnf install -y nodejs
else
  echo "Unsupported OS — install Node.js 20 manually, then re-run from pm2 step."
fi

echo "==> Installing pm2…"
npm install -g pm2

echo "==> Creating app directory ${APP_DIR}…"
mkdir -p "${APP_DIR}"
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${APP_DIR}"

ENV_FILE="${APP_DIR}/server/.env"
if [ ! -f "${ENV_FILE}" ]; then
  mkdir -p "${APP_DIR}/server"
  cat > "${ENV_FILE}" <<'EOF'
# Edit DATABASE_URL to your RDS endpoint before first deploy.
DATABASE_URL=postgresql://veraglo:CHANGE_ME@your-db.xxxxx.region.rds.amazonaws.com:5432/veraglo_erp?sslmode=require
PORT=3000
CORS_ORIGIN=https://your-domain.example.com
EOF
  chown "${DEPLOY_USER}:${DEPLOY_USER}" "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
  echo "Created template ${ENV_FILE} — edit DATABASE_URL and CORS_ORIGIN before deploying."
fi

echo "==> pm2 startup (survives reboot)…"
sudo -u "${DEPLOY_USER}" pm2 startup systemd -u "${DEPLOY_USER}" --hp "/home/${DEPLOY_USER}" || true

echo ""
echo "Next steps:"
echo "  1. Edit ${ENV_FILE} with your RDS DATABASE_URL"
echo "  2. Add GitHub Actions secrets: EC2_HOST, EC2_USER, EC2_SSH_KEY"
echo "  3. Push to main — deploy runs automatically"
echo "  4. Open security group port 3000 (or put ALB in front on 443)"
