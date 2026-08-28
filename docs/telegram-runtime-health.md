# Runtime health and Telegram outage alerts

## Health endpoints

- `GET /api/health` is the cheap public **liveness** endpoint. It proves that nginx can reach the Node process and must not depend on Turso or Telegram.
- `GET /api/health/runtime` is the public, non-destructive **deep runtime** endpoint. It returns HTTP 200 only when Turso, the internal Python bot service and the Telegram API/webhook are healthy; otherwise it returns HTTP 503.
- `POST /api/telegram-settings/actions/health` is the detailed organizer-only Telegram diagnostic used by Organizer CRM → Telegram → “Проверить связь без отправки”.

No health endpoint writes to the database or sends a Telegram message. The public deep response contains only `ok`/`fail` component states and never returns tokens, database paths, webhook URLs, usernames or raw upstream errors.

The Telegram probe verifies:

- `TELEGRAM_BOT_TOKEN` is configured;
- Telegram Bot API responds to `getMe` and `getWebhookInfo`;
- the webhook equals `WEBHOOK_URL + /webhook` (the public ingress), while `BOT_SERVICE_URL + /health` checks the internal Python process;
- a Telegram delivery error is considered active while updates remain queued. A recovered delivery with no pending updates is not kept unhealthy by Telegram's historical last-error field.

Do not use `/api/health/runtime` as a Kubernetes liveness probe. A temporary Turso or Telegram outage must alert the organizer, not restart-loop or remove the otherwise working player site.

## Independent Telegram monitor

`.github/workflows/runtime-monitor.yml` runs every five minutes on GitHub infrastructure, outside Amvera. It checks both public endpoints and:

- opens one GitHub incident issue on the first failed check;
- sends one Telegram outage notification;
- suppresses repeat Telegram messages while the same incident remains open;
- sends one recovery notification and closes the incident after both checks recover.

The workflow remains inert until these GitHub Actions repository secrets exist:

- `TELEGRAM_MONITOR_BOT_TOKEN` — preferably a separate BotFather bot used only for monitoring;
- `TELEGRAM_MONITOR_CHAT_IDS` — one or more numeric Telegram user/chat IDs separated by commas.

Every personal recipient must open the monitoring bot and press **Start** before it can message them. Telegram user IDs are global, so the current trusted values from the production `ADMIN_IDS` setting can be reused without calling `getUpdates` or publishing IDs in logs.

Optional repository variable `RUNTIME_MONITOR_BASE_URL` overrides the built-in production origin if the Amvera domain changes.

After adding secrets, run GitHub → Actions → **Production runtime monitor** → **Run workflow**, enable **Send a Telegram test notification**, and confirm every intended recipient receives the test. Never commit any monitor token or chat ID.
