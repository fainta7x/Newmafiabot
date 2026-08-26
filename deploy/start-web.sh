#!/bin/sh
set -eu

export HOST=127.0.0.1
export PORT=3000
export BOT_SERVICE_URL="${BOT_SERVICE_URL:-http://127.0.0.1:8081}"

exec node dist/server.cjs
