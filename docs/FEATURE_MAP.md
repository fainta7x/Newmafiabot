# 2LA Noire — Feature Map

Fast first-hop map for known features. For fuzzy terms use `npm run project:find -- "<query>"`; after edits use `npm run project:affected -- <files>`.

## Player shell / navigation
- UI: `src/components/player/PlayerCabinetShell.tsx`, `playerCabinetNavigation.ts`, `PlayerHomeDashboard.tsx`, `PlayerGamesHub.tsx`, `PlayerRatingHub.tsx`, `PlayerClubHub.tsx`.
- Navigation model: `src/components/player/playerCabinetNavigation.ts`; focused coverage: `src/tests/playerCabinetNavigation.test.ts`.
- History/stats content: `src/components/player/PlayerHistoryStatsView.tsx` — active embedded view, not a second cabinet.
- API family: `/api/player/*` mounts in `src/app.ts`, especially `src/server/routes/playerSelfRoutes.ts` and related player route modules.

## Events / calendar / registration
- UI: `src/components/player/PlayerEventsCalendar.tsx`.
- Organizer: `src/components/crm/EveningsList.tsx`, `src/components/crm/EveningWorkspace.tsx`.
- API: `src/server/routes/eveningsRoutes.ts`, `participantRoutes.ts`, `playerEveningJourneyRoutes.ts`.
- Selection closes after refresh/save: inspect local selection/deep-link effects before touching DB.

## Games / stats / career / replay
- UI: `PlayerGamesHub.tsx`, `PlayerHistoryStatsView.tsx`, `PlayerCareerProfile.tsx`.
- API: `playerGameDetailRoutes.ts`, `playerReplayRoutes.ts`, `playerExperienceRoutes.ts`, `playerInsightsRoutes.ts`.

## Rating / Elo
- UI routing: `src/components/player/PlayerRatingHub.tsx`; current table fetch/render: `src/components/player/PlayerRatingTable.tsx`.
- API: `ratingRoutes.ts`, `ratingPeriodRoutes.ts`, `ratingPeriodStandingsRoutes.ts`, `eloSeedAdminRoutes.ts` under `src/server/routes/`.
- Formula work: `npm run project:find -- "elo expected rating"` before changing UI output.

## Wallet / tokens / shop / payments
- UI: `src/components/player/PlayerWalletHub.tsx`.
- API: `playerEconomyRoutes.ts`, `playerPaymentRoutes.ts`, `playerTokensRoutes.ts`, `commerceAdminRoutes.ts`.
- Service: `src/server/services/tokenLedgerService.ts`.
- External online acquiring/SBP is intentionally disabled until explicit provider decision; manual accounting is real functionality.

## Betting
- UI bridge: `src/components/BettingLiveBridge.tsx`.
- API: `playerBettingRoutes.ts`, `organizerBettingRoutes.ts`.
- Service: `src/server/services/bettingPoolService.ts`.

## Profile / club / conduct / avatars
- UI: `PlayerProfileHub.tsx`, `PlayerClubDirectory.tsx`, `PlayerClubConnections.tsx`, `PlayerConductCenter.tsx`.
- API: `playerProfileSettingsRoutes.ts`, `playersRoutes.ts`.
- Avatars: `src/lib/playerAvatarManifest.ts`, `public/player-avatars/`.

## Organizer CRM
- Shell: `src/components/OrganizerCRM.tsx`.
- UI: `src/components/crm/CRMOverview.tsx`, `EveningsList.tsx`, `EveningWorkspace.tsx`, `PlayersCRM.tsx`, `TasksCRM.tsx`, `AnalyticsCRM.tsx`, `MoreCRM.tsx`.
- API: `crmRoutes.ts`, `tasksRoutes.ts`, `analyticsRoutes.ts`, `adminDataRoutes.ts`.

## Evenings / participants / tables / announcements
- UI: `src/components/crm/EveningWorkspace.tsx`.
- API: `eveningsRoutes.ts`, `participantRoutes.ts`, `eveningAnnouncementRoutes.ts`, `tableScoutingRoutes.ts`.
- Announcement creation and external Telegram/VK delivery are separate diagnostic stages.

## Live Game / voting / fouls / PPK
- Main UI: `src/components/LiveGameEngine.tsx` plus `src/components/LiveGameEngine/` and `src/components/game/`.
- API: `gamesRoutes.ts`, `playerLiveRoutes.ts`, `publicLiveRoutes.ts`.
- Read `docs/BUSINESS_RULES.md` before changing game behavior.
- `POST /api/games` is intentionally retired with HTTP 410 in `src/app.ts`.

## Tournaments / protocols / awards / results
- API: `tournamentsRoutes.ts`, `protocolImportsRoutes.ts`, `tournamentProtocolRoutes.ts`, `tournamentAwardsRoutes.ts`, `flexibleTournamentResultsRoutes.ts`, `tournamentTokenSettlementRoutes.ts`, `judgeAuthorityAdminRoutes.ts`.
- Schema: `drizzle/` and matching `src/db/ensure*.ts`.
- Wrong result: trace persisted protocol -> calculation/service -> publication/UI; do not patch only the final number.

## Speech recording
- API: `src/server/routes/playerSpeechRecordingRoutes.ts`.
- Design/runtime notes: `docs/game-audio-v1.md`.
- Find callers with `npm run project:find -- "speech recording audio"`.

## Telegram
- Web API: `botRoutes.ts`, `botAnnouncementRoutes.ts`, `botTelegramRoutes.ts`, `telegramSettingsRoutes.ts`.
- Worker: `src/server/services/telegramSyncOutboxService.ts`.
- Python: `main.py`, `bot_api.py`, `bot_announcement_api.py`, `bot_profile_link_api.py`, `bot_telegram_api.py`, `handlers/`.
- Runtime docs: `docs/telegram-runtime-health.md`, `docs/telegram-webapp-integration.md`.
- Green CI does not prove live token/webhook/deployed SHA.

## VK
- `src/server/routes/integrationRoutes.ts`.
- Services: `vkJoinStartRouter.ts`, `vkJoinRegistrationCallbackRouter.ts`, `vkJoinRespondRouter.ts`, `vkJoinStateRouter.ts`, `vkDirectIntegrationRouter.ts`, `vkRuntimeHealthService.ts`.
- Runtime doc: `docs/vk-runtime-health.md`.
- Diagnose OAuth/callback state, persisted DB state and live VK API access separately.

## Auth / permissions
- `src/server/auth.ts`, `src/server/routes/authRoutes.ts`, route mount order in `src/app.ts`.
- Organizer client: `src/components/OrganizerCRM.tsx`.
- If reads work but mutation gets 401/403, verify middleware on the exact route first.

## DB / schema / checkpoints
- `src/db/index.ts`, `src/db/`, `drizzle/`.
- Checkpoints: `src/scripts/createGitCheckpoint.ts`, `src/scripts/importGitCheckpoint.ts`, `mafia_crm.checkpoint.meta.json`.
- Safety rules: `AGENTS.md`, `docs/RUNBOOK.md`.
- Never overwrite a non-empty runtime DB as a side effect of sync/startup/import.

## CI / dependencies / Render
- `.github/workflows/ci.yml`, `package.json`, `package-lock.json`, `render.yaml`, `src/scripts/releaseAudit.ts`, `src/scripts/projectContext.ts`.
- Render is manual (`autoDeployTrigger: off`); green main != deployed main.

## Generic recipe
1. Known feature: start here.
2. Unknown label/error/table/route: `npm run project:find -- "<exact phrase>"`.
3. Read only top 3–8 first hops.
4. After edits: `npm run project:affected -- <changed files>`.
5. Iterate with focused tests; before merge run `npm run project:verify`; GitHub CI is authoritative.
