# 2LA Noire — Architecture Map

This file answers **where a subsystem lives and what owns it**. It does not own current release status or work procedure.

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

## 5. Player application

Primary shell:

- `src/components/player/PlayerCabinetShell.tsx`

Primary areas:

- `PlayerHomeDashboard.tsx` — Home;
- `PlayerEventsCalendar.tsx` — events/registration/game slots;
- `PlayerGamesHub.tsx` + `PlayerHistoryStatsView.tsx` — games/history/stats;
- `PlayerRatingHub.tsx` / `PlayerRatingTable.tsx` — rating;
- `PlayerClubHub.tsx` — club/directory;
- `PlayerWalletHub.tsx` — wallet/tokens/economy;
- `PlayerProfileHub.tsx` — self identity/avatar/personal music slots;
- `PlayerConductCenter.tsx` — judge/host workspace;
- `JudgeMusicPlaylist.tsx` — staff/judge music playlist;
- `PlayerLiveOnlyCenter.tsx` — live-only experience.

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
- `EveningParticipantsWorkboard.tsx`;
- `EveningCloseoutPanel.tsx`;
- `PlayersCRM.tsx`;
- `TasksCRM.tsx`;
- `AnalyticsCRM.tsx`;
- `MoreCRM.tsx`.

`PlayersCRM.tsx` is the one organizer-facing player work card. `PlayerAccessSettings.tsx` owns game level/club role/judge authority; `PlayerServiceTools.tsx` owns token/Elo/manual-achievement corrections. `DataSettingsCRM.tsx` owns club-wide catalogs/expert data, not a competing player editor.

Broad CRM UX redesign is product work, not an architecture prerequisite. It is currently deferred by user preference.

## 8. Attendance / closeout / payment ownership

Quick CRM row actions should update affected local state without forcing a full evening reload.

Primary UI:

- `EveningParticipantsWorkboard.tsx`;
- `EveningCloseoutPanel.tsx`;
- `EveningPaymentsPanel.tsx` where mounted.

Primary server services:

- `src/server/services/closedEveningPaymentService.ts` — canonical closed-evening paid/unpaid mutation and payment-adjustment ledger behavior;
- `src/server/services/eveningPaymentPricingService.ts` — canonical CASUAL pricing from actually completed/played games and closed-ledger reconciliation.

Both financial adjustment paths must respect the unique source identity `(source_type, source_id, type)` and be idempotent on retry. A duplicate-key failure is a service/ledger bug, not a reason to delete financial history.

## 9. Games / protocol correction / pending-save recovery

Organizer game workflow lives in CRM evening-game components and current game/protocol routes.

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

Voting outcomes remain authoritative in `src/shared/tournamentVoting.ts`.

Before changing voting/fouls/removals/PPK/speech timing/zero round/game completion, read `docs/BUSINESS_RULES.md` and focused tests.

Current canonical launcher passes controlled hidden-role state. A bare direct `LiveGameEngine` fallback still starts internal role visibility as visible; treat this as low-priority cleanup, not evidence that the real club launcher exposes roles.

## 11. Server route ownership

### Organizer/club

- `/api/admin-data` -> `adminDataRoutes.ts`;
- `/api/commerce` -> `commerceAdminRoutes.ts`;
- `/api/evenings` -> evening/announcement/slot/closeout routes;
- `/api/participant` / `/api/evening-participants` -> participant routes;
- `/api/players` -> player/Elo/token routes;
- `/api/tasks` -> task routes;
- `/api/analytics` -> analytics routes;
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

- `src/db/index.ts` — authoritative backend selection and DB wrapper;
- `src/db/tursoHttpDatabase.ts` — Turso HTTP adapter;
- `src/db/` + `drizzle/` — schema/migrations/ensure logic.

### Production backend selection

`getDb()` selects storage as follows:

1. both `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` -> remote Turso;
2. neither -> local SQLite through `DATABASE_PATH`/default path;
3. only one Turso variable -> fail startup.

Existing non-empty runtime data always wins over repository checkpoint data.

Canonical checkpoint artifacts:

- `mafia_crm.checkpoint.sqlite.gz.b64`;
- `mafia_crm.checkpoint.meta.json`.

Never restore a checkpoint over a non-empty production/runtime DB during ordinary work.

## 15. Production container topology

Current canonical topology:

`public HTTPS -> nginx:8080 -> Node web/API:3000`

`public /webhook and /crm/* -> nginx:8080 -> Python bot service:8081`

Process ownership:

- `deploy/supervisord.conf` — Node/Python/nginx supervision;
- `deploy/nginx.conf` — public routing;
- `deploy/start-web.sh` — internal Node startup/config;
- `deploy/start-bot.sh` — Python bot startup/config;
- `Dockerfile` — combined image;
- `amvera.yml` — container port/persistent mount configuration.

Node/Turso owns canonical production product data. Bot local SQLite is legacy runtime state and must not replace Turso.

Canonical deployment source: `fainta7x/Newmafiabot` `main`.

## 16. Runtime health

- `GET /api/health` in `src/app.ts` — shallow Node liveness and Kubernetes probe target.
- `GET /api/health/runtime` — deep read-only Turso + Python bot + Telegram runtime check.
- `.github/workflows/runtime-monitor.yml` — independent external monitor.
- Supervisor restarts individual processes; Amvera may restart the container when shallow Node liveness fails.

Do not use the deep endpoint as Kubernetes liveness/readiness.

## 17. Legacy Render

`render.yaml` is retained historical/fallback configuration. Render is not the canonical combined-container target.

Green GitHub main still does not prove an Amvera deployment or runtime verification.

## 18. Testing / CI

- `src/tests/` — Vitest.
- `e2e/` — isolated mobile Playwright.
- `.github/workflows/ci.yml` — authoritative ordinary CI workflow.
- `src/scripts/projectContext.ts` — read-only handoff/project-state check.

## 19. Navigation rule

For a normal task:

1. `AGENTS.md`;
2. `PROJECT_STATE`;
3. latest 5–10 `main` commits;
4. `FEATURE_MAP` or `ERROR_PLAYBOOK`;
5. exact source/tests;
6. this architecture map when ownership/topology is unclear.

Old open PRs and old roadmaps are not architecture truth. Compare them with current code before using them as work instructions.
