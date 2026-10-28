# 2LA Noire — Architecture Map

This file answers **where a subsystem lives and what owns it**. It does not own current release status or work procedure. Which module is the single definition of each club concept (role, team, game, evening status, price…) is owned by [`DOMAIN_MODEL.md`](DOMAIN_MODEL.md).

## 1. Request flow

Typical web flow:

`React UI -> src/lib/api.ts / fetch -> Express route -> service/DB wrapper -> storage`

Typical integration flow:

`Organizer/player UI -> Express integration route -> integration service -> Telegram/VK/Python bot -> persisted status/outbox`

## 2. Application entry points

### Node/web

- `server.ts` — process entry.
- `src/app.ts` — Express construction, schema ensures/reconciliation, router mounts and static serving.

`src/app.ts` is authoritative for mounted APIs. Do not infer active routes from filenames alone.

### React

- `src/App.tsx` — route-level product shell.
- `src/components/` — Player, Organizer CRM, Live Game and shared UI.
- `src/lib/api.ts` — main client API facade/shared client types.
- `src/lib/requestJson.ts` — shared transport helpers and existing-response parsing (`readJsonResponse`); compatibility for a server `message` field is explicit per caller. Request shapes and post-write refresh order remain caller-owned; there is no global response cache.
- `src/types/` — shared data shapes.

## 3. Unified Player / Organizer product shell

Player Cabinet and Organizer CRM are **two role-based modes of one product**, not two separate applications.

- `src/App.tsx` owns route transitions between `/player/*` and `/admin/*`.
- `src/components/ProductModeSwitch.tsx` owns the shared bidirectional mode control.
- `src/components/player/PlayerCabinetShell.tsx` owns the Player shell.
- `src/components/OrganizerCRM.tsx` owns the Organizer shell.

Switching mode changes working context without logging the user out and without weakening permission checks.

This integration is implemented and is not a future architecture task.

### Canonical entity ownership

Each editable product fact should have one owner. Secondary surfaces may summarize/link, but should not create a competing save model.

| Entity / action | Canonical owner |
| --- | --- |
| Sporting Mafia role identity, names, team, icon token and palette | `src/shared/gameRoles.ts`; UI: `src/components/ui/GameRole.tsx` |
| Player self identity/avatar/two personal music slots | Player profile |
| Club roster record/access/roles/organizer notes/service corrections | CRM `Игроки` |
| Staff/judge music library | Player conduct/music workspace |
| Event/live music pool | Existing CRM/conduct music flow, not a second library |
| Live playback/pause/collapse | `JudgeGameMusicController` |
| Player RSVP and exact game plan | Player/Telegram event flow + evening slot routes |
| Event composition/tables/tasks/closeout | CRM evening workspace |
| Closed-evening payment mutation | `closedEveningPaymentService.ts` |
| Regular-evening canonical pricing reconciliation | `eveningPaymentPricingService.ts` |

## 4. Evening participant state compatibility

`response_status` is the canonical planned RSVP. `registration_status` remains persisted as synchronized compatibility state for historical data/old clients.

Active readers should use `getEveningResponse()` rather than directly treating the legacy field as authoritative. Current writers should write canonical response state and keep compatibility synchronization narrow/idempotent.

Planned response is separate from factual attendance:

- planned: `response_status`;
- factual: `attendance_status + arrival_status`;
- payment: `amount_due + amount_paid + payment_status`;
- exact game commitment: evening game-slot plan rows/routes.

A walk-in can therefore be `unanswered` (or keep an older real response) while also being factually `attended` and participating in games.

### Participant write authority and read projections

- Persisted participant RSVP and physical attendance are written through `src/server/services/eveningParticipantState.ts` and the authenticated routes (including `participantRoutes.ts`). Compatibility `registration_status` is not a second source of truth.
- Current/legacy RSVP and attendance are interpreted by `eveningDomain.ts` and `eveningResponse.ts`.
- Two **read-only**, distinct CRM projections belong to `src/lib/eveningParticipantView.ts`: `isInOrganizerWorkingRoster` includes manually added unanswered participants; `needsEveningCloseoutAttendance` identifies only pending participants who previously answered going/late.
- Game-seat eligibility is separately owned by `isEveningGameRosterEligible` in `eveningDomain.ts` and game services; selection of particular game slots by `eveningSlotPlanningService.ts` (read model, pricing) and `eveningSlotWritesService.ts` (organizer slot settings and a player's game choice, which refresh the announcements and send the reschedule notice); format-specific payment expectation by `eveningPaymentScope.ts` and the pricing services.
- A player may be in the organizer roster without an automatic game slot. A walk-in may have arrived without an earlier positive RSVP. Do not infer payments or game eligibility from the organizer roster predicate; do not move write operations into presentation adapters.

**Parallel architecture work:** Claude's shared game-team normalization and client GET helper are distinct from the participant state projection workstream. Reconcile other agent branches against the latest `main` rather than overwriting them.

## 5. Player application

Primary shell:

- `src/components/player/PlayerCabinetShell.tsx`

Primary areas:

Bottom menu of four (owner decision 2026-10-06): Главная · Вечера · Сообщество · Прогресс; the wallet and the settings are icons in the header.

- `PlayerHomeDashboard.tsx` — «Главная»: next evening, debt for past evenings, club news, «Обучение» card;
- `PlayerEveningsHub.tsx` — «Вечера»: «Скоро» (`PlayerEventsCalendar.tsx`), «Прошедшие» (`PlayerEveningSummaries.tsx`), «Мои игры» (`PlayerHistoryStatsView.tsx`);
- `PlayerCommunityHub.tsx` — «Сообщество»: «Игроки» (directory/metrics/form), «Рейтинг» (Elo/season/tournaments), «Связи», «История» (evenings/games/Hall of Fame), «Мини-игры». `PlayerSeasonHub.tsx` shares one selected period between sporting standings and separately labelled club statistics; `ClubConnectionCard.tsx` is the common relationship summary. Old Activity/metric URLs resolve through `appNavigation.ts`, viewer-local group preferences through `communityViewMemory.ts`;
- `PlayerMetricRatings.tsx` — one category matrix and two-player comparison. `metricTableService.ts` reuses existing `metricRatingService` calculations with a shared full scope; `shared/metricTable.ts` carries per-cell units/samples. `connectionContentService.ts` derives factual scoped pair stories/history from canonical snapshots; `ConnectionPairHistory.tsx` links to existing protocols. The hub hands a compared pair/scope to Connections.
- `PlayerProfileHub.tsx` — «Прогресс»: own profile (`CanonicalPremiumPlayerProfile.tsx`) with the «Обучение» tab (`PlayerLearningBlock.tsx`);
- `PlayerSettingsHub.tsx` — «Настройки» (gear): my details, notifications, privacy, music;
- `PlayerWalletHub.tsx` — wallet/tokens/economy;
- `PlayerConductCenter.tsx` — judge/host workspace;
- `JudgeMusicPlaylist.tsx` — staff/judge music playlist;
- `PlayerLiveOnlyCenter.tsx` — live-only experience.

Form points have one implementation in `shared/playerForm.ts`, used by `playerPulseRoutes.ts`; UI explanations describe that existing index. The pulse adds recent outcomes/date only when the viewer may see game statistics (or owns them). Seasonal club statistics accept an exact RATING period key, preserving the sporting table’s independent eligibility/distance.

Primary player APIs are under `/api/player/*`; inspect `src/app.ts` and `src/server/routes/player*Routes.ts` for exact ownership.

## 6. Music architecture

The music subsystem already exists.

- Personal tracks/slots belong to the player profile.
- Staff/judge persistent library and playlist are exposed through conduct (`JudgeMusicPlaylist.tsx`).
- Conducted-game playback is owned by `src/components/JudgeGameMusicController.tsx`.
- `LiveGameEngine.tsx` communicates with the controller for phase/game music actions.
- CRM/event music surfaces should reuse the same persistent library/pool concepts rather than creating a second music database.

Future work must start from a concrete missing music behavior, not from a “music system is not built” assumption.

## 7. Organizer CRM

Primary shell:

- `src/components/OrganizerCRM.tsx`

Main areas:

- `CRMOverview.tsx`;
- `EveningsList.tsx`;
- `EveningWorkspace.tsx`;
- `EveningCloseoutPanel.tsx`;
- `PlayersCRM.tsx`;
- `TasksCRM.tsx`;
- `AnalyticsCRM.tsx`;
- `MoreCRM.tsx`.

`PlayersCRM.tsx` is the one organizer-facing player work card. `PlayerAccessSettings.tsx` owns game level/club role/judge authority; `PlayerServiceTools.tsx` owns token/Elo/manual-achievement corrections. `DataSettingsCRM.tsx` owns club-wide catalogs/expert data, not a competing player editor.

Broad CRM UX redesign is product work, not an architecture prerequisite. It is currently deferred by user preference.

### Novice funnel ownership

The canonical first-visit/novice funnel is Node/WebApp-owned. `novice_applications` records the first route; novices self-activate, while experienced visitors await organizer review. `players.club_stage` owns the relationship with 2LA Noire; neither Telegram nor VK keeps a parallel funnel. `players.game_level` remains the independent playing-skill/access classification. Player entry lives in the events calendar, experienced-player decisions live in CRM **Ещё → Люди и обучение → Заявки новых игроков** (internal id `development`), and both external channels receive organizer decisions through the existing personal notification router.

## 8. Attendance / closeout / payment ownership

Quick CRM row actions should update affected local state without forcing a full evening reload.

Primary UI:

- `EveningActiveRosterView.tsx`;
- `EveningCloseoutPanel.tsx`;
- `EveningPaymentsPanel.tsx` where mounted.

Primary server services:

- `src/server/services/closedEveningPaymentService.ts` — canonical closed-evening paid/unpaid mutation and payment-adjustment ledger behavior;
- `src/server/services/eveningPaymentPricingService.ts` — canonical CASUAL pricing from actually completed/played games and closed-ledger reconciliation.

Both financial adjustment paths must respect the unique source identity `(source_type, source_id, type)` and be idempotent on retry. A duplicate-key failure is a service/ledger bug, not a reason to delete financial history.

## 9. Games / protocol correction / pending-save recovery

Organizer game workflow lives in CRM evening-game components and current game/protocol routes. Pure player/discipline, shots and first-killed/best-move consistency belongs to `src/lib/protocolConsistency.ts`; club save service, tournament routes and tournament completion UI consume it. Club and tournament voting structure, hierarchy and completion are owned by `src/lib/protocolVotingValidation.ts` and reused by both servers and completion forms, parameterized by fixed table size and the stored club zero-round rule. Club protocols without historical ballot evidence retain their legacy save path; no ballots are invented. Tournament rules always use the tournament default.

**One protocol window for both game kinds (2026-10-24).** `src/components/crm/gameProtocol/` owns the window and every edit (`useProtocolEditing`, `ProtocolWorkspace`); the club editor (`EveningGameProtocolModal`, `/api/games/:id/evening-protocol`) and the tournament editor (`tournaments/GameProtocolModal`, `/api/tournaments/...`) are adapters that load, save, confirm, reopen and may veto a change (`guards`) — the tournament asks before changes that cost points.

Important ownership split:

- server roster identity is canonical;
- local pending-save/outbox data owns unsent gameplay/protocol detail only;
- correction mode may edit supported completed protocol data without replacing unrelated roster/history.

If a stale local pending save references an outdated player identity, recovery may rebase protocol/gameplay data **by seat** onto the current server roster. It must not use stale local IDs to replace canonical server `player_id` / `participant_id`.

Pending failed saves must remain openable in the protocol editor so the organizer is not trapped behind a retry-only state.

## 10. Live Game

Primary implementation:

- `src/components/LiveGameEngine.tsx`;
- `src/components/LiveGameEngine/`;
- runtime visual layers under `src/components/crm/liveGame*.css`.

Durable helper boundaries include:

- `setupMode.ts`;
- `setupRoles.ts`;
- `setupState.ts`;
- `daySpeechModel.ts` — actual starter/next speaker ordering;
- `nightTargetModel.ts`;
- `speechExtensionModel.ts` — two ordinary fouls for +30 current-speech rule;
- `timerModel.ts`;
- `votingPresentationModel.ts`;
- `seatPresentationModel.ts`;
- `engineStateModel.ts` — snapshot/restore schema;
- `LiveGameOverlays.tsx`.

Game state/action ownership remains primarily in `LiveGameEngine.tsx`; seat actions remain in `SeatCard.tsx`.

`liveEngineJournal.ts` captures protocol evidence at the engine persistence boundary, using the existing voting/night/event projector in `liveClubSession.ts`. New sessions persist `protocolEvidence` beside the recovery snapshot; native reload restores that producer cursor separately from Undo. Club/tournament pollers copy native evidence; legacy interrupted sessions retain polling derivation. The final callback carries `protocol_evidence` and `protocol_snapshot` before the shared session is removed. This closes sampling loss for persisted transitions; the engine still restores state from snapshots, not event replay.

Voting outcomes remain authoritative in `src/shared/tournamentVoting.ts`.

Before changing voting/fouls/removals/PPK/speech timing/zero round/game completion, read `docs/BUSINESS_RULES.md` and focused tests.

Current canonical launcher passes controlled hidden-role state. A bare direct `LiveGameEngine` fallback still starts internal role visibility as visible; treat this as low-priority cleanup, not evidence that the real club launcher exposes roles.

### Online Poker persistence

Poker UI and rules live in `PlayerPoker.tsx`, `pokerEngine.ts` and `pokerLobbyService.ts`; `/api/player/poker/*` is owned by `pokerRoutes.ts`. `pokerPersistenceService.ts` scopes the in-memory runtime to the request database and atomically snapshots changed state to `poker_runtime_state` after a successful action, before the API response. The snapshot contains tables, active hands/history and human bankrolls; public responses still redact the deck and opponents' hidden cards. Production and the signed in-app sandbox therefore cannot share poker state. Ordinary polling compares snapshots and does not create a continuous SQLite write loop.

### OBS broadcast relay

The broadcast path is deliberately separate from final protocol persistence:

`phone Live Game/localStorage -> authenticated /api/games/:id/broadcast-state -> in-memory Node relay -> secret /api/public/broadcast/:token -> /broadcast/:token -> OBS Browser Source`

- `src/lib/liveBroadcast.ts` owns the audience-safe state contract and removes judge-only history/check/note detail.
- `src/components/crm/EveningLiveGameModal.tsx` publishes changed snapshots plus a heartbeat while the game is active.
- `src/server/services/liveBroadcastService.ts` owns the stable HMAC token, payload canonicalization and the single transient main channel.
- `src/server/routes/liveBroadcastRoutes.ts` owns authorized config/publish routes and secret read/avatar routes.
- `src/components/public/LiveBroadcastOverlay.tsx` owns the transparent 1920×1080 OBS HUD.

The phone/local scoped session remains authoritative for in-progress recovery. The relay does not write timer ticks or temporary game state to the canonical product database. Database game/seat identity is used only to canonicalize the published display. The ordinary `/live` route stays role-safe and is not a substitute for the secret broadcast route.

### OBS Studio remote bridge

Remote control uses a separate laptop-side bridge and does not expose OBS WebSocket to the internet:

`organizer phone -> authenticated /api/obs-remote pairing/status -> server -> /obs-bridge on laptop -> ws://127.0.0.1:4455 -> OBS Studio`

- `src/components/crm/ObsRemoteCRM.tsx` owns pairing and connection status inside the active-game OBS panel.
- `src/components/public/ObsBridgePage.tsx` and `src/lib/obsWebSocket.ts` own the browser-to-local-OBS connection.
- `src/server/routes/obsRemoteRoutes.ts` and `src/server/services/obsRemoteService.ts` own one-time pairing, hashed bridge tokens and the status heartbeat.
- The OBS password exists only in the laptop page's memory. It is not sent to or stored by the application server.
- Only the hashed laptop pairing is durable. Frequent live status heartbeats stay in process memory and never create a continuous SQLite write loop.
- The bridge reports OBS/WebSocket versions, the scene list and current program scene, sound inputs with mute state, and stream/recording state. Phone buttons (`POST /api/obs-remote/command`: scene, mute, stream start/stop, record start/stop) wait in process memory and ride back on the laptop's next heartbeat (~2 s); a command not taken within 20 s is dropped. Scene names agreed with the owner live in `src/lib/obsScenes.ts`. All OBS routes use `express-rate-limit`. Only the organizer's games view turns the remote on (`EveningLiveGameModal obsRemote`); an assigned judge gets the overlay link only.

## 11. Server route ownership

### Organizer/club

- `/api/admin-data` -> `adminDataRoutes.ts`;
- `/api/commerce` -> `commerceAdminRoutes.ts`;
- `/api/evenings` -> evening/announcement/slot/closeout routes;
- `/api/participant` / `/api/evening-participants` -> participant routes;
- `/api/players` -> player/Elo/token routes;
- `/api/tasks` -> task routes;
- `/api/analytics` -> thin analytics routes; `/overview`, `/now`, owner-only `/finance`, staff and legacy delegation use `clubAnalyticsService.ts` and shared Moscow range parsing in `src/lib/analyticsPeriod.ts`, with canonical deduplicated visits from `playerVisitsService.ts`. `AnalyticsCRM` keeps tab data mounted; panels abort stale reads and show retry/loading/empty states. UI-usage summaries use bounded SQL groups, with retention only on daily ingestion; announcement/usage schemas initialize before reads in both app and isolated sandbox.
- `/api/bot-faq` -> `botFaqRoutes.ts` (organizer edits the bot's «Частые вопросы»; the bot reads the switched-on ones from `GET /api/bot/faq`; table `bot_faq_entries` created lazily and seeded once from `botFaqSeed.ts`)
- `/api/whats-new` -> `whatsNewRoutes.ts` (players read published notices; the organizer writes them: `whats_new_entries` created lazily by `ensureWhatsNewSchema.ts`, first rows are drafts; CRM `WhatsNewCRM.tsx`, player `WhatsNewCard.tsx`).
- `/api/ui-events` -> `uiUsageRoutes.ts` (screen/button usage from signed-in players and organizers; the CRM «Кто куда заходил» list `GET /players` shows organizers which signed-in player opened which screens — owner decision 2026-10-13; the totals `GET /summary` stay; `uiUsageService.ts` owns the `ui_usage_events` table and its 180-day retention, `src/lib/uiUsageNames.ts` strips entity ids on both client and server);
- `/api/crm` -> CRM/table-scouting routes;
- `/api/rating` / `/api/rating-periods` -> rating flows.

### Games

- `/api/games` owns current game-related reads/actions where mounted.
- `POST /api/games` is intentionally retired with HTTP 410. Do not resurrect it.
- Create/manage games through evening/tournament protocol workflow.

### Tournaments

Mounted under `/api/tournaments` for tournament workflow, protocols, judge authority, awards, results, publication and token settlement.

### Public

Mounted under `/api/public` for public join/live paths including VK-related flows.

## 12. Telegram / announcement architecture

Web-side ownership includes:

- `botRoutes.ts`;
- `botAnnouncementRoutes.ts`;
- `botTelegramRoutes.ts`;
- `telegramSettingsRoutes.ts`;
- `src/server/services/telegramSyncOutboxService.ts`.

Python bot ownership includes root bot modules and `handlers/`.

Current RSVP architecture synchronizes coarse RSVP with exact game slots according to `BUSINESS_RULES`.

Announcement finalization must preserve useful historical Telegram content for closed evenings; “registration closed” state must not destroy the previous announcement history.

Runtime diagnostics: `docs/telegram-runtime-health.md`.

## 13. VK

Primary web entry:

- `src/server/routes/integrationRoutes.ts`;
- `vkJoin*Router.ts`;
- `vkDirectIntegrationRouter.ts`;
- `vkRuntimeHealthService.ts`.

Runtime diagnostics: `docs/vk-runtime-health.md`.

Inspect Vite transforms before declaring `.vk-direct.*` variants unused.

## 14. Database and persistence

Primary ownership:

- `deploy/start-web.sh` — storage contract; pins production to `/data/mafia_crm.sqlite` and the in-app sandbox to `/data/mafia_crm.test.sqlite`;
- `src/db/index.ts` — generic DB wrapper/bootstrap logic used by production SQLite and tests;
- `src/db/` + `drizzle/` — schema/migrations/ensure logic; nothing in `src/db/` imports server code.
- `src/server/dataMigrations/` — data migrations that need server services (Elo scale, starter tokens); `startupHistoricalRepairs.ts` runs the one-off Millourt repair from `server.ts` right after `getDb()` and before `createApp`.

### Production backend selection

Canonical Amvera production uses persistent local SQLite:

`/data/mafia_crm.sqlite`

`deploy/start-web.sh` explicitly sets `DATABASE_PATH=/data/mafia_crm.sqlite` and enables guarded first-bootstrap-from-checkpoint. Turso is retired and rejected by production validation. A password-protected sandbox in the same application uses `/data/mafia_crm.test.sqlite`, an empty-schema bootstrap with synthetic seed data, and a signed cookie to select the database per request. Background workers continue to read only the production database.

The repository checkpoint is used only when the canonical product DB is missing or empty. A non-empty `/data/mafia_crm.sqlite` must never be replaced during an ordinary deploy.

Canonical checkpoint artifacts:

- `mafia_crm.checkpoint.sqlite.gz.b64`;
- `mafia_crm.checkpoint.meta.json`.

Application-level SQLite backups are created with the SQLite backup API by `deploy/backup-sqlite.cjs` into `/data/backups/`, then verified with `integrity_check`. `npm run backup:verify -- <backup.sqlite>` performs an isolated copy/open/integrity restore drill without touching production.

The Python bot still has legacy `/data/mafia_crm.db` state through `deploy/start-bot.sh`. It is not the canonical product database and must not seed/replace `/data/mafia_crm.sqlite`. Its remaining ownership is subject to PROJECT-AUDIT-001 Phase 2.

## 15. Production container topology

Current canonical topology:

`public HTTPS -> nginx:8080 -> Node web/API:3000`

`public /webhook and /crm/* -> nginx:8080 -> Python bot service:8081`

Process ownership:

- `deploy/supervisord.conf` — Node/Python/nginx/SQLite-backup supervision;
- `deploy/nginx.conf` — public routing;
- `deploy/start-web.sh` — internal Node startup/config and product-DB path;
- `deploy/start-bot.sh` — Python bot startup/config and legacy bot-local DB link;
- `deploy/backup-sqlite.cjs` — canonical product-DB backup worker;
- `Dockerfile` — combined image;
- `amvera.yml` — container port and persistent `/data` mount.

Node + `/data/mafia_crm.sqlite` owns canonical production product data. The bot-local `mafia_crm.db` is legacy state only.

Canonical deployment source: `fainta7x/Newmafiabot` `main`.

## 16. Runtime health

- `GET /api/health` in `src/app.ts` — shallow Node liveness and Kubernetes probe target.
- `GET /api/health/runtime` — deep read-only canonical DB + Python bot + Telegram runtime check.
- `.github/workflows/runtime-monitor.yml` — independent external monitor.
- Supervisor restarts individual processes; Amvera may restart the container when shallow Node liveness fails.
- Telegram webhook ownership is process-safe across rolling deploys: startup sets the canonical webhook; shutdown must not delete the shared production webhook.

Do not use the deep endpoint as Kubernetes liveness/readiness.

## 17. Legacy Render

`render.yaml` is retained historical/fallback configuration. Render is not the canonical combined-container target.

Green GitHub main still does not prove an Amvera deployment or runtime verification.

## 18. Testing / CI

- `src/tests/` — Vitest.
- `e2e/` — isolated mobile Playwright.
- `.github/workflows/ci.yml` — authoritative ordinary CI workflow.
- `src/scripts/projectContext.ts` — read-only handoff/project-state check.
- `src/scripts/checkDependencyCycles.ts` (`npm run project:deps`) — import direction `lib/shared → db → server services → server routes`, UI does not import server/db at runtime; existing exceptions in `config/dependency-cycles-baseline.json`.

## 19. Navigation rule

For a normal task:

1. `AGENTS.md`;
2. `PROJECT_STATE`;
3. latest 5–10 `main` commits;
4. `FEATURE_MAP` or `ERROR_PLAYBOOK`;
5. exact source/tests;
6. this architecture map when ownership/topology is unclear.

Old open PRs and old roadmaps are not architecture truth. Compare them with current code before using them as work instructions.

### GoMafia external sports career
`goMafiaCareerSource.ts` owns the unauthenticated, bounded public source adapter; `gomafiaCareer.ts` owns shared payload types. `goMafiaFederationSync.ts` is the sole background/on-demand refresh writer to the existing federation snapshot table (`career-v1`). `goMafiaRoutes.ts` reads verified source data with profile visibility controls; `PlayerGoMafiaLink.tsx` renders yearly summaries and the separate sports chronology. No federation result writes club game/rating/financial tables. See `GOMAFIA_PUBLIC_SOURCE.md` for source evidence and limitations.

## Rule: a request that waits for an organizer (owner, 2026-10-12)

Any flow where a player asks for something an organizer must confirm (a GoMafia link, a level, a registration answer…) needs three things, built together: (1) a Telegram notice through `enqueueOrganizerNotification` (idempotent `messageKey`, a failed notice must not fail the player's action); (2) an item in «Порядок в клубе» (`clubOrderService.ts`) that stays until the request is resolved; (3) no extra step when the person asking is already an organizer (his own request is confirmed at once). The first user of the rule is the GoMafia link (`goMafiaRoutes.ts`, `PUT /gomafia/me`).

### Sporting role presentation

`GameRole` has four stable keys: citizen, sheriff, mafia, don. `gameRoles.ts` owns names, team, icon token and palette. `GameRoleIcon`, `GameRoleMark` and `GameRoleBadge` render this metadata. Existing `TournamentRole`, `PhysicalRole`, `StatRole` and label exports are compatibility names for the same identity. The player API adapter accepts canonical keys only: missing roles and team-only colours do not infer a role. Judge-engine names are decoded at the presentation boundary; legacy assignment normalization and visibility guards keep their behavior. Light/dark foregrounds provide contrast within one role palette.

### Evening domain ownership (2026-10-23)

System tariff settings: eveningPriceSettingsService.ts (settings API: /api/evening-prices; open evenings follow the settings, a closed evening keeps a frozen tariff in evening_price_policies; the route recounts open evenings after a save). Shared formulas and price copy: lib/eveningPrices.ts. Explicit full-evening gifts retain evening_fee_waivers and the existing CRM payment action. Open-evening status and SQL predicate: lib/eveningStatus.ts. Evening posts have their own texts per format and channel: VK in vkDirectJoinPublishingService.ts (club post from the postTemplateService template), Telegram in handlers/telegram_evening_copy.py; prices come from the settings.

### Achievement read projections and role indicators
`playerAchievementsService.ts` owns the active editable catalog, earned state, organizer overrides and earned dates; the mounted progression API projects that same profile. `src/lib/rolePerformance.ts` ranks played roles by observed win rate, breaking equal rates by games played and stable input order. Profile, progression and insights consume it without minimum-game eligibility thresholds. Titles and challenge requirements remain separate product facts.

### Live engine role boundaries
`ActivePlayerState` stores `GameRole`/`GameTeam` keys. `setupRoles.ts` parses external role spellings; `canonicalizeLivePlayers` in `engineStateModel.ts` normalizes legacy current/Undo players and rejects unknown or conflicting roles. `liveSessionStorage.ts` reads old snapshots without rewriting them and serializes canonical current/history state. UI labels, `liveGameState.ts` broadcast/state-sheet projections and the finished legacy `GameSlot` callback preserve their established human-readable format. Phase, timer and discipline ownership is unchanged.

### Observed CRM role commands

`liveRoleCorrections.ts` validates complete CRM role assignments, builds `role_corrected` events and projects those commands onto active players and recovery/Undo snapshots. TournamentLiveGameModal passes complete assignments observed by its serialized 20-second GET; incomplete assignments keep the previous authority. External role corrections are not judge Undo steps. LiveGameEngine records commands before applying them and retains legacy evidence when adopting a native journal. `liveNightChecks.ts` owns current Don/Sheriff answers for both targeting and role correction. Historical night logs stay factual; the completed tournament result still goes to draft review. Seat identity changes and final-fetch concurrency are not handled by this role-only path.

## Club reminders and MVP rounds

`playerEveningDebts.ts` is a read-only per-player projection of existing outstanding evening payments, shared by personal reminders, organizer reminders and the club-order task list. It does not own pricing or ledger mutations.

`shared/birthdayTask.ts` derives task wording from the fixed birthday occurrence in its automation key and the current Moscow calendar date. The integrity service updates the same open task; routes and outgoing reminders also project the current title, so delayed reconciliation cannot freeze the displayed countdown.

`eveningVoteRounds.ts` owns one persisted MVP runoff (`evening_mvp_runoffs`: finalists, start and deadline). Original and runoff ballots use distinct categories in the existing vote store. App/bot routes, the independent personal-notification worker and public result posts use this state; stale callback rounds cannot write into it. `eveningMvpService.ts` owns winner resolution, while `clubYearAwardsService.ts` issues the same result as a medal. Legacy award conversion changes kind in place; `trophyCabinetModel.ts:isCupAward` owns consistent cup eligibility for the cabinet, pins and timeline.

### Durable public publication attempts

Logical publication/channel keys in `publication_deliveries` freeze actual target and reconstructible payload before HTTP. Conditional claims and attempt UUIDs guard concurrency/late completion; accepted remote IDs and manual evidence remain distinct. Unknown outcomes never authorize an automatic resend or photo→text fallback. Known temporary rejections retain existing caller budgets plus Retry-After. Preparation can recover through the same durable boundary. Startup imports only unknown nonterminal legacy sends once per source database; historical terminal results and personal queues are excluded.

`publicationDeliveryService.ts` is the low-level state owner, `publicationTelegramService.ts` the public Telegram acknowledgement/serialization boundary, and `publicationRecoveryService.ts` the organizer read/reconciliation/replay projection. CRM queue GET does not run the cutover; `createApp` initializes it before workers. Recovery commands need a full organizer, actor, current attempt UUID and explicit checked-absence confirmation. Weekly automation/Python sync and personal-message policy are separate owners.
