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

## Club-newness is not mafia skill

A person who is new to 2LA Noire is not automatically a novice at sports Mafia. A first-time club visitor may have years of experience in another city or club.

Keep these concepts independent:

- CRM/lifecycle data describes the person's relationship with this club and visit history;
- `game_level` describes sports-Mafia skill/access only;
- `club_role` describes membership/organizational role;
- Telegram/VK identity describes account ownership only.

Every genuinely new profile created through verified Telegram or VK onboarding starts with `game_level = unrated` (**Не определён**), not `novice`. The same default is used for a normal organizer-created manual profile unless the organizer explicitly supplies another level.

While `game_level` is `unrated`, the safe self-service path is limited to `NOVICE` and `CASUAL`. `RATING` and `TOURNAMENT` remain unavailable until the organizer assigns the appropriate skill/access level. `novice` means an actual beginner by playing level, not merely a person who is new to the club.

The organizer can change the level at any time in the player card: **Игроки → профиль → Доступ и роли → Настроить → Игровой допуск**.

## Onboarding state and browser security

Pending onboarding state is stored in `player_onboarding_sessions` and expires after a short TTL. The database stores only a SHA-256 hash of the one-shot onboarding token. The raw token is transported only in an HttpOnly cookie and is not exposed through URL parameters, localStorage or normal React state.

The browser never supplies `player_id`, Telegram user id or VK user id as proof of ownership. Server-verified Telegram/VK identity is the only external-identity input to the canonical flow.

Public VK evening registration remains a separate `/join/:eveningId` flow with its own `vk_join_session`; it does not authorize Player Cabinet access.

## New-player organizer visibility

A genuinely new canonical player created by verified onboarding writes one organizer task in the same creation transaction:

- the task asks the organizer to determine the player's real playing level;
- title contains the new nickname;
- description contains the verified source channel (`Telegram` or `VK`) and states that skill is still unassessed;
- no OAuth token, session token or raw external user id is included;
- stable automation key `verified-onboarding:new-player:<player_id>` makes retries idempotent.

The task is not approval to create the profile: the verified profile already exists. It is an organizer action to classify skill/access. Legacy/manual registration paths do not fabricate the verified-onboarding notification.

## Existing-player link review

When self-service proof is unavailable, onboarding creates one pending row in `player_onboarding_link_requests` instead of creating a duplicate player.

Organizer CRM exposes only safe review data: request id, source channel, target player, nickname and creation time. Raw external ids stay server-side.

Organizer actions:

- **Подтвердить** — atomically link the already-verified external identity to the selected canonical player after rechecking ownership conflicts;
- **Отклонить** — close the request without linking anything.

Approval fails closed if the Telegram/VK identity is already owned by another player or the target player already owns another identity of that channel. Repeated resolution is idempotent.

## Compatibility invariants

VK-ACCESS-004 and later onboarding changes must not change:

- existing Telegram-linked seamless login;
- existing VK-linked seamless login;
- organizer/judge authorization based on canonical `player_id`;
- public VK event registration, announcements or polls;
- Elo, game rules, betting settlement, historical statistics or unrelated CRM behavior;
- production data by manual edits or repairs.

## Verification before merge/deploy

Repository verification must include focused onboarding/access tests plus the normal CI, CodeQL, Gitleaks and UI Preview gates. Representative narrow mobile widths should cover:

`entry -> channel verification -> existing/new choice -> nickname -> success/pending -> Player Cabinet`.

Access verification must also cover new Telegram and VK profiles starting as `unrated`, organizer reassignment, `unrated` visibility of `NOVICE` + `CASUAL`, and blocking `RATING` + `TOURNAMENT` until classification.

After deployment, runtime verification is separate from green CI. Verify at least one existing and one new Telegram path, one existing and one new VK path, organizer pending-link approve/reject, skill assignment, event-access filtering, and the deployed SHA before describing the feature as live.
