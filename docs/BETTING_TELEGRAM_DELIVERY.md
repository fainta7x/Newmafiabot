# Betting and Telegram delivery

## Betting start lifecycle

Club betting opens from the server game-start lifecycle (`POST /api/games/:gameId/start`). The same endpoint is used by organizer/CRM hosting and by an assigned qualified host in Live Game. The browser bridge is not the source of truth for betting-pool creation.

For each club game the server creates at most one pool. Repeated start/sync calls return the existing pool and must not reset `opens_at`, `closes_at`, bets, token balances or pool totals. The betting window remains 90 seconds. The pool stores canonical player IDs and the canonical `judge_player_id`; betting eligibility never depends on nickname matching.

The ten seated players and the linked judge/host are ineligible. Spectator bets use a client request ID plus token-ledger idempotency so the same request cannot debit twice. Settlement, correction and refund use deterministic ledger keys and remain idempotent.

`BettingLiveBridge` is compatibility/reconciliation only. Core pool creation must continue to work when the CRM/admin route is not mounted and when no polling/localStorage bridge is available.

## Durable Telegram outbox

Direct betting, personal and organizer notifications use `telegram_message_outbox`. Each logical recipient/event has a deterministic `message_key` and one durable row with:

- `pending`, `sent` or `failed` status;
- retry count and next-attempt time;
- last error / last attempt;
- sent timestamp;
- recipient, category, event and entity identifiers.

Temporary Telegram/network failures are retried with bounded exponential backoff. Permanent failures are retained for diagnostics without an infinite retry loop. Delivery drains concurrently with a bounded worker limit. Underlying game, booking, payment and betting transactions never depend on Telegram delivery succeeding.

Betting-open messages are queued only for linked eligible spectators. Zero eligible recipients and all-failed delivery are not recorded as successful pool notification delivery.

Personal notification reconciliation runs server-side and does not depend on Player Cabinet being opened. Current event types include invitation/upcoming evening, attendance confirmation, booking/attendance state, evening reminder, game result, Elo change, betting pool opening and bet result/winnings/refund. In-app notifications remain independent.

## Organizer recipients

Organizer direct notifications are opt-in. Recipient selection order is:

1. `ORGANIZER_NOTIFICATION_IDS` (preferred, comma-separated private chat IDs);
2. `ORGANIZER_CHAT_ID` (legacy explicit recipient setting);
3. `BACKUP_ADMIN_ID` only when `ORGANIZER_NOTIFICATION_USE_BACKUP=true`.

`ADMIN_IDS` grants bot administration and is never automatically reused as the digest audience.

CRM Telegram settings expose configured recipient count, outbox queue size, latest successful delivery, latest failed delivery/error, and a safe organizer test-notification action.

## Environment

Required for real direct delivery:

- `TELEGRAM_BOT_TOKEN`
- `ORGANIZER_NOTIFICATION_IDS` for organizer digest/test delivery (or explicit legacy `ORGANIZER_CHAT_ID`)
- `PLAYER_APP_URL` should be the public Mini App origin when the canonical default is not appropriate.

Optional:

- `TELEGRAM_OUTBOX_CONCURRENCY` (clamped by the server; default 4)
- `ORGANIZER_NOTIFICATION_USE_BACKUP=true` plus `BACKUP_ADMIN_ID` only when backup fallback is deliberately desired.

## Runtime monitoring

Telegram webhook/bot health and the GitHub Actions runtime monitor are separate configurations. A healthy webhook proves neither that the runtime-monitor workflow has its repository secrets nor that outage alerts can be delivered. Verify the runtime-monitor workflow secrets/settings separately in GitHub Actions after deployment.

Deployment must not reset/import Turso for this feature. The new outbox table is created by the normal non-destructive schema ensure path.
