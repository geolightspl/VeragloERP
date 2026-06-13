#!/usr/bin/env bash
# Veraglo ERP — start API + React UI (port 3000)
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
PORT="${PORT:-3000}"

export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.docker/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH"

find_cmd() { command -v "$1" 2>/dev/null || true; }

echo "Veraglo ERP — starting..."
echo "  Repo: $ROOT"

if [ ! -f "$ROOT/index.html" ]; then
  echo "ERROR: index.html not found."
  echo "  Run this script from the repository root (folder containing index.html and src/)."
  exit 1
fi

NPM="$(find_cmd npm)"
if [ -z "$NPM" ]; then
  echo "ERROR: npm not found in PATH."
  echo "  Install Node.js LTS: https://nodejs.org/"
  exit 1
fi

if [ ! -f server/.env ]; then
  cp server/.env.example server/.env
  echo "  Created server/.env"
fi

DOCKER="$(find_cmd docker)"
USE_PG=0

if [ "${USE_FILE_STORAGE:-}" = "1" ] || [ "${USE_FILE_STORAGE:-}" = "true" ]; then
  echo "  Storage: local files (USE_FILE_STORAGE=1)"
elif [ -n "$DOCKER" ] && [ "${SKIP_DOCKER:-}" != "1" ]; then
  echo "  Starting PostgreSQL (Docker)..."
  if ! "$DOCKER" compose up -d 2>/dev/null; then
    echo "WARNING: Docker compose failed — falling back to local file storage."
    export USE_FILE_STORAGE=1
  else
    USE_PG=1
    echo "  Waiting for Postgres..."
    for i in $(seq 1 30); do
      if "$DOCKER" compose exec -T postgres pg_isready -U veraglo -d veraglo_erp >/dev/null 2>&1; then
        break
      fi
      if [ "$i" -eq 30 ]; then
        echo "WARNING: Postgres not ready — falling back to local file storage."
        export USE_FILE_STORAGE=1
        USE_PG=0
      fi
      sleep 1
    done
  fi
else
  echo "  Docker not available — using local file storage (no Postgres required)."
  export USE_FILE_STORAGE=1
fi

if [ "${USE_FILE_STORAGE:-}" = "1" ] || [ "${USE_FILE_STORAGE:-}" = "true" ]; then
  if ! grep -q '^USE_FILE_STORAGE=' server/.env 2>/dev/null; then
    echo "USE_FILE_STORAGE=1" >> server/.env
  fi
  export USE_FILE_STORAGE=1
fi

if command -v ss >/dev/null 2>&1; then
  if ss -ltn 2>/dev/null | grep -q ":${PORT} "; then
    echo ""
    echo "WARNING: Port ${PORT} is already in use."
    echo "  Stop the other process, or run: PORT=3001 ./start.sh"
    echo "  Diagnose: ./scripts/check-localhost.sh"
    echo ""
  fi
fi

echo "  Installing API dependencies..."
(cd server && "$NPM" install --silent 2>/dev/null || (cd server && "$NPM" install))

echo ""
echo "=========================================="
echo "  Open: http://localhost:${PORT}"
echo "  Health: http://localhost:${PORT}/api/health"
echo "  Stop with Ctrl+C"
if [ "${USE_FILE_STORAGE:-}" = "1" ]; then
  _DATA_DIR="${VERAGLO_DATA_DIR:-}"
  if [ -z "$_DATA_DIR" ] && [ -f server/.env ]; then
    _DATA_DIR="$(grep -E '^VERAGLO_DATA_DIR=' server/.env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
  fi
  if [ -z "$_DATA_DIR" ]; then _DATA_DIR="${HOME}/VeragloERP/data"; fi
  echo "  Data: ${_DATA_DIR} (file mode)"
elif [ "$USE_PG" = "1" ]; then
  echo "  Data: PostgreSQL (docker compose)"
fi
echo "=========================================="
echo ""

export PORT
(cd server && "$NPM" start)
