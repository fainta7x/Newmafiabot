#!/bin/sh
set -eu

export HOST=127.0.0.1
export PORT=3000
export BOT_SERVICE_URL="${BOT_SERVICE_URL:-http://127.0.0.1:8081}"

# Amvera SQLite is the only runtime database. Production and the separately
# deployed test application use different files on different persistent volumes.
unset TURSO_DATABASE_URL TURSO_AUTH_TOKEN
export DATABASE_PATH="/data/mafia_crm.sqlite"
export DATABASE_BOOTSTRAP_FROM_CHECKPOINT="true"
export SEED_DEMO_DATA="false"
export TEST_DATABASE_PATH="${TEST_DATABASE_PATH:-/data/mafia_crm.test.sqlite}"

mkdir -p /data

echo "[STORAGE] WebApp SQLite: $DATABASE_PATH"

exec node dist/server.cjs
