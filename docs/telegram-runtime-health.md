# Telegram runtime health check

Organizer-only endpoint: `POST /api/telegram-settings/actions/health`.

The check is intentionally non-destructive: it does not send messages to players, chats, topics, or channels.

It verifies:
- `TELEGRAM_BOT_TOKEN` is configured in the web service;
- Telegram Bot API responds to `getMe` and `getWebhookInfo`;
- the configured webhook points to the current bot service `/webhook`;
- the bot service public `/health` endpoint is reachable.

The same check is available in Organizer CRM → Telegram via “Проверить связь без отправки”.
