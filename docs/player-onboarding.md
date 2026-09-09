# Verified player onboarding

VK-ACCESS-004 defines one canonical first-time Player Cabinet onboarding flow for Telegram and VK.

## Canonical flow

1. Verify the external channel first:
   - Telegram: server-validated Mini App `initData`;
   - VK: VK ID OAuth with the existing state, PKCE, browser-binding and trusted public callback protections.
2. Resolve the verified external identity to canonical `player_id`:
   - Telegram compatibility: `players.telegram_user_id`;
   - VK: `player_external_identities`.
3. If already linked, issue/retain the canonical player session and open the requested `/player/...` destination.
4. If unlinked, enter the shared onboarding UI and choose:
   - `Я уже играл в клубе` — request a link to an existing profile;
   - `Я новый игрок` — create one canonical player only after verified identity exists.
5. Open the original safe `/player/...` destination after successful creation/linking.

Nickname is profile data, not identity proof. A nickname match never auto-merges profiles.

## Onboarding state and browser security

Pending onboarding state is stored in `player_onboarding_sessions` and expires after a short TTL. The database stores only a SHA-256 hash of the one-shot onboarding token. The raw token is transported only in an HttpOnly cookie and is not exposed through URL parameters, localStorage or normal React state.

The browser never supplies `player_id`, Telegram user id or VK user id as proof of ownership. Server-verified Telegram/VK identity is the only external-identity input to the canonical flow.

Public VK evening registration remains a separate `/join/:eveningId` flow with its own `vk_join_session`; it does not authorize Player Cabinet access.

## New-player organizer visibility

A genuinely new canonical player created by verified onboarding writes one factual organizer task in the same creation transaction:

- title contains the new nickname;
- description contains only the source channel (`Telegram` or `VK`);
- no OAuth token, session token or raw external user id is included;
- stable automation key `verified-onboarding:new-player:<player_id>` makes retries idempotent.

Legacy/manual registration paths do not fabricate this event.

## Existing-player link review

When self-service proof is unavailable, onboarding creates one pending row in `player_onboarding_link_requests` instead of creating a duplicate player.

Organizer CRM exposes only safe review data: request id, source channel, target player, nickname and creation time. Raw external ids stay server-side.

Organizer actions:

- **Подтвердить** — atomically link the already-verified external identity to the selected canonical player after rechecking ownership conflicts;
- **Отклонить** — close the request without linking anything.

Approval fails closed if the Telegram/VK identity is already owned by another player or the target player already owns another identity of that channel. Repeated resolution is idempotent.

## Compatibility invariants

VK-ACCESS-004 must not change:

- existing Telegram-linked seamless login;
- existing VK-linked seamless login;
- organizer/judge authorization based on canonical `player_id`;
- public VK event registration, announcements or polls;
- Elo, game rules, betting settlement, historical statistics or unrelated CRM behavior;
- production data by manual edits or repairs.

## Verification before merge/deploy

Repository verification must include focused onboarding tests plus the normal CI, CodeQL, Gitleaks and UI Preview gates. Representative narrow mobile widths should cover:

`entry -> channel verification -> existing/new choice -> nickname -> success/pending -> Player Cabinet`.

After deployment, runtime verification is separate from green CI. Verify at least one existing and one new Telegram path, one existing and one new VK path, organizer pending-link approve/reject, and the deployed SHA before describing the feature as live.
