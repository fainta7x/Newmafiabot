# VK player access and personal notifications

This runbook documents the canonical VK player-cabinet flow introduced by PR #285 and made operational by VK-ACCESS-002 / Issue #289. Repository completion, deployment and live VK verification are separate states.

## Product contract

- Telegram and VK are transport identities attached to one canonical `player_id`.
- The full Player Cabinet always authenticates with the existing `player_token`; VK does not create a parallel cabinet session model.
- `vk_join_session` remains restricted to the public `/join/:eveningId` registration flow and must not authorize Player Cabinet, organizer, judge, wallet, profile, rating or game APIs.
- A VK nickname collision never auto-merges accounts. Existing-player linkage uses the private confirmation path or an explicitly initiated link from an already authenticated canonical player session.
- Personal external notifications are owned by `player_notification_preferences` and `personal_notification_deliveries`, not by Telegram/VK identifiers.
- One canonical notification selects at most one external channel. In-app notifications remain independent.
- Direct player-to-player evening invitations never auto-register the recipient.

## Operational routing

Player Cabinet VK OAuth start is mounted at the same URL used by the shared UI:

- `POST /api/integrations/player/vk/start` — full Player Cabinet login/linking;
- `GET /api/integrations/vk/oauth/callback` — VK ID callback;
- `POST /api/public/evenings/:id/vk/start` — existing public evening-registration flow only.

Do not mount the Player Cabinet start handler under `/api/public` and do not let the public `vk_join_session` become proof of Player Cabinet identity.

Security-sensitive callback and identity-confirmation links use the configured `PLAYER_APP_URL` (or approved `PUBLIC_APP_URL` fallback). Production requires a configured HTTPS origin and does not trust the request `Host` header for those URLs. Development has an HTTPS-only host fallback for local/test wiring.

An authenticated owner can initiate VK linking from their own profile notification settings. The server records the initiating canonical `player_id`; browser-supplied `player_id` is never accepted. If the returned VK identity is already linked to another canonical player, the callback returns a conflict and leaves the current player session unchanged.

## Channel selection

`preferred_channel` supports:

- `auto`: Telegram remains the default when both Telegram and VK are linked; otherwise the available linked channel is used.
- `telegram`: use Telegram when linked; otherwise fall back to the available linked channel.
- `vk`: use VK when linked; otherwise fall back to the available linked channel.

`personal_enabled=false` disables external personal delivery but does not disable in-app notifications.

Telegram delivery keeps the canonical notification key as the durable outbox key so old and new producers remain idempotent across the router migration. VK delivery uses a channel-specific durable key plus the canonical notification key in its ledger row.

## VK personal delivery

Personal VK delivery uses the community API method `messages.send` only.

Required runtime configuration:

- `VK_GROUP_ACCESS_TOKEN` — community token with permission to send community messages to users who allow them.
- `VK_API_VERSION` — defaults to `5.199`.
- `PLAYER_APP_URL` — canonical public HTTPS origin for VK OAuth callbacks and Player Cabinet action links.

The outbox is `vk_message_outbox` and is additive/idempotent. It stores a stable `random_id`, pending/sent/failed state, retry count, next/last attempt timestamps, failure kind and last error.

The VK outbox schema is ensured during application bootstrap and its worker starts with the other runtime workers outside tests. Starting the worker immediately drains pending/retryable rows, so a process restart does not require a new notification to wake the queue.

Temporary VK/network failures retry with bounded exponential backoff. VK API errors 901/902 are classified as `permission_denied` and are not treated as success. The player settings surface explains that community messages must be enabled; organizer diagnostics expose affected canonical players without returning VK IDs, access tokens or secrets.

### Betting-open notifications

The 90-second betting-open notification is a canonical personal notification, not a Telegram-only broadcast:

- players currently in the game and the judge remain excluded;
- eligible spectators may be Telegram-only, VK-only or dual-linked;
- one key `betting-open:<poolId>:<playerId>` selects exactly one channel through the personal notification router;
- Telegram keeps its WebApp `Сделать ставку` button;
- VK receives a Player Cabinet action link;
- dual-linked players follow their preferred channel, with Telegram remaining the `auto` default;
- retries/restarts do not create a second channel delivery for the same canonical key.

## Authentication security checks

Before merge/deploy, verify:

1. VK OAuth uses PKCE, short-lived state and a random HttpOnly browser-binding cookie.
2. The OAuth state stores only the hash of that browser binding. A callback from another browser is rejected before the state is consumed.
3. When an already authenticated player explicitly starts VK linking, the initiating canonical `player_id` is recorded with the OAuth state. The callback never chooses an account from whatever `player_token` happens to accompany the returned URL.
4. OAuth state is atomically marked consumed before code exchange/linking, preventing replay and parallel duplicate creation/linking.
5. Repeated Player Cabinet VK OAuth starts from one browser binding are rate-limited in the durable OAuth-state store.
6. `return_to` is restricted to `/player` and `/player/...`; protocol-relative or external URLs fall back to `/player`.
7. Browser-supplied `player_id` is never trusted by VK linking routes.
8. Existing `player_external_identities` mapping wins over nickname matching.
9. Nickname collisions use private confirmation; no nickname-only auto-link is allowed.
10. Private Telegram identity-confirmation claim links are one-shot: `confirmed_at IS NULL` is required and the claim is atomically consumed before a canonical session cookie is issued.
11. Canonical organizer/judge authorization remains `player_token -> player_id`; VK/Telegram transport IDs never grant those roles directly.
12. Public `vk_join_session` never appears in the full Player Cabinet authentication branch.
13. Linking a VK identity already owned by another canonical player returns a conflict before writing the identity or replacing the current session.
14. Production callback/confirmation URLs originate from configured trusted HTTPS application origin, not the request Host header.

## Notification regression checks

The full CI suite plus focused tests must cover:

- explicit VK preference does not also enqueue Telegram;
- dual-linked `auto` still defaults to Telegram;
- missing preferred channel falls back to the linked channel;
- disabled external notifications create no Telegram/VK outbox row;
- repeated canonical notification keys create only one external delivery;
- Telegram migration preserves the pre-router durable notification key;
- VK uses stable idempotent `random_id` and durable retry state;
- pending VK rows drain immediately when the runtime worker starts after restart;
- permission-denied VK responses remain failed and visible in diagnostics;
- invitation/status/reminder/attendance/game-result/Elo/betting producers route through `queuePersonalNotification`;
- betting-open includes VK-only spectators and preserves the Telegram WebApp action;
- both active and legacy player-to-player invite services route through the neutral router rather than directly to Telegram;
- direct friend invites still do not create an `evening_participants` booking;
- in-app notification APIs do not depend on Telegram/VK credentials.

Security-confirmation Telegram messages used specifically to prove ownership during a VK nickname collision are intentionally outside the user-selectable personal-notification router: they are authentication challenges, not club notification events.

## Telegram + VK mobile WebView acceptance pass

Automated UI preview proves the render/build contract, not real embedded browser behavior. After deployment, manually verify at narrow phone width in both Telegram and VK entry contexts:

- login screen is channel-neutral and the VK login CTA is usable outside Telegram;
- successful VK login returns to the requested `/player/...` destination;
- an authenticated owner can link VK from profile/settings and immediately sees linked channel status after returning;
- Player Cabinet navigation, profile, events, games, rating, wallet and organizer/judge mode switching match the existing canonical shell;
- notification settings show only actually linked channels and remain usable with the mobile keyboard open;
- direct links from Telegram and VK notifications open the intended `/player/...` destination;
- a VK-only spectator receives the betting-open Player Cabinet link while a dual-linked spectator receives only the preferred channel;
- no horizontal micro-scroll or Telegram-only blocking copy appears on shared auth/settings surfaces.

## Production checklist

Before calling VK Player Cabinet + personal notifications live on Amvera:

- Issue #289 implementation is merged to `main` and the deployed SHA is verified separately.
- Turso remains the canonical production database; no checkpoint restore/import/manual rewrite is performed for this feature.
- `VK_APP_ID` matches the VK ID application and the registered HTTPS callback matches production `PLAYER_APP_URL`.
- `VK_GROUP_ACCESS_TOKEN` is configured on the server and is never exposed to the browser.
- `VK_API_VERSION` is set or the tested default is accepted.
- `PLAYER_APP_URL` points to the production HTTPS origin.
- VK community messaging is enabled and a real linked test user has allowed community messages.
- Telegram bot credentials remain valid for Telegram-selected players and for the private VK identity-confirmation challenge.
- Organizer VK personal-delivery diagnostics show no unexplained configuration failures.
- Perform one real VK login through `/api/integrations/player/vk/start` and verify the requested Player Cabinet return path.
- Send one safe test notification to a Telegram-selected linked player and one to a VK-selected linked player; verify exactly one external delivery for each canonical notification.
- Test a VK permission-denied user and verify the failure is reported rather than marked sent.
- Open a betting pool with a VK-only eligible spectator and verify one usable betting-open Player Cabinet message.
- Start VK linking in one browser and confirm that replaying the callback in another browser fails with a browser-binding error.
- Confirm one nickname-collision identity-claim link, then verify the same claim URL cannot mint another player session.

## Verification status

Repository CI, container startup and preview checks may be recorded as code-level evidence. They do **not** prove current Amvera environment variables, VK community permissions, callback configuration, deployed SHA or a successful real `messages.send` call.

Until those production checks are performed after merge/deploy, describe the feature as implemented and CI-verified, **not** runtime-verified/live.
