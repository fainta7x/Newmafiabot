# GUEST-PLAYER-001 — Guest placeholder contract

This document is the durable contract for guests in regular club evenings. It supplements `BUSINESS_RULES.md`, `ARCHITECTURE.md`, `FEATURE_MAP.md` and `RUNBOOK.md` and must be kept in sync with future changes to guest handling.

## Domain rule

A **guest is an evening-local placeholder, not a player account**.

Creating a guest must not create or silently reuse a row in `players`. A guest therefore has no player profile, login identity, Telegram/VK link, Elo/rating subject, token wallet or player achievements. The normal CRM player directory must contain registered players, not guest placeholders.

A guest may still have factual evening-local state:

- display name (default: `Гость`);
- response/attendance state;
- table assignment;
- amount due, amount paid and payment status;
- evening-local notes and timestamps.

These facts belong to the evening and do not turn the guest into a player account.

## Storage model

Canonical guest rows live in `guest_player_placeholders`.

Important identity fields:

- `id` — guest placeholder / protocol participant identity;
- `evening_id` — owning evening;
- `legacy_player_id` / `legacy_participant_id` — migration provenance only;
- `replaced_by_player_id` / `replaced_at` — explicit organizer resolution state.

There is intentionally no guest `player_id` pointing to a guest-only `players` row.

`guest_player_replacement_audit` records explicit guest-to-registered-player identity transfers. Its unique key makes the same game/seat/guest/player replacement retry-safe.

`guest_player_migration_state` stores migration status/progress and `guest_player_migration_diagnostics` stores durable skip/ambiguity diagnostics.

## Game/protocol behavior

A guest can occupy a normal seat and participate in the complete sports-Mafia protocol. Guest status must not remove or weaken any game fact. The protocol may record, among other things:

- seat and role;
- ordinary and technical fouls;
- removal and PPK;
- nominations/votes and revotes;
- night shots/kills;
- first-killed/best-move data;
- CI/judge/protocol points;
- exit state and notes.

For a guest seat the canonical result carries:

- `participant_id = guest placeholder id`;
- `player_id = null`;
- `guest_placeholder_id = guest placeholder id`.

`slots_json` mirrors the same identity shape.

## Explicit guest -> registered player replacement

Replacement is an **identity repair**, not a new game event.

The organizer explicitly selects a guest seat and an existing registered player. The operation must:

1. reject an archived/migrated guest row as the replacement player;
2. reject a registered player already occupying another seat in the same game;
3. reuse or create one `evening_participants` row for that registered player;
4. replace participant/player/display identity for that seat;
5. clear `guest_placeholder_id` in both protocol and `slots_json`;
6. rewrite participant-id references inside protocol facts to the registered evening participant id;
7. preserve every non-identity gameplay fact;
8. mark the placeholder resolved and insert the audit row in the same DB transaction.

The same exact replacement request is idempotent. A retry after success returns a no-op and must not create another evening participant, audit row, token mutation, Elo effect or achievement effect.

The operation is supported for active/draft and completed non-archived club games where roster correction is allowed. Archived games must be restored before correction.

This identity repair is separate from the sports-Mafia `protocol.replacement` field, which describes an actual substitution during the game.

## Derived effects

### Elo / rating

A guest is never an Elo subject.

A completed Elo-eligible club game that still contains an unresolved guest seat is withheld from canonical Elo rebuild rather than inventing an identity or partial team rating. After the organizer explicitly resolves the guest seat to a registered player, the guest marker is removed and the normal full-game Elo rebuild can include that game.

A confirmed legacy guest (`source='legacy_guest_migrated'`) is not a rating-directory subject.

### Tokens

A guest has no wallet. Token settlement targets only results with a real `player_id`.

For a completed game, linked registered players may settle normally while an unresolved guest receives no settlement row and no token-ledger mutation. After explicit identity replacement, the registered player becomes the normal target. Settlement revisions/idempotency keys prevent double application on retries/corrections.

### Achievements

Guest placeholders are not passed to player achievement evaluation. After explicit replacement, the registered player's real `player_id` participates in the normal post-save reconciliation.

### Payments

Evening-local payment facts are allowed for a guest. They remain on the guest placeholder and may participate in evening financial close-out. They do not create a token wallet or player-account balance.

## Legacy `quick_guest` reconciliation

Automatic reconciliation is intentionally conservative.

### Reliable marker only

Only rows carrying the reliable legacy source marker `players.source='quick_guest'` are candidates for automatic conversion. **Nickname matching is forbidden.** Two people sharing the same nickname is not migration evidence.

Successful reconciliation:

- creates `guest_player_placeholders` for the legacy evening participant rows;
- preserves response, attendance, table and payment facts;
- rewrites exact protocol/slot identity references to guest placeholders;
- archives the old technical player row with `source='legacy_guest_migrated'`;
- does not delete historical rows.

### External identity ambiguity

A `quick_guest` row must not be automatically converted if there is evidence of a real external identity, including Telegram/VK fields or supported external-identity tables/claims.

Such a row remains unchanged and receives a durable `external_identity_linked` diagnostic with evidence details. This is intentionally safer than silently stripping a potentially real player identity.

A skipped ambiguous `quick_guest` row must also not be globally treated as a confirmed guest by rating/wallet/directory code. Only successfully migrated `legacy_guest_migrated` rows are confirmed technical legacy guests.

### Ambiguous historical game seats

Migration rewrites a historical game only when the target seat can be identified unambiguously by exact legacy participant/player identity. Multiple matches are not guessed; they produce an `ambiguous_game_seat` diagnostic.

## Migration reliability / operations

Migration key:

`guest_player_001_quick_guest_reconciliation_v1`

The reconciliation is application-managed and runs from schema initialization. It is designed to be idempotent and resumable:

- `status`: `running`, `failed`, `completed`;
- `total_count` / `processed_count`;
- `last_player_id` checkpoint;
- `error_message`;
- start/update/completion timestamps.

The candidate snapshot includes both still-pending `quick_guest` rows and already converted `legacy_guest_migrated` rows so a process crash after a per-player transaction but before the progress checkpoint can resume safely. Already converted rows are no-ops.

### Operational diagnostics

For investigation, read state/diagnostics through normal DB/admin tooling. Useful SQL shapes are:

```sql
SELECT *
FROM guest_player_migration_state
WHERE migration_key = 'guest_player_001_quick_guest_reconciliation_v1';

SELECT legacy_player_id, reason, details_json, updated_at
FROM guest_player_migration_diagnostics
WHERE migration_key = 'guest_player_001_quick_guest_reconciliation_v1'
ORDER BY updated_at, legacy_player_id;
```

Do **not** repair production by deleting/resetting guest tables, changing player source markers by hand or rewriting production protocol JSON manually. Fix the migration/reconciliation code, preserve diagnostics, and rerun/restart through the normal application path.

## Organizer UI contract

The organizer creation surface must clearly describe the new entry as a guest without a profile. Contact/account fields such as phone are not part of this quick guest creation path.

The protocol correction surface exposes a separate `guest -> registered player` action with:

- the guest seat/name;
- registered-player search;
- duplicate-player prevention;
- explicit confirmation;
- canonical server refresh after success.

The control must remain usable on mobile organizer screens.

## Regression coverage

At minimum, focused tests must protect these cases:

1. guest creation does not create a `players` row;
2. payment/attendance remains evening-local;
3. guest protocol identity uses null `player_id` plus `guest_placeholder_id`;
4. roles/fouls/votes/night/best-move/PPK/notes survive identity replacement;
5. replacement clears guest markers;
6. duplicate registered player in one game is rejected;
7. exact replacement retry is a no-op;
8. guest is not a token/Elo/achievement subject;
9. reliable `quick_guest` migration is idempotent/resumable;
10. Telegram/VK-linked ambiguity is skipped with durable diagnostics;
11. nickname alone is never migration evidence;
12. normal registered-player behavior remains unchanged.

Independent review must compare implementation and tests against GitHub Issue #297 before merge.
