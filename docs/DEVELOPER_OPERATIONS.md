# Безопасный служебный доступ

Приложение остаётся одним Amvera-сервисом с канонической SQLite-базой на постоянном диске. Служебные маршруты не дают произвольный SQL и не раскрывают токены, chat ID или содержимое сообщений.

## Ключи

Задайте в Variables на Amvera два разных секрета (не добавляйте их в Git и не отправляйте в чат):

- `DEVELOPER_READ_KEY` — чтение диагностики.
- `DEVELOPER_OPS_KEY` — только явно разрешённые действия.

После изменения Variables нужен обычный redeploy приложения. Turso для этого контура не используется.

## Диагностика

```bash
curl -H "X-Developer-Read-Key: $DEVELOPER_READ_KEY" \
  https://2la-noire-chagina7x.waw0.amvera.tech/__developer/status
```

Ответ содержит состояние SQLite, Telegram destinations (только configured/active), outbox, последние weekly runs и health Python-бота.

## Разрешённые действия

```bash
curl -X POST -H "X-Developer-Ops-Key: $DEVELOPER_OPS_KEY" \
  https://2la-noire-chagina7x.waw0.amvera.tech/__developer/actions/reconcile-weekly

curl -X POST -H "X-Developer-Ops-Key: $DEVELOPER_OPS_KEY" \
  https://2la-noire-chagina7x.waw0.amvera.tech/__developer/actions/sync-evening/EVENING_ID
```

Первое действие повторно сверяет календарь и анонсы, второе ставит конкретный вечер в Telegram outbox и запускает ограниченный drain. Произвольные записи, удаление данных, восстановление бэкапов и выполнение SQL через этот интерфейс невозможны.

Существующие read-only маршруты `/__developer-read/*` сохраняют обратную совместимость для bounded-проверок вечеров.
