#!/bin/sh
set -eu

export PORT=8081
export USE_WEBHOOK=true

if [ "${APP_ENV:-production}" = "test" ]; then
    echo "[TEST ENV] Telegram bot is disabled; no production messages will be sent."
    exec /opt/venv/bin/python -m http.server 8081 --bind 127.0.0.1
fi

if [ -d /data ]; then
    if [ -f /app/mafia_crm.db ] && [ ! -e /data/mafia_crm.db ]; then
        cp /app/mafia_crm.db /data/mafia_crm.db
    fi
    rm -f /app/mafia_crm.db
    ln -s /data/mafia_crm.db /app/mafia_crm.db
fi

exec /opt/venv/bin/python main.py
