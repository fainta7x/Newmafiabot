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

## Public wall post refresh

- New evening posts are published with the community key (`VK_GROUP_ACCESS_TOKEN`).
- Refreshing an existing post (`wall.edit`) tries the API-compatible organizer token first (`VK_ACCESS_TOKEN` or the CRM «API VK» connection), then the community key. VK ID login tokens are never used for API calls: VK rejects them (error 1051).
- If every credential fails, the CRM VK card shows the exact VK answer per credential. `VK API 27` for the community key means an API-compatible organizer token must be connected.
- The background refresh edits a post only when the announcement text changed (`vk_evening_publications.last_message_hash`).
