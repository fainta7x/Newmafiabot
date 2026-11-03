# Architecture review of the whole application — 2026-11-03

Owner, 2026-11-03: «у нас же должна быть сущность "Игра" со статусом… а получается разные вещи Клубная игра и Турнирная игра… Ты исправляешь следствие, а не причину. Пройтись по всему приложению и сделать архитектуру всего, чтобы такого не было опять.»

Status: **analysis for the owner's agreement. No code is changed on the strength of this document until the owner says «да»** (AGENTS §3b, §4e). Numbers are from the current `main` (source search) and production (GET only).

## 1. The cause

The application grew feature by feature. Each new kind of event or game got **its own tables and its own code path** instead of extending one entity. Every later feature that touches «a game» or «an event» then has to be written two to five times, and whatever is written once covers only one kind — this is exactly how «Продолжить игру» came out for club games only.

The database has 155 tables. The same business thing is stored in several shapes:

| Business thing | How it is stored today | Cost |
|---|---|---|
| **Игра** | `games` (every game of an evening: club, novice, rating — the format is the evening's) and `tournament_games` (+ `tournament_game_seats`, `tournament_game_player_results`, `tournament_game_protocols`); a third shape for imported games `gomafia_external_games` | 47 source files read `tournament_games`, 59 read `games`, **19 must know both** (Elo, statistics, profile, achievements, replay, broadcast…). Two live-game windows (`EveningLiveGameModal` 783 lines, `TournamentLiveGameModal` 542 lines), two protocol save paths (`gamesRoutes` + `clubGameProtocolService` vs `tournamentProtocolRoutes` 936 lines), two broadcast handlers. Club results live inside the protocol JSON (`games.protocol_text.player_results`), tournament results in a table — the same fact in two forms. |
| **Событие** (what players come to) | `game_evenings`, `tournaments`, `custom_events`, `poker_tournaments` (+ `clocktower_rooms`); a tournament can also be run «as an evening» (`tournament_evening_flow`) | 133 / 119 / 5 / 7 files. Announcements, reminders, cancellation, calendar, registration and publications are written per kind. |
| **Участник события** | `evening_participants`, `tournament_participants` + `tournament_registrations`, `custom_event_registrations`, `poker_tournament_entries`; guests as `guest_player_placeholders` | 87 / 37+10 / 3 / 7 / 12 files. RSVP, attendance and payment exist only for evenings; a tournament has its own registration and payment claims. |
| **Публикация / сообщение** | `telegram_message_outbox`, `vk_message_outbox`, `telegram_dispatch_outbox`, `telegram_sync_outbox`, `personal_notification_deliveries`, `evening_announcement_dm_delivery`, plus a publication table per kind (`evening_telegram_publications`, `vk_evening_publications`, `tournament_telegram_publications`, `custom_event_publications`, `poker_tournament_publications`, `club_result_posts`, `evening_today_posts`, `evening_cancel_posts`, `external_publications`); the newer common `publication_deliveries` covers only part | Retry, «unknown delivery», pause and channel choice are solved again for each table. |
| **Деньги** | evening amounts on `evening_participants` + fee waivers + adjustments; `tournament_payment_claims`; `payment_intents` / Robokassa; `gift_contributions`; `shop_purchases`; the token ledger | Balances agree today (tokens 40/40, debts 13 players, 6 150 ₽), but every new kind of payment adds a new path. |

What is already shared and works: the game engine (`LiveGameEngine`, one for every game), roles (`gameRoles.ts`), the read model for statistics (`StatGame` with `source: 'club' | 'tournament'`), the protocol core, RSVP rules (`eveningResponse.ts`), the debt rule (AR03). These are proof that one owner per fact works.

## 2. Target model (to agree)

Five entities, each with **one** table family, **one** status list and **one** service that every screen, Telegram/VK and the bot use.

1. **Событие** — anything players come to. One record: kind (вечер / турнир / своё событие / покер), date, place, status (черновик → опубликовано → идёт → завершено / отменено), registration rules, price. Kind-specific details in a side table only when truly specific (poker blinds, tournament stage).
2. **Игра** — one record per game of any kind: событие, номер, **format (клубная / новичковая / рейтинговая / турнирная)**, **status (запланирована → идёт → завершена / отменена / в архиве)**, judge, seats (место → участник, роль), one protocol schema, results per seat in one table, chronology, replay frames, the live session copy («Продолжить игру»). A new format — e.g. a separate rating game — is a new value of `format`, never a new table.
3. **Участник** — a person in an event: player or guest, answer (RSVP), attendance, payment, seat booking. The same for evenings and tournaments.
4. **Деньги** — one ledger of what is due and paid (rubles) next to the existing token ledger; screens read the one rule (AR03 is the pattern).
5. **Доставка** — one outbox for every message and post (Telegram, VK, personal, public) with one status set (ждёт / отправлено / неизвестно / ошибка) — `publication_deliveries` grown to cover all.

## 3. How to get there without losing data

No big-bang rewrite and no bulk data rewrite (AGENTS §7). Each step is a separate PR with its own tests and is reversible:

1. **One code layer per entity first, tables later.** A `Game` service with one TypeScript type and one status, reading both `games` and `tournament_games`. All 19 «knows both» files and both live windows move to it, one screen per PR. After this step a feature is written once and works for every game — «Продолжить игру» for tournaments falls out of it instead of being a second copy.
2. **One storage for new records.** New games are written into the one table (with `format`); old rows are moved by a guarded migration with a backup and a read-back check, only with the owner's «да» for that migration.
3. The same two steps for Событие → Участник → Доставка → Деньги, in this order (Деньги last: highest risk, AUDIT-only until the owner authorises it).
4. **A guard against the cause** — a rule in AGENTS: a new kind of game or event is a new value of the entity's `kind`/`format`, never a new table or a copied window; a CI check lists the tables and fails on a new `*_games` / `*_participants` / `*_publications` table without an architecture note.

## 4. Decisions for the owner

1. Agree the five entities and the order «Игра → Событие → Участник → Доставка → Деньги»?
2. Start with step 1 for «Игра» (one code layer, no data moved)? The parked «Продолжить игру» for tournaments (branch `claude/wip-live-checkpoint-any-game`) is then done on top of it as the first consumer.
3. #1151 («Продолжить игру» for club games): merge now as is (works, tested) or hold it until the «Игра» layer?
