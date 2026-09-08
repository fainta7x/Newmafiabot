# Player Profile Completeness & Verified Awards

## Profile completeness

The canonical profile score is calculated server-side by `playerProfileIntegrityService.ts`.

Weighted fields (100 total): avatar 20, nickname 10, full name 15, linked Telegram/username 20, birthday 20, phone 10, preferred format 5. Sensitive fields (`phone`, `birthday`) may be explicitly marked `declined`; that privacy choice satisfies completeness without storing the sensitive value. `not_requested` remains distinct from `missing` for organizer workflow.

Player self-service uses `/api/player/me`, `/api/player/me/avatar` and `/api/player/profile-completeness`. Unspecified fields are preserved. Telegram account identity is read from the canonical linked player and is not manually reassigned by the player.

Organizer views use `/api/players/profile-integrity/*`. Profile task reconciliation is idempotent through stable `organizer_tasks.automation_key` values. Blocked/paused and long-inactive players are excluded from urgent profile-completion scope.

Birthday data is stored as day/month plus optional year. Visibility values are `private`, `day_month`, and `full`. Public profile responses expose no birthday for `private`, day/month only for `day_month`, and the optional year only for `full`. Birthday calculations use `Europe/Moscow`; Feb 29 is treated as Feb 28 in non-leap years for reminder purposes.

No Telegram birthday congratulations are enabled by this module. A future notification hook must remain opt-in and use the existing durable notification-preference/outbox architecture.

## Official verified awards

`player_verified_awards` is separate from:

- application achievements (`player_achievements` / achievement catalog);
- game and tournament statistics;
- Elo/rating calculations.

Supported kinds: trophy, medal, certificate, placement, nomination and team achievement. Awards may include event/organizer/date/year/place/team/description/source and a HTTPS or embedded image reference.

Players cannot publish awards. `/api/player/award-suggestions` only creates a pending suggestion/correction. Organizer review approves/rejects it; only `verification_status='verified'` is returned by player/public verified-award endpoints.

Trusted automatic awards are generated only from existing completed tournament data and use a stable `source_key` for deduplication. Historical/manual awards never create tournaments, games, rating entries or statistics.

Legacy `player_historical_awards` are not imported automatically. An organizer may explicitly run the per-player historical import action from CRM; it is idempotent via `source_key=legacy-historical:<id>`.

## Database migration/deployment

No destructive or production-data migration is required. Startup calls the idempotent `ensurePlayerProfileIntegritySchema` through the existing admin schema initialization. It only adds nullable/defaulted player columns and creates new award/suggestion tables and indexes.

New player columns:

- `birth_day`, `birth_month`, `birth_year`;
- `birthday_visibility`;
- `profile_field_status_json`;
- `profile_checked_at`, `profile_updated_at`.

New tables:

- `player_verified_awards`;
- `player_award_suggestions`.

Do not reset, restore or re-import production Turso as part of deployment. Existing non-empty production data remains canonical.

## Environment variables

No new environment variables are required.
