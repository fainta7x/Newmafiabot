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

## Public wall post (static by design)

- Evening posts are published with the community key (`VK_GROUP_ACCESS_TOKEN`).
- VK rejects `wall.edit`, `wall.delete`, `wall.pin` and comment edits for community keys (error 27, verified against production on 2026-09-23). The post is therefore static: date, venue, price and a link to the public evening page `/join/<id>`, which shows live per-game counts and nicknames without login plus VK ID sign-up and a cabinet login button.
- A post is edited only when an API-compatible organizer token exists (`VK_ACCESS_TOKEN` or the classic «API VK» connection) and the text changed (`vk_evening_publications.last_message_hash`). Without that token the edit is skipped silently, with no CRM error. VK ID login tokens are never used for API calls (error 1051).
- VK community channels are not reachable through the public API: the channel shows as a `DELETED` group, it is absent from community conversations, and `messages.send` answers error 901. Keep `VK_CHANNEL_API_PEER_ID` unset; the CRM «В канал» button copies the announcement for manual posting.
