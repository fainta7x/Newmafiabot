# 2LA Noire — Architecture Map

This document is a navigation index for targeted work. It is intentionally shorter than a full technical specification.

Use it to answer: **where should I look first?**

Do not treat it as proof that a specific function still behaves exactly as described; read the relevant implementation before changing it.

## Request flow

Typical web flow:

`React component -> src/lib/api.ts -> Express route -> service / DB wrapper -> SQLite`

Typical integration flow:

`Organizer/player UI -> Express integration route -> integration service -> Telegram/VK API or Python bot service -> persisted status/outbox`

## Application entry points

### Node/web server

- `server.ts` — process entry point.
- `src/app.ts` — Express application construction, schema ensures, reconciliations, router mounting, production static serving.

The fastest way to understand currently mounted APIs is to inspect `src/app.ts`. Do not infer active routes from filenames alone.

### React application

- `src/` — application source.
- `src/components/` — large UI modules.
- `src/lib/api.ts` — primary client API facade/types used by organizer UI and older shared code.
- `src/types/` — shared TypeScript data shapes.

## Player application

Primary shell:

- `src/components/player/PlayerCabinetShell.tsx`

Primary player areas:

- `PlayerHomeDashboard.tsx` — home.
- `PlayerEventsCalendar.tsx` — events/calendar, registration and event details.
- `PlayerGamesHub.tsx` — games hub/navigation.
- `PlayerCabinetV2.tsx` — active history/statistics content; despite the V2 name it is still used.
- `PlayerRatingHub.tsx` — rating/Elo/rating periods.
- `PlayerClubHub.tsx` — club/player directory.
- `PlayerWalletHub.tsx` — wallet, tokens, economy/payment-facing UX.
- `PlayerProfileHub.tsx` — player profile/settings.
- `PlayerConductCenter.tsx` — conduct/game-management experience extracted from the removed legacy shell.
- `PlayerSmartNotifications.tsx` — player notification navigation.
- `PlayerLiveOnlyCenter.tsx` — live-only overlays/experience.

Important routing normalization in `PlayerCabinetShell.tsx`:

- `payments` resolves to `wallet`.
- `more` resolves to `club`.
- bottom navigation is Home / Events / Games / Rating / Club.

## Organizer CRM

Primary shell:

- `src/components/OrganizerCRM.tsx`

Main organizer areas:

- `src/components/crm/CRMOverview.tsx`
- `src/components/crm/EveningsList.tsx`
- `src/components/crm/EveningWorkspace.tsx`
- `src/components/crm/PlayersCRM.tsx`
- `src/components/crm/TasksCRM.tsx`
- `src/components/crm/AnalyticsCRM.tsx`
- `src/components/crm/MoreCRM.tsx`

Organizer URL map:

- `/admin` — overview.
- `/admin/evenings` — evenings.
- `/admin/evenings/:id` — evening overview.
- `/admin/evenings/:id/participants` — participants.
- `/admin/evenings/:id/tables` — tables.
- `/admin/evenings/:id/games` — games.
- `/admin/players` — players.
- `/admin/players/:id` — player detail.
- `/admin/tasks` — tasks.
- `/admin/analytics` — analytics.
- `/admin/more` — secondary/admin/system areas.

## Live Game / game protocol

Primary UI area:

- `src/components/LiveGameEngine/`

Before changing voting, fouls, removals, PPK, zero round or game completion behavior:

1. read `docs/BUSINESS_RULES.md`;
2. locate the relevant Live Game tests;
3. preserve the user-approved rules even if a simplification appears cleaner.

Speech recording:

- `src/components/LiveGameEngine/SpeechRecordingPilot.tsx` — browser recording/local fallback.
- `src/server/routes/playerSpeechRecordingRoutes.ts` — player-facing server route.
- `src/server/routes/speechRecordingRoutes.ts` — underlying clip upload/list/audio behavior where applicable.

## Server route groups

`src/app.ts` is authoritative for what is mounted.

### Player (`/api/player`)

Major router files include:

- `playerJudgingRoutes.ts`
- `playerJudgeMusicRoutes.ts`
- `playerSelfRoutes.ts`
- `playerLiveRoutes.ts`
- `playerPulseRoutes.ts`
- `playerStoriesRoutes.ts`
- `playerEveningVotingRoutes.ts`
- `playerProgressionRoutes.ts`
- `playerProfileSettingsRoutes.ts`
- `playerGameDetailRoutes.ts`
- `playerRatingPeriodRoutes.ts`
- `playerEconomyRoutes.ts`
- `playerBettingRoutes.ts`
- `playerPaymentRoutes.ts`
- `playerExperienceRoutes.ts`
- `playerInsightsRoutes.ts`
- `playerReplayRoutes.ts`
- `playerEveningJourneyRoutes.ts`

Speech recordings are mounted separately under:

- `/api/player/speech-recordings`

Caution: `playerSelfRoutesLegacy.ts` still serves real behavior via the current self routes. Confirm usage before cleanup.

### Organizer / club data

- `/api/admin-data` -> `adminDataRoutes.ts`
- `/api/commerce` -> `commerceAdminRoutes.ts`
- `/api/evenings` -> announcement + evening routes
- `/api/participant` and `/api/evening-participants` -> participant routes
- `/api/players` -> player/Elo/token routes
- `/api/tasks` -> tasks
- `/api/analytics` -> analytics
- `/api/crm` -> CRM + table scouting
- `/api/rating` and `/api/rating-periods` -> rating flows

### Games

- `/api/games` -> organizer betting + active game routes.
- `POST /api/games` itself is intentionally retired and returns HTTP 410.

Do not resurrect the old creation route. Create/manage games through the evening/tournament protocol workflow.

### Tournaments

Mounted under `/api/tournaments`:

- Telegram publication.
- judge authority.
- flexible results.
- tournament CRUD/workflow.
- protocol imports.
- token settlement.
- protocol editing.
- awards.

### Public

Mounted under `/api/public`:

- VK join start/respond/state.
- public live.
- public routes/join experiences.

## Telegram

Web-side route/service areas:

- `src/server/routes/botRoutes.ts`
- `src/server/routes/botAnnouncementRoutes.ts`
- `src/server/routes/botTelegramRoutes.ts`
- `src/server/routes/telegramSettingsRoutes.ts`
- tournament Telegram routes.
- Telegram publishing schema/service files.
- `src/server/services/telegramSyncOutboxService.ts` — worker starts outside test runtime.

Python bot process/modules live mainly at repository root and under bot handler modules, including:

- `main.py`
- `config.py`
- `commands.py`
- `bot_menu.py`
- `bot_announcement_api.py`
- `bot_api.py`
- `bot_profile_link_api.py`
- `bot_telegram_api.py`
- `handlers/`

Safe runtime diagnostics are documented in:

- `docs/telegram-runtime-health.md`

Do not smoke-test by sending a club-wide announcement when a read-only health check or targeted recipient test is sufficient.

## VK

Primary web integration entry:

- `src/server/routes/integrationRoutes.ts`

Additional join/direct routers/services are mounted in `src/app.ts`, including:

- `vkJoinStartRouter.ts`
- `vkJoinRegistrationCallbackRouter.ts`
- `vkJoinRespondRouter.ts`
- `vkJoinStateRouter.ts`
- `vkDirectIntegrationRouter.ts`

VK schema ensure files:

- `src/db/ensureVkIntegrationSchema.ts`
- `src/db/ensureVkJoinSchema.ts`

Safe runtime diagnostics are documented in:

- `docs/vk-runtime-health.md`

Build-time VK direct variants may be selected through Vite configuration. Check `vite.config.*` before declaring `.vk-direct.*` files unused.

## Database and persistence

Primary DB area:

- `src/db/`
- `src/db/index.ts` — database wrapper/opening.

At application startup `src/app.ts` ensures multiple schemas and performs guarded reconciliations/backfills.

Critical safety rule:

**A non-empty runtime database wins over repository bootstrap/checkpoint data.**

Repository checkpoint artifacts are recovery/bootstrap tools, not a synchronization mechanism for live production data.

See:

- `AGENTS.md`
- `docs/RUNBOOK.md`

before any DB/checkpoint operation.

## Testing

- `src/tests/` — main Vitest coverage.
- Feature-local tests may also exist close to implementation files.
- `vite.config.*` contains Vitest/build configuration.

The current policy is the full Vitest suite with no project-specific hidden exclusion list.

When fixing a bug:

1. add/adjust a focused regression test where practical;
2. run focused tests while iterating;
3. rely on full CI before merge.

## Build and CI

Main scripts in `package.json`:

- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run release:audit`
- `npm run project:status` (handoff/status helper)

CI:

- `.github/workflows/ci.yml`

Current CI runs Node 22 and blocks on data-safety audit, typecheck, tests and production build; a separate Python 3.11 job compiles bot sources.

## Deployment

- `render.yaml` — Render service definition.

Current staging service definition:

- service: `2la-noire-web-staging`
- branch: `main`
- region: Frankfurt
- health path: `/api/health`
- `autoDeployTrigger: off`

A merged/green Git commit is therefore **not proof of deployment**.

See `docs/RUNBOOK.md` for the runtime verification sequence.

## Fast discovery rules

For a normal task, do **not** scan the whole repository.

Use this order:

1. `AGENTS.md`
2. `docs/PROJECT_STATE.md`
3. last 5–10 commits on `main`
4. this architecture map
5. files directly related to the requested feature
6. focused tests for those files

Only widen discovery when the targeted path is insufficient or contradictory.
