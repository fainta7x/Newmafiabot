# VK player access and personal notifications

This runbook documents the canonical VK player-cabinet flow introduced by PR #285 and the checks required before calling it live.

## Product contract

- Telegram and VK are transport identities attached to one canonical `player_id`.
- The full Player Cabinet always authenticates with the existing `player_token`; VK does not create a parallel cabinet session model.
- `vk_join_session` remains restricted to the public `/join/:eveningId` registration flow and must not authorize Player Cabinet, organizer, judge, wallet, profile, rating or game APIs.
- A VK nickname collision never auto-merges accounts. Existing-player linkage uses the private confirmation path or an already authenticated canonical player session.
- Personal external notifications are owned by `player_notification_preferences` and `personal_notification_deliveries`, not by Telegram/VK identifiers.
- One canonical notification selects at most one external channel. In-app notifications remain independent.
- Direct player-to-player evening invitations never auto-register the recipient.

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
- `PLAYER_APP_URL` — public HTTPS origin used for Player Cabinet action links in Telegram and VK notifications.

The outbox is `vk_message_outbox` and is additive/idempotent. It stores a stable `random_id`, pending/sent/failed state, retry count, next/last attempt timestamps, failure kind and last error.

Temporary VK/network failures retry with bounded exponential backoff. VK API errors 901/902 are classified as `permission_denied` and are not treated as success. The player settings surface explains that community messages must be enabled; organizer diagnostics expose affected canonical players without returning VK IDs, access tokens or secrets.

## Authentication security checks

Before merge/deploy, verify:

1. VK OAuth state uses PKCE and expires.
2. `return_to` is restricted to `/player` and `/player/...`; protocol-relative or external URLs fall back to `/player`.
3. OAuth callback consumes the pending player state before creating/linking a player, preventing replay/parallel duplicate creation.
4. Browser-supplied `player_id` is never trusted by VK linking routes.
5. Existing `player_external_identities` mapping wins over nickname matching.
6. Nickname collisions use private confirmation; no nickname-only auto-link is allowed.
7. Canonical organizer/judge authorization remains `player_token -> player_id`; VK/Telegram transport IDs never grant those roles directly.
8. Public `vk_join_session` never appears in the full Player Cabinet authentication branch.

## Notification regression checks

The full CI suite plus focused tests must cover:

- explicit VK preference does not also enqueue Telegram;
- dual-linked `auto` still defaults to Telegram;
- missing preferred channel falls back to the linked channel;
- disabled external notifications create no Telegram/VK outbox row;
- repeated canonical notification keys create only one external delivery;
- Telegram migration preserves the pre-router durable notification key;
- VK uses stable idempotent `random_id` and durable retry state;
- permission-denied VK responses remain failed and visible in diagnostics;
- invitation/status/reminder/attendance/game-result/Elo/betting producers route through `queuePersonalNotification`;
- direct friend invites use the same router and still do not create an `evening_participants` booking;
- in-app notification APIs do not depend on Telegram/VK credentials.

Security-confirmation Telegram messages used specifically to prove ownership during a VK nickname collision are intentionally outside the user-selectable personal-notification router: they are authentication challenges, not club notification events.

## Telegram + VK mobile WebView acceptance pass

Automated UI preview proves the render/build contract, not real embedded browser behavior. After deployment, manually verify at narrow phone width in both Telegram and VK entry contexts:

- login screen is channel-neutral and the VK login CTA is usable outside Telegram;
- successful VK login returns to the requested `/player/...` destination;
- Player Cabinet navigation, profile, events, games, rating, wallet and organizer/judge mode switching match the existing canonical shell;
- notification settings show only actually linked channels and remain usable with the mobile keyboard open;
- direct links from Telegram and VK notifications open the intended `/player/...` destination;
- no horizontal micro-scroll or Telegram-only blocking copy appears on shared auth/settings surfaces.

## Production checklist

Before calling VK Player Cabinet + personal notifications live on Amvera:

- PR #285 is merged to `main` and the deployed SHA is verified separately.
- Turso remains the canonical production database; no checkpoint restore/import is performed for this feature.
- `VK_APP_ID` matches the VK ID application and the registered HTTPS callback matches production.
- `VK_GROUP_ACCESS_TOKEN` is configured on the server and is never exposed to the browser.
- `VK_API_VERSION` is set or the tested default is accepted.
- `PLAYER_APP_URL` points to the production HTTPS origin.
- VK community messaging is enabled and a real linked test user has allowed community messages.
- Telegram bot credentials remain valid for Telegram-selected players and for the private VK identity-confirmation challenge.
- Organizer VK personal-delivery diagnostics show no unexplained configuration failures.
- Send one safe test notification to a Telegram-selected linked player and one to a VK-selected linked player; verify exactly one external delivery for each canonical notification.
- Test a VK permission-denied user and verify the failure is reported rather than marked sent.

## Verification status

Repository CI, container startup and preview checks may be recorded as code-level evidence. They do **not** prove current Amvera environment variables, VK community permissions, callback configuration, deployed SHA or a successful real `messages.send` call.

Until those production checks are performed after merge/deploy, describe the feature as implemented and CI-verified, **not** runtime-verified/live.
