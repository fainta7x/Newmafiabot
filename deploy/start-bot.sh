#!/bin/sh
set -eu

export PORT=8081
export USE_WEBHOOK=true

if [ -d /data ]; then
    if [ -f /app/mafia_crm.db ] && [ ! -e /data/mafia_crm.db ]; then
        cp /app/mafia_crm.db /data/mafia_crm.db
    fi
    rm -f /app/mafia_crm.db
    ln -s /data/mafia_crm.db /app/mafia_crm.db
fi

exec /opt/venv/bin/python main.py
