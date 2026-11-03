# Architecture review of the whole application — 2026-11-03

Owner, 2026-11-03: «у нас же должна быть сущность "Игра" со статусом… а получается разные вещи Клубная игра и Турнирная игра… Ты исправляешь следствие, а не причину. Пройтись по всему приложению и сделать архитектуру всего, чтобы такого не было опять.»

Status: **owner «да» 2026-11-03 for the entities and the order; step 1 «Игра» started: the one type `src/shared/game.ts` and reader `src/server/services/gameService.ts` (both tables, statuses, formats), the rule AGENTS §3c and the guard test `architectureEntityGuard.test.ts`. First consumer done: «Продолжить игру» for every game (one table by game key, one gate for both windows). Next: the 19 files that know both tables, one per PR.** Originally: analysis for the owner's agreement. No code is changed on the strength of this document until the owner says «да»** (AGENTS §3b, §4e). Numbers are from the current `main` (source search) and production (GET only).

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

## 1a. Full map: every table of the application (160, owner question «разве больше сущностей?»)

The first version of this review named only the five things stored in several shapes. This is the whole application: every real table (test/probe tables excluded) belongs to one of eleven areas.

| Area | Tables | Tables |
|---|---|---|
| Человек (игрок, профиль, вход) | 26 | `players`, `player_avatars`, `player_external_identities`, `player_claim_links`, `player_onboarding_link_requests`, `player_onboarding_sessions`, `player_profile_cosmetics`, `player_profile_merge_previews`, `player_profile_merges`, `player_referrals`, `player_notification_preferences`, `telegram_link_requests`, `vk_identity_link_requests`, `vk_player_identity_claims`, `vk_player_oauth_states`, `vk_oauth_credentials`, `vk_oauth_states`, `vk_join_oauth_states`, `vk_join_sessions`, `organizer_player_access`, `organizer_player_access_audit`, `player_club_milestones`, `guest_player_placeholders`, `guest_player_replacement_audit`, `guest_player_migration_diagnostics`, `guest_player_migration_state` |
| Событие | 19 | `game_evenings`, `evening_tables`, `evening_game_slots`, `evening_slot_settings`, `evening_extensions`, `evening_staff_assignments`, `evening_price_policies`, `evening_price_settings`, `evening_music_exclusions`, `tournaments`, `tournament_evening_audit`, `tournament_final_resolutions`, `custom_events`, `poker_tournaments`, `clocktower_rooms`, `novice_applications`, `rating_periods`, `rating_period_evening_overrides`, `evening_seat_plans` |
| Участник события | 12 | `evening_participants`, `evening_response_history`, `evening_slot_registrations`, `player_evening_invitations`, `evening_start_confirmations`, `evening_attendance_rewards`, `tournament_participants`, `tournament_registrations`, `custom_event_registrations`, `custom_event_invitations`, `poker_tournament_entries`, `clocktower_room_members` |
| Игра | 12 | `games`, `tournament_games`, `tournament_game_seats`, `tournament_game_player_results`, `tournament_game_protocols`, `tournament_game_best_moves`, `game_replay_frames`, `game_speech_recordings`, `game_virtual_role_deals`, `live_game_checkpoints`, `gomafia_external_games`, `rating_period_game_overrides` |
| Итоги, награды, рейтинг | 15 | `achievement_definitions`, `player_achievements`, `user_achievements`, `player_achievement_overrides`, `player_achievement_preferences`, `player_verified_awards`, `player_award_suggestions`, `evening_player_votes`, `evening_mvp_decisions`, `evening_mvp_runoffs`, `player_connection_analytics_revision`, `gomafia_player_links`, `gomafia_player_snapshots`, `gomafia_refresh_attempts`, `gomafia_tournament_appearances` |
| Деньги и жетоны | 17 | `financial_transactions`, `token_ledger`, `token_packages`, `payment_intents`, `robokassa_test_invoices`, `fundraising_campaigns`, `gift_collections`, `gift_contributions`, `shop_items`, `shop_purchases`, `evening_fee_waivers`, `evening_fee_waiver_migration_diagnostics`, `regular_evening_payment_integrity_checks`, `tournament_payment_claims`, `tournament_game_token_settlements`, `betting_pools`, `betting_bets` |
| Доставка (сообщения и публикации) | 37 | `telegram_destinations`, `telegram_message_outbox`, `telegram_dispatch_outbox`, `telegram_sync_outbox`, `vk_message_outbox`, `personal_notification_deliveries`, `player_notification_reads`, `evening_announcement_dm_delivery`, `evening_announcement_dm_tracking`, `evening_announcement_state`, `evening_auto_reminders`, `evening_reminder_campaign_state`, `evening_shortfall_actions`, `evening_reschedule_notices`, `evening_reschedule_recipients`, `evening_telegram_publications`, `vk_evening_publications`, `tournament_telegram_publications`, `custom_event_publications`, `poker_tournament_publications`, `club_result_posts`, `club_digest_posts`, `club_weekly_automation_runs`, `evening_today_posts`, `evening_cancel_posts`, `evening_gathered_posts`, `external_publications`, `publication_deliveries`, `publication_delivery_decisions`, `publication_delivery_migrations`, `announcement_photos`, `announcement_short_links`, `vk_announcement_photo_uploads`, `vk_callback_events`, `vk_callback_runtime`, `vk_poll_votes`, `post_text_templates` |
| Покер (отдельная игра) | 4 | `poker_hand_log`, `poker_invites`, `poker_runtime_state`, `poker_table_chat` |
| Обучение и досуг | 8 | `player_split_vote_progress`, `player_learning_activity`, `daily_word_puzzles`, `daily_word_sessions`, `judge_music_tracks`, `music_link_entries`, `bot_faq_entries`, `whats_new_entries` |
| Работа организатора | 5 | `curator_tasks`, `organizer_agenda_snoozes`, `club_order_dismissals`, `broadcast_overlay_layout`, `obs_remote_connections` |
| Служебное | 5 | `app_data_migrations`, `application_migration_history`, `admin_change_log`, `analytics_input_versions`, `ui_usage_events` |

What else the full map shows, beyond the five duplicated entities of section 1:

- **Человек has two kinds of person**: a player profile (`players`) and a guest without a profile (`guest_player_placeholders`, with its own migration and replacement audit). Owner rule 2026-11-02 keeps guests as guests; in the target model both are a «person» of the Участник entity, not two parallel rosters.
- **Account linking is solved once per channel**: `telegram_link_requests`, `vk_identity_link_requests`, `vk_player_identity_claims` and three separate VK login state tables (`vk_oauth_states`, `vk_player_oauth_states`, `vk_join_oauth_states`). Target: one «Привязка аккаунта» flow (channel = Telegram / VK) inside Человек.
- **Poker and Clocktower are separate games with their own engines** (`poker_*`, `clocktower_*`). That is legitimate — the rules differ — but their tournaments and rooms are events: in the target model `poker_tournaments` and `clocktower_rooms` are kinds of Событие, and their entries are Участник.
- **Итоги и награды** are already one owner each (achievements, awards, MVP votes, Elo); `user_achievements` is only the import source of the old bot. The MVP vote exists for evenings only — whether tournaments get it is the owner's decision, not an architecture default.
- **Обучение, работа организатора, служебное** have no duplicates.

So the target model is **six entities to unify** — Событие, Игра, Участник (with Человек), Деньги, Доставка, Привязка аккаунта — and five areas that already have one owner each (итоги и награды, покер, обучение и досуг, работа организатора, служебное).

## 2. Target model (to agree)

Six entities, each with **one** table family, **one** status list and **one** service that every screen, Telegram/VK and the bot use.

1. **Событие** — anything players come to. One record: kind (вечер / турнир / своё событие / покер), date, place, status (черновик → опубликовано → идёт → завершено / отменено), registration rules, price. Kind-specific details in a side table only when truly specific (poker blinds, tournament stage).
2. **Игра** — one record per game of any kind: событие, номер, **format (клубная / новичковая / рейтинговая / турнирная)**, **status (запланирована → идёт → завершена / отменена / в архиве)**, judge, seats (место → участник, роль), one protocol schema, results per seat in one table, chronology, replay frames, the live session copy («Продолжить игру»). A new format — e.g. a separate rating game — is a new value of `format`, never a new table.
3. **Участник** — a person in an event: player or guest, answer (RSVP), attendance, payment, seat booking. The same for evenings and tournaments.
4. **Деньги** — one ledger of what is due and paid (rubles) next to the existing token ledger; screens read the one rule (AR03 is the pattern).
5. **Доставка** — one outbox for every message and post (Telegram, VK, personal, public) with one status set (ждёт / отправлено / неизвестно / ошибка) — `publication_deliveries` grown to cover all.
6. **Привязка аккаунта** — one flow to link a person to Telegram or VK (one state table, one claim table), inside Человек.

## 3. How to get there without losing data

No big-bang rewrite and no bulk data rewrite (AGENTS §7). Each step is a separate PR with its own tests and is reversible:

1. **One code layer per entity first, tables later.** A `Game` service with one TypeScript type and one status, reading both `games` and `tournament_games`. All 19 «knows both» files and both live windows move to it, one screen per PR. After this step a feature is written once and works for every game — «Продолжить игру» for tournaments falls out of it instead of being a second copy.
2. **One storage for new records.** New games are written into the one table (with `format`); old rows are moved by a guarded migration with a backup and a read-back check, only with the owner's «да» for that migration.
3. The same two steps for Событие → Участник → Доставка → Привязка аккаунта → Деньги, in this order (Деньги last: highest risk, AUDIT-only until the owner authorises it).
4. **A guard against the cause** — a rule in AGENTS: a new kind of game or event is a new value of the entity's `kind`/`format`, never a new table or a copied window; a CI check lists the tables and fails on a new `*_games` / `*_participants` / `*_publications` table without an architecture note.

## 4. Decisions for the owner

1. Agree the five entities and the order «Игра → Событие → Участник → Доставка → Деньги»?
2. Start with step 1 for «Игра» (one code layer, no data moved)? The parked «Продолжить игру» for tournaments (branch `claude/wip-live-checkpoint-any-game`) is then done on top of it as the first consumer.
3. #1151 («Продолжить игру» for club games): merge now as is (works, tested) or hold it until the «Игра» layer?

## 5. Moving the 19 files to «Игра» (progress)

The 19 files that read both game tables, and how each moves. Each move keeps the behaviour or names the rule it unifies.

| File | Reads games for | Status |
|---|---|---|
| `playerStaffStatsService.ts` | games a player judged, by format | ✅ moved (`listGamesJudgedBy`) |
| `playerAchievementsService.ts` (judged count) | achievements «судил N игр» | ✅ moved (`listGamesJudgedBy`); its played-games part — next |
| `auth.ts` | may an assigned judge conduct this game | ✅ moved (`getGame`; F1 decided) |
| `playerJudgingRoutes.ts` | the judge's «Мои игры» list | ✅ tournament part moved (`listGamesJudgedBy`; F1 decided) |
| `playerGameDetailRoutes.ts`, `playerProfileService.ts`, `playerSelfCoreRoutes.ts` | a player's games and profile | next |
| `eloRatingService.ts`, `playerEloHistoryService.ts`, `ratingRoutes.ts`, `metricRatingService.ts`, `gameStatisticsService.ts`, `clubGameAnalyticsService.ts`, `clubAnalyticsService.ts` | Elo, ratings, statistics | next |
| `playerAchievementStoriesService.ts` | achievement stories | next |
| `liveBroadcastRoutes.ts`, `broadcastLobbyService.ts` | OBS broadcast | next |
| `clubResultData.ts`, `clubResultPostService.ts` | result pictures and posts | next |

The layer now owns three rules that had been written several times (all as achievements already counted): a tournament game is **completed** when the game and its protocol are completed; the **judge** of a tournament game is the game's judge, else the tournament's; a game of a **cancelled evening** is cancelled even with a protocol.

- **F1 — decided by the owner 2026-11-03** (BUSINESS_RULES «Judge of a tournament game»): the tournament's judge conducts every game of a one-table tournament; with two tables the judge is bound to the table. Was: the judge-access check (`auth.ts`) and the judge's game list (`playerJudgingRoutes.ts`) take only the game's own judge, while the counting rule above also takes the tournament's judge. So in a managed tournament evening whose judge is set on the tournament, the judge's games are counted for them but not listed in «Мои игры» and cannot be opened with judge access. Should the tournament's judge be able to conduct its games?
