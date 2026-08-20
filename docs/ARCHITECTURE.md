# 2LA Noire — Architecture Map

This file answers **where a subsystem lives and what owns it**. It does not own current release status or work procedure.

## 1. Request flow

Typical web flow:

`React UI -> src/lib/api.ts -> Express route -> service/DB wrapper -> storage`

Typical integration flow:

`Organizer/player UI -> Express integration route -> integration service -> Telegram/VK/Python bot -> persisted status/outbox`

## 2. Application entry points

### Node/web

- `server.ts` — process entry.
- `src/app.ts` — Express construction, schema ensures/reconciliation, router mounts, static serving.

`src/app.ts` is authoritative for mounted APIs. Do not infer active routes from filenames alone.

### React

- `src/` — application source.
- `src/components/` — Player, Organizer CRM, Live Game and shared UI.
- `src/lib/api.ts` — main client API facade/shared types.
- `src/types/` — shared data shapes.

## 3. Player application

Primary shell:

- `src/components/player/PlayerCabinetShell.tsx`

Primary areas:

- `PlayerHomeDashboard.tsx` — Home;
- `PlayerEventsCalendar.tsx` — events/registration;
- `PlayerGamesHub.tsx` + `PlayerHistoryStatsView.tsx` — games/history/stats;
- `PlayerRatingHub.tsx` / `PlayerRatingTable.tsx` — rating;
- `PlayerClubHub.tsx` — club/directory;
- `PlayerWalletHub.tsx` — wallet/tokens/economy;
- `PlayerProfileHub.tsx` — profile/settings;
- `PlayerConductCenter.tsx` — judging/conduct;
- `PlayerLiveOnlyCenter.tsx` — live-only experience.

Primary player APIs are under `/api/player/*`; inspect `src/app.ts` and `src/server/routes/player*Routes.ts` for exact ownership.

## 4. Organizer CRM

Primary shell:

- `src/components/OrganizerCRM.tsx`

Main areas:

- `src/components/crm/CRMOverview.tsx`;
- `EveningsList.tsx`;
- `EveningWorkspace.tsx`;
- `PlayersCRM.tsx`;
- `TasksCRM.tsx`;
- `AnalyticsCRM.tsx`;
- `MoreCRM.tsx`.

Main organizer URLs:

- `/admin`;
- `/admin/evenings` and `/admin/evenings/:id/...`;
- `/admin/players` and `/admin/players/:id`;
- `/admin/tasks`;
- `/admin/analytics`;
- `/admin/more`.

## 5. Live Game

Primary implementation:

- `src/components/LiveGameEngine.tsx`;
- `src/components/LiveGameEngine/`;
- visual runtime layers under `src/components/crm/liveGame*.css`.

Durable pure/helper boundaries include:

- `setupMode.ts`;
- `setupRoles.ts`;
- `setupState.ts`;
- `daySpeechModel.ts`;
- `nightTargetModel.ts`;
- `timerModel.ts`;
- `votingPresentationModel.ts`;
- `seatPresentationModel.ts`;
- `engineStateModel.ts`;
- `LiveGameOverlays.tsx`.

Game state/action ownership remains primarily in `LiveGameEngine.tsx` and seat actions in `SeatCard.tsx`.

Voting outcomes remain authoritative in `src/shared/tournamentVoting.ts`.

Before changing voting/fouls/removals/PPK/zero round/game completion, read `docs/BUSINESS_RULES.md` and relevant tests.

Browser evidence:

- `e2e/live-game.html`;
- `e2e/live-game-harness.tsx`;
- `e2e/tests/live-game.spec.mjs`.

## 6. Server route ownership

### Organizer/club

- `/api/admin-data` -> `adminDataRoutes.ts`;
- `/api/commerce` -> `commerceAdminRoutes.ts`;
- `/api/evenings` -> evening/announcement routes;
- `/api/participant` / `/api/evening-participants` -> participant routes;
- `/api/players` -> player/Elo/token routes;
- `/api/tasks` -> task routes;
- `/api/analytics` -> analytics routes;
- `/api/crm` -> CRM/table-scouting routes;
- `/api/rating` / `/api/rating-periods` -> rating flows.

### Games

- `/api/games` owns current game-related organizer/betting reads/actions.
- `POST /api/games` is intentionally retired with HTTP 410. Do not resurrect it.
- Create/manage games through evening/tournament protocol workflow.

### Tournaments

Mounted under `/api/tournaments` for tournament workflow, protocols, judge authority, awards, results, publication and token settlement.

### Public

Mounted under `/api/public` for public join/live paths including VK-related flows.

## 7. Database and persistence

Primary ownership:

- `src/db/index.ts` — **authoritative backend selection and DB wrapper**;
- `src/db/tursoHttpDatabase.ts` — Turso HTTP adapter;
- `src/db/` + `drizzle/` — schema/migrations/ensure logic.

### Production backend selection

`getDb()` in `src/db/index.ts` selects storage as follows:

1. If **both** `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` exist -> use remote Turso.
2. If neither exists -> use local SQLite through `DATABASE_PATH`/default path.
3. If only one Turso variable exists -> fail startup; never silently mix backends.

For the current production contract, Turso is the primary persistent store. Render's `/tmp/...sqlite` path is fallback/local storage and must not be treated as proof that production data is ephemeral.

### Bootstrap/checkpoint

- Existing non-empty runtime data always wins.
- Repository checkpoint is used only for empty/missing bootstrap/recovery according to guarded logic.
- Canonical files: `mafia_crm.checkpoint.sqlite.gz.b64` + `mafia_crm.checkpoint.meta.json`.

Never restore a checkpoint over a non-empty production/runtime DB during ordinary deploy work.

## 8. Render

Configuration file: `render.yaml`.

Current topology:

- one Node web service;
- branch `main`;
- Frankfurt;
- Free plan;
- manual deploy;
- `/api/health` health check;
- production secrets supplied by Render, including Turso credentials.

A GitHub merge does not prove deployment. See `PROJECT_STATE` for current release/deploy state and `RUNBOOK` for procedure.

## 9. Telegram

Web-side ownership includes:

- `botRoutes.ts`;
- `botAnnouncementRoutes.ts`;
- `botTelegramRoutes.ts`;
- `telegramSettingsRoutes.ts`;
- tournament Telegram routes;
- `src/server/services/telegramSyncOutboxService.ts`.

Python bot ownership includes root bot modules and `handlers/`.

Runtime diagnostics: `docs/telegram-runtime-health.md`.

## 10. VK

Primary web entry:

- `src/server/routes/integrationRoutes.ts`;
- `vkJoin*Router.ts`;
- `vkDirectIntegrationRouter.ts`;
- `vkRuntimeHealthService.ts`.

Runtime diagnostics: `docs/vk-runtime-health.md`.

Inspect Vite transforms before declaring `.vk-direct.*` variants unused.

## 11. Testing / CI

- `src/tests/` — Vitest.
- `e2e/` — isolated mobile Playwright.
- `.github/workflows/ci.yml` — authoritative main CI workflow.
- `src/scripts/projectContext.ts` — read-only project/handoff check used by CI.

## 12. Navigation rule

For a normal task:

1. `AGENTS.md`;
2. `PROJECT_STATE`;
3. last 5–10 commits;
4. `FEATURE_MAP` or `ERROR_PLAYBOOK`;
5. exact source/tests;
6. this architecture map only when ownership/topology is unclear.

Do not turn this document into a second project-state or roadmap file.
