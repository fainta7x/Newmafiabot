# VK runtime health check

Organizer-only endpoint: `POST /api/integrations/vk/runtime-health`.

The check is intentionally non-destructive. It does not publish posts, send messages, change OAuth credentials, refresh tokens, or repair Callback API settings.

It verifies:
- a VK community and access token are configured;
- VK API can read the configured community via `groups.getById`;
- the returned community ID matches the configured `VK_GROUP_ID`;
- stored OAuth metadata can be read;
- stored Callback API runtime state is ready.

The same check is available in Organizer CRM → Ещё → Состояние системы → «Проверить VK».
