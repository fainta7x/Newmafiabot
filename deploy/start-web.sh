#!/bin/sh
set -eu

export HOST=127.0.0.1
export PORT=3000
export BOT_SERVICE_URL="${BOT_SERVICE_URL:-http://127.0.0.1:8081}"

# Amvera production storage is the persistent /data volume. The previous Turso
# backend is intentionally disabled here so a suspended/over-limit remote
# database cannot make the whole WebApp unavailable.
export DATABASE_PATH="${DATABASE_PATH:-/data/mafia_crm.sqlite}"
export DATABASE_BOOTSTRAP_FROM_CHECKPOINT="${DATABASE_BOOTSTRAP_FROM_CHECKPOINT:-true}"
unset TURSO_DATABASE_URL TURSO_AUTH_TOKEN

mkdir -p "$(dirname "$DATABASE_PATH")"

echo "[STORAGE] WebApp SQLite: $DATABASE_PATH"

exec node dist/server.cjs
