#!/usr/bin/env bash
# Deploy Veraglo ERP to a remote Ubuntu server (git pull + build + restart).
#
# Usage:
#   export DEPLOY_HOST=13.203.208.226
#   export DEPLOY_USER=ubuntu
#   export DEPLOY_KEY=~/Downloads/your-key.pem   # optional
#   export DEPLOY_BRANCH=main
#   export DEPLOY_DIR=~/veraglo-payroll          # path on server
#   export DEPLOY_RUNTIME=node                 # node (default, full ERP) or java
#   ./scripts/deploy-to-server.sh
#
set -euo pipefail

HOST="${DEPLOY_HOST:-13.203.208.226}"
USER="${DEPLOY_USER:-ubuntu}"
BRANCH="${DEPLOY_BRANCH:-main}"
REMOTE_DIR="${DEPLOY_DIR:-~/veraglo-payroll}"
PORT="${DEPLOY_PORT:-3000}"
RUNTIME="${DEPLOY_RUNTIME:-node}"
JAR_NAME="veraglo-erp-2.0.0-SNAPSHOT.jar"

SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
if [ -n "${DEPLOY_KEY:-}" ]; then
  SSH_OPTS+=(-i "$DEPLOY_KEY")
fi

echo "==> Deploying branch $BRANCH ($RUNTIME runtime) to ${USER}@${HOST}:${REMOTE_DIR}"

ssh "${SSH_OPTS[@]}" "${USER}@${HOST}" bash -s <<EOF
set -e
cd ${REMOTE_DIR}
echo "==> ensure git remote points at canonical repo"
CANONICAL_ORIGIN="https://github.com/geolightspl/VeragloERP.git"
CURRENT_ORIGIN="\$(git remote get-url origin 2>/dev/null || true)"
if [ "\${CURRENT_ORIGIN}" != "\${CANONICAL_ORIGIN}" ]; then
  echo "==> updating origin from \${CURRENT_ORIGIN} to \${CANONICAL_ORIGIN}"
  git remote set-url origin "\${CANONICAL_ORIGIN}"
fi
echo "==> stop running app (release file locks before git clean)"
if command -v pm2 >/dev/null 2>&1; then
  pm2 stop veraglo-erp 2>/dev/null || true
  pm2 stop veraglo-erp-java 2>/dev/null || true
else
  pkill -f "${REMOTE_DIR}/server/index.js" 2>/dev/null || true
  pkill -f "${JAR_NAME}" 2>/dev/null || true
fi
sleep 2
echo "==> git fetch && checkout ${BRANCH}"
git remote -v
git fetch origin --prune --force "refs/heads/${BRANCH}:refs/remotes/origin/${BRANCH}"
REMOTE_SHA="\$(git ls-remote origin "refs/heads/${BRANCH}" | awk '{print \$1}')"
echo "==> origin/${BRANCH} at \${REMOTE_SHA}"
git checkout ${BRANCH} 2>/dev/null || git checkout -b ${BRANCH} origin/${BRANCH}
git reset --hard origin/${BRANCH}
git log -1 --oneline
git clean -fd -e server/.env -e .env -e data -e 'data/*' -e 'data/**' 2>/dev/null || true
# Verify data directory
DATA_DIR="${REMOTE_DIR}/data"
echo "==> data directory: \${DATA_DIR}"
ls -la "\${DATA_DIR}" 2>/dev/null || echo "(data dir missing — first deploy)"
if [ -d "\${DATA_DIR}/tenants/default" ]; then
  echo "==> default tenant data:"
  ls -la "\${DATA_DIR}/tenants/default/" 2>/dev/null
fi

if command -v docker >/dev/null 2>&1 && [ -f docker-compose.yml ]; then
  echo "==> docker compose up -d (postgres)"
  docker compose up -d || true
  for i in \$(seq 1 30); do
    if docker compose exec -T postgres pg_isready -U veraglo -d veraglo_erp >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
fi

if [ "${RUNTIME}" = "java" ] && [ -d java-backend ]; then
  echo "==> build Java backend"
  if ! command -v mvn >/dev/null 2>&1; then
    for i in 1 2 3 4 5; do
      sudo apt-get update -qq && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq maven openjdk-21-jre-headless && break
      echo "apt lock — retry \$i/5"
      sleep 15
    done
  fi
  export DATABASE_URL="jdbc:postgresql://localhost:5432/veraglo_erp"
  export DB_USER="veraglo"
  export DB_PASSWORD="veraglo"
  export PORT="${PORT}"
  export VERAGLO_FRONTEND_PATH="${REMOTE_DIR}"
  (cd java-backend && mvn -q -DskipTests package)
  JAR_PATH="${REMOTE_DIR}/java-backend/target/${JAR_NAME}"
  echo "==> restart Java API on port ${PORT}"
  if command -v pm2 >/dev/null 2>&1; then
    pm2 delete veraglo-erp-java 2>/dev/null || true
    pm2 delete veraglo-erp 2>/dev/null || true
    pm2 start "java -jar ${JAR_PATH}" --name veraglo-erp-java --cwd ${REMOTE_DIR}
    pm2 save || true
  else
    pkill -f "${JAR_NAME}" 2>/dev/null || pkill -f "node index.js" 2>/dev/null || true
    sleep 1
    nohup java -jar "\$JAR_PATH" > /tmp/veraglo-java-api.log 2>&1 &
    sleep 4
  fi
else
  echo "==> npm install (legacy Node server)"
  cd server && npm install
  cd ..
  echo "==> restart Node API on port ${PORT}"
  if command -v pm2 >/dev/null 2>&1; then
    pm2 delete veraglo-erp 2>/dev/null || true
    (cd server && pm2 start ecosystem.config.cjs)
    pm2 save || true
    sleep 2
    pm2 status veraglo-erp || true
  else
    pkill -f "node index.js" 2>/dev/null || true
    sleep 1
    cd server && nohup npm start > /tmp/veraglo-api.log 2>&1 &
    sleep 2
  fi
fi

echo "==> health check"
if ! curl -sf "http://127.0.0.1:${PORT}/api/health" | head -c 240; then
  echo "health check failed — recent pm2 logs:"
  pm2 logs veraglo-erp --nostream --lines 40 2>/dev/null || true
  exit 1
fi
echo ""
grep -o 'VG_BUILD = "[^"]*"' index.html 2>/dev/null || true
echo ""
echo "Deploy complete."
EOF

echo ""
echo "Public URL: http://${HOST}:${PORT}/"
echo "Runtime: ${RUNTIME}"
echo "Phase 2 APIs: /api/v1/customers, /api/v1/items, /api/v1/sales-orders (JWT required)"
