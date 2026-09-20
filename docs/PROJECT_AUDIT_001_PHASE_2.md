# PROJECT-AUDIT-001 — Phase 2 database ownership findings

Status: in progress  
Parent: #330  
Phase issue: #332

This phase is intentionally read-first. It does not rewrite production data or collapse legacy storage before ownership is proven.

## 1. Current schema creation model

The product schema is not owned by one migration system.

Current main uses four layers:

1. **Numbered SQL migrations** — `drizzle/0000_initial.sql` through `0011_canonical_evening_attendance.sql`.
2. **Runtime ensure modules** — approximately 30 `src/db/ensure*Schema.ts` files that create tables, indexes, columns and triggers during application startup or lazy feature initialization.
3. **Application data migrations / corrections** — explicit TypeScript migration functions with durable markers or state-based idempotency.
4. **Legacy Python SQLite schema** — `database.py` independently owns a second set of tables in `/data/mafia_crm.db`.

This works today, but it makes ownership harder to reason about and makes startup behavior part of the migration system.

## 2. Canonical Node product data

Canonical production storage remains:

`/data/mafia_crm.sqlite`

Core domain tables owned by the Node product include:

- `players`;
- `game_evenings`;
- `evening_tables`;
- `evening_participants`;
- `games`;
- `financial_transactions`;
- tournament tables;
- token ledger / settlements;
- evening slots;
- Telegram publication/outbox tables;
- VK identity/publication/outbox tables;
- player profile/access/onboarding tables;
- betting/shop/commerce tables;
- guest placeholder tables;
- migration/audit tables.

## 3. Runtime ensure-owned schema

Major runtime-owned groups found:

| Group | Main tables |
| --- | --- |
| Evening slots | `evening_game_slots`, `evening_slot_registrations`, `evening_slot_settings` |
| Club operations/payment migration | `evening_staff_assignments`, `evening_fee_waivers`, migration diagnostics/history |
| Telegram publishing | `telegram_destinations`, `evening_telegram_publications`, `telegram_sync_outbox`, `telegram_dispatch_outbox`, tournament publication state |
| Telegram direct delivery | `telegram_message_outbox` |
| VK integration | `player_external_identities`, `vk_evening_publications`, OAuth/callback/poll state |
| VK personal delivery | `vk_message_outbox` |
| Guest placeholders | `guest_player_placeholders`, replacement audit, migration state/diagnostics |
| Betting | `betting_pools`, `betting_bets` |
| Profile integrity | verified awards, award suggestions, club milestones |
| Player access | organizer access + audit |
| Personal notification routing | preferences + deliveries |
| Rating periods | periods + game/evening overrides |
| Shop / commerce | shop items/purchases, token packages, payment intents, fundraising/publication records |
| Judge music | judge tracks, link entries, evening exclusions |
| Tournament evening | registrations, payment claims, audit |
| Weekly automation | `club_weekly_automation_runs` |
| Speech recording | `game_speech_recordings` |

Several of these modules also install triggers, so application behavior can change when an ensure function runs.

## 4. Canonical participant state has a compatibility duplicate

The current canonical planned RSVP is:

`evening_participants.response_status`

`registration_status` remains compatibility storage and is kept synchronized.

This is explicitly documented in architecture, but the schema history still contains both meanings. Any future cleanup must first prove that every active reader uses the canonical helper/response field before removing compatibility behavior.

Factual state remains separate:

- attendance: `attendance_status`;
- arrival: `arrival_status`;
- payment: `amount_due`, `amount_paid`, `payment_status`;
- exact intended games: slot registration tables.

## 5. Active legacy Python business database

The Python bot still opens:

`/data/mafia_crm.db`

The audit found that this is not merely an unused compatibility file. Active Python routers still read/write it.

Legacy tables referenced by `database.py` include:

- `users`;
- `evening_booking`;
- `evening_history`;
- `evening_status`;
- `evening_stats_messages`;
- `game_history`;
- `game_slots_history`;
- `game_dates`;
- `transactions`;
- `elo_ratings`;
- `user_achievements`;
- `bets_active`;
- `user_bets`;
- `night_kills_order`;
- `settings`.

### Active legacy surfaces

Although the compact bot shell sends normal player navigation to the Mini App, active routers still contain legacy features:

- old booking/list flows;
- Telegram-native profile/statistics/history/rating flows;
- old payment/debt state;
- old bets/tokens;
- judge/admin utilities;
- admin evening/history operations.

Registration is hybrid: canonical player creation/linking goes through Node APIs, but the bot also maintains a legacy `users` row for compatibility.

Therefore `mafia_crm.db` cannot simply be deleted yet.

## 6. Confirmed duplicate business concepts

The following concepts currently exist in both product SQLite and legacy bot SQLite:

| Concept | Canonical product DB | Legacy bot DB |
| --- | --- | --- |
| Player identity | `players` | `users` |
| Evening response/booking | `game_evenings` + `evening_participants` + slots | `evening_booking` / status/history |
| Game history | `games` + protocol state | `game_history` + `game_slots_history` |
| Money/debt | participant/financial ledger | `transactions` + user debt fields |
| Elo/rating | canonical player/rating services | `elo_ratings` + legacy stat calculations |
| Achievements | `player_achievements` + definitions/overrides | `user_achievements` |
| Tokens/betting | token ledger + `betting_*` | user tokens + `bets_active` / `user_bets` |

This is the largest architecture risk identified in Phase 2 so far. New features must not add another synchronization layer between these models.

## 7. Production data migrations and startup mutations

Current startup can perform real data mutations.

### Durable-marker migrations

Examples include:

- confirmed Telegram player links;
- legacy player identity import;
- approved Elo baseline;
- Millourt duplicate merge;
- Fandorin historical identity correction;
- Sep 4 historical identity correction;
- CRM-PAY historical reconciliations;
- guest placeholder reconciliation.

Most of these use `migration_history`, `application_migration_history` or dedicated migration state/diagnostic tables.

### State-idempotent correction

`applyBogdanaFinalCorrection.ts` runs from application creation and has no durable migration marker. It is narrowly state-idempotent: it checks the exact tournament/game/player result and only updates the judge bonus when it differs from the confirmed value.

This is not currently a production bug, but it is a cleanup candidate: historical one-off corrections should eventually be retired from ordinary startup after their applied state is durably proven.

### Continuous startup reconciliations

Application startup also runs reconciliations for:

- token opening balances;
- tournament token settlements;
- betting pools;
- achievements.

These are intended to be idempotent, but they make startup cost and correctness depend on application-level reconciliation behavior.

## 8. Safety bug found and fixed separately

During this phase the Telegram admin panel was found to still expose a destructive restore path for legacy `mafia_crm.db`.

That path could accept an uploaded `.db` document and replace the bot-local database while telling the organizer that “the database” had been restored, even though the canonical product DB is `/data/mafia_crm.sqlite`.

This was removed in hotfix PR #334. Telegram DB-file restore now fails closed and cannot modify runtime storage.

## 9. Production environment drift found

`.env.production.example` still described Render/Turso as production-primary even after Amvera switched to persistent SQLite.

Phase 2 updates it to the current runtime contract:

- `DATABASE_PATH=/data/mafia_crm.sqlite`;
- Amvera URL for webhook/API examples;
- internal bot service `127.0.0.1:8081`;
- Turso variables documented as legacy/recovery-only.

## 10. Risk classification

### P0/P1 — protect immediately

- destructive/misleading legacy DB restore — fixed in #334;
- any path that could overwrite canonical `/data/mafia_crm.sqlite` — none found in active bot UI after #334;
- duplicate Telegram/VK/outbox delivery — audited in later Phase 3.

### P1 — architecture risk

- active dual business databases;
- user/admin legacy handlers that can mutate data independently from canonical CRM;
- schema creation spread across numbered migrations + ensure modules;
- startup running historical data repair/reconciliation code.

### P2 — cleanup risk

- generic Turso adapter still in code despite being unreachable from canonical Amvera start script;
- old one-off corrections retained indefinitely;
- partial Drizzle schema plus runtime-added columns/triggers;
- compatibility `registration_status` retained alongside canonical `response_status`.

## 11. Required follow-up work

Phase 2 should not perform a big-bang migration. The safe sequence is:

1. instrument and inventory which legacy bot handlers are still actually reachable/used;
2. migrate active Telegram-native reads to canonical Node APIs where the feature still matters;
3. retire legacy write paths one domain at a time (booking, profile/stats, payments, bets, admin);
4. only then shrink/remove corresponding Python tables;
5. consolidate schema ownership after behavior is covered by tests;
6. move one-off historical corrections out of ordinary startup once durable completion can be proven.

## 12. Proposed PR-sized refactor slices

1. **BOT-DB-001 — Legacy bot DB usage inventory + read-only diagnostics**
2. **BOT-DB-002 — Canonicalize Telegram profile/stats/rating reads**
3. **BOT-DB-003 — Canonicalize booking/evening reads and remove legacy booking writes**
4. **BOT-DB-004 — Canonicalize payment/debt admin flows**
5. **BOT-DB-005 — Retire legacy betting/token state**
6. **DB-MIGRATION-001 — Build one schema/migration registry and startup report**
7. **DB-MIGRATION-002 — Retire completed one-off startup corrections**
8. **DB-COMPAT-001 — Prove and later remove registration_status compatibility**

Each slice needs focused regression tests and must preserve the current Mini App/API contract.

## 13. Startup mutation registry status

Current main now has a machine-readable `STARTUP_MUTATION_REGISTRY` in
`src/server/startupMutationRegistry.ts` and logs it once during `createApp`.

The registry records, in execution order:

- schema ensure operations;
- compatibility repairs;
- data migrations;
- the remaining historical one-off correction;
- runtime workers;
- continuous reconciliations.

This audit slice adds a contract test that compares registry order to the real
`src/app.ts` call order. That prevents the registry from silently becoming stale
when startup logic changes.

The registry is observational only. It does not change migration semantics.

## 13. Phase 2 conclusion so far

The product SQLite itself is not currently showing evidence of two competing Node-side canonical databases. The main architectural problem is instead **two generations of application state running side-by-side**:

- canonical Node product SQLite;
- active legacy Python bot SQLite.

The next safe step is not to delete `database.py`; it is to move still-needed bot behavior behind canonical Node APIs and reduce legacy write ownership incrementally.
