# 2LA Noire — Feature Map

Fast first-hop map for known features. For fuzzy terms use `npm run project:find -- "<query>"`; after edits use `npm run project:affected -- <files>`.

This map reflects current `main`. Do not use old roadmap text to infer that a subsystem is missing when it is listed here as implemented.

## Player shell / navigation

- Shell/router: `src/components/player/PlayerCabinetShell.tsx`.
- Unified Player/Organizer mode switch: `src/components/ProductModeSwitch.tsx`; route-level wiring: `src/App.tsx` and `src/components/OrganizerCRM.tsx`.
- Shared fixed chrome: `src/components/player/PlayerQuickAccessBar.tsx` and `src/components/player/PlayerBottomNavigation.tsx`.
- Navigation model: `src/components/player/playerCabinetNavigation.ts`; focused coverage: `src/tests/playerCabinetNavigation.test.ts`.
- Primary hubs: `PlayerHomeDashboard.tsx`, `PlayerGamesHub.tsx`, `PlayerRatingHub.tsx`, `PlayerClubHub.tsx`.
- History/stats content: `src/components/player/PlayerHistoryStatsView.tsx`.
- API family: `/api/player/*` mounts in `src/app.ts`, especially `src/server/routes/playerSelfRoutes.ts` and related player route modules.

**Already implemented:** Player Cabinet ↔ Organizer CRM bidirectional mode switching. Do not propose “connect the two apps” as new work unless a concrete missing transition is identified.

## Events / calendar / registration

- Player UI: `src/components/player/PlayerEventsCalendar.tsx`.
- Organizer: `src/components/crm/EveningsList.tsx`, `src/components/crm/EveningWorkspace.tsx`.
- API: `src/server/routes/eveningsRoutes.ts`, `participantRoutes.ts`, `playerEveningJourneyRoutes.ts`, `eveningSlotRoutes.ts`.
- Rolling Friday calendar + Monday 19:00 TG/VK/personal-announcement reconciliation: `src/server/services/weeklyEveningAutomationService.ts`.
- State schema: `src/db/ensureWeeklyEveningAutomationSchema.ts`.
- Focused coverage: `src/tests/weeklyEveningAutomation.test.ts`.
- Existing Telegram `public_router_refresh_task` reaches `/api/bot/telegram/public-router`; `botTelegramRoutes.ts` reuses that heartbeat for the due-aware weekly reconciler.

### RSVP ↔ game-slot synchronization

- Canonical participant response compatibility: `src/lib/eveningResponse.ts` plus participant/server routes.
- Exact game-slot plan API: `src/server/routes/eveningSlotRoutes.ts` and player event UI callers.
- Telegram RSVP integration: `src/server/routes/botTelegramRoutes.ts` / related bot announcement handlers and Python bot bridge.
- Current behavior: `going` selects all slots; `late`/`thinking` do not invent exact slots; `declined` clears slots; manual exact selection persists through the canonical PUT/save path.

## Games / stats / career / replay

- Player UI: `PlayerGamesHub.tsx`, `PlayerHistoryStatsView.tsx`, `PlayerCareerProfile.tsx`, `PlayerReplayScreen.tsx`.
- Organizer evening games: `src/components/crm/EveningGamesView.tsx`, `EveningGameProtocolModal.tsx`, `EveningLiveGameModal.tsx`.
- API: `gamesRoutes.ts`, `playerGameDetailRoutes.ts`, `playerReplayRoutes.ts`, `playerExperienceRoutes.ts`, `playerInsightsRoutes.ts`.

### Pending/final game save recovery

When a final save is stuck or reports a roster conflict, start here:

- organizer list/editor: `src/components/crm/EveningGamesView.tsx` and protocol modal;
- pending-save/outbox helpers in the evening-game client flow;
- server game/protocol update route in `src/server/routes/gamesRoutes.ts` / evening game routes;
- focused tests: search `pending club game`, `identity recovery`, `final save reliability` under `src/tests/`.

Current invariant: stale local gameplay data may be rebased **by seat** onto the canonical server roster, but stale local `player_id` / `participant_id` values must not replace server identities.

## Rating / Elo

- UI: `src/components/player/PlayerRatingHub.tsx`, `PlayerRatingTable.tsx`.
- API: `ratingRoutes.ts`, `ratingPeriodRoutes.ts`, `ratingPeriodStandingsRoutes.ts`, `eloSeedAdminRoutes.ts`.
- Formula work: `npm run project:find -- "elo expected rating"` before changing output.

## Wallet / tokens / shop / payments

- Player UI: `src/components/player/PlayerWalletHub.tsx`.
- API: `playerEconomyRoutes.ts`, `playerPaymentRoutes.ts`, `playerTokensRoutes.ts`, `commerceAdminRoutes.ts`.
- Token ledger: `src/server/services/tokenLedgerService.ts`.
- External online acquiring/SBP is intentionally disabled until explicit provider decision; manual accounting is real functionality.

## Evening attendance / closeout / payments

Primary organizer surfaces:

- `src/components/crm/EveningParticipantsWorkboard.tsx` — quick attendance/payment actions;
- `src/components/crm/EveningCloseoutPanel.tsx` — closeout reconciliation;
- `src/components/crm/EveningPaymentsPanel.tsx` — dedicated payment view when used by the workspace.

Server ownership:

- participant routes: `src/server/routes/participantRoutes.ts` and evening closeout routes;
- closed-evening payment mutation: `src/server/services/closedEveningPaymentService.ts`;
- canonical regular-evening pricing/reconciliation: `src/server/services/eveningPaymentPricingService.ts`.

Important invariants:

- quick row changes should update local UI state instead of reloading the whole evening;
- closed-evening payment edits go through the canonical service;
- both `evening_payment_adjustment` and `evening_pricing_reconcile` ledger writes must be idempotent under the unique `(source_type, source_id, type)` key;
- do not “fix” a payment uniqueness error by deleting ledger history or resetting the DB.

Focused coverage includes `src/tests/closedEveningPaymentCompatibility.test.ts` plus payment/reconciliation regression tests.

## Betting

- UI bridge: `src/components/BettingLiveBridge.tsx`.
- API: `playerBettingRoutes.ts`, `organizerBettingRoutes.ts`.
- Service: `src/server/services/bettingPoolService.ts`.

## Profile / club / conduct / avatars

- Profile/self identity: `PlayerProfileHub.tsx`, `PlayerProfileSettings.tsx`, `PlayerIdentityFields.tsx`; canonical read/write is `/api/player/me`.
- Conduct/staff workspace: `PlayerConductCenter.tsx`.
- Club discovery: `PlayerClubDirectory.tsx`, `PlayerClubConnections.tsx`.
- Organizer player work card: `PlayersCRM.tsx`; access/roles: `PlayerAccessSettings.tsx`; token/Elo/manual-achievement corrections: `PlayerServiceTools.tsx`.
- API: `playerSelfCoreRoutes.ts`, `playersRoutes.ts`.
- Avatars: `src/lib/playerAvatarManifest.ts`, `public/player-avatars/`.

## Music system

**Already implemented.** Do not treat “build music database/player” as open backlog without a concrete missing behavior.

- Player personal music slots: profile components under `src/components/player/` and player self API.
- Staff/judge persistent library / playlist: `src/components/player/JudgeMusicPlaylist.tsx` and conduct surfaces.
- Live conducted-game playback: `src/components/JudgeGameMusicController.tsx`.
- Live Game requests music stop/start through the controller bridge from `LiveGameEngine.tsx`.
- Event pool/admin context also appears in CRM music-related components/routes.

When music behaves incorrectly, trace `library/pool selection -> controller state -> external/source playback` rather than creating a parallel music subsystem.

## Organizer CRM

- Shell: `src/components/OrganizerCRM.tsx`.
- Routing/path model: `src/components/crm/organizerRouting.ts`; coverage: `src/tests/organizerRouting.test.ts`.
- Auth/session/overview/evening/player refresh: `src/components/crm/useOrganizerCrmSession.ts`.
- UI: `CRMOverview.tsx`, `EveningsList.tsx`, `EveningWorkspace.tsx`, `PlayersCRM.tsx`, `TasksCRM.tsx`, `AnalyticsCRM.tsx`, `MoreCRM.tsx`.
- API: `crmRoutes.ts`, `tasksRoutes.ts`, `analyticsRoutes.ts`, `adminDataRoutes.ts`.

Broad CRM UX redesign is currently deferred. Old PR #174 is historical context, not authoritative backlog; compare any proposed piece with current `main` first.

## Adding an existing player to an active evening

- Quick/add-player UI lives in organizer evening participant/workspace components.
- Participant create/bulk routes normalize canonical `response_status` and legacy compatibility fields.
- The current in-progress evening must remain selectable until it is actually closed/cancelled.
- Walk-ins should preserve/fabricate no prior RSVP: factual `attendance_status=attended` is independent from planned response.

Search focused coverage for `manual player add`, `walk-in`, and `active evening` in `src/tests/`.

## Evenings / announcements

- Workspace: `src/components/crm/EveningWorkspace.tsx`.
- API: `eveningsRoutes.ts`, `participantRoutes.ts`, `eveningAnnouncementRoutes.ts`, `tableScoutingRoutes.ts`.
- Announcement creation and external Telegram/VK delivery are separate diagnostic stages.
- Weekly auto-announcement deliberately keeps calendar publication separate from external publication.

### Telegram history preservation

Closed evenings must not have their old useful Telegram announcement replaced wholesale by a minimal “registration closed” message. Start with announcement/publication finalization code in `botAnnouncementRoutes.ts`, `botTelegramRoutes.ts`, Telegram sync/outbox services and the Python bot message-edit path.

## Live Game / voting / fouls / PPK

- Main UI/state: `src/components/LiveGameEngine.tsx` plus `src/components/LiveGameEngine/`.
- Setup: `setupMode.ts`, `setupRoles.ts`, `setupState.ts`.
- Day speech ordering: `daySpeechModel.ts`.
- Night targeting/checks: `nightTargetModel.ts`.
- Two-fouls-for-+30 rule: `speechExtensionModel.ts`.
- Timer calculations: `timerModel.ts`.
- Voting presentation: `votingPresentationModel.ts`.
- Seat presentation: `seatPresentationModel.ts`.
- Snapshot schema/restore: `engineStateModel.ts`.
- Overlays/actions/best move: `LiveGameOverlays.tsx`.
- Voting outcomes: `src/shared/tournamentVoting.ts`.
- Discipline: `src/lib/gameDiscipline.ts`.
- Game/protocol markers: `src/lib/gameProtocolCore.ts`.
- Flow helpers: `src/lib/liveGameFlow.ts`, `src/lib/liveVoting.ts`.

Recent invariants to preserve:

- disputed-set speeches happen once per unchanged candidate set;
- vote assignments are directly correctable/reassignable;
- Undo restores complete editable voting state;
- actual next day starter rotates from the actual previous starter and skips unavailable seats;
- night shot/check markers do not leak past their subphase;
- canonical club launcher hides roles by default;
- routine player actions remain available during active phases;
- protocol/best-move overlays have a usable Back path;
- `+30с за 2 фола` follows `docs/BUSINESS_RULES.md`.

Browser evidence: `e2e/live-game.html`, `e2e/live-game-harness.tsx`, `e2e/tests/live-game.spec.mjs`.

Read `docs/BUSINESS_RULES.md` before changing game behavior.

## Tournaments / protocols / awards / results

- API: `tournamentsRoutes.ts`, `protocolImportsRoutes.ts`, `tournamentProtocolRoutes.ts`, `tournamentAwardsRoutes.ts`, `flexibleTournamentResultsRoutes.ts`, `tournamentTokenSettlementRoutes.ts`, `judgeAuthorityAdminRoutes.ts`.
- Schema: `drizzle/` and matching `src/db/ensure*.ts`.
- Wrong result: trace persisted protocol -> calculation/service -> publication/UI; do not patch only the final number.

## Speech recording

- API: `src/server/routes/playerSpeechRecordingRoutes.ts`.
- Runtime/design notes: `docs/game-audio-v1.md`.
- Find callers with `npm run project:find -- "speech recording audio"`.

## Telegram

- Web API: `botRoutes.ts`, `botAnnouncementRoutes.ts`, `botTelegramRoutes.ts`, `telegramSettingsRoutes.ts`.
- Worker: `src/server/services/telegramSyncOutboxService.ts`.
- Python: `main.py`, `bot_api.py`, `bot_announcement_api.py`, `bot_profile_link_api.py`, `bot_telegram_api.py`, `handlers/`.
- Runtime docs: `docs/telegram-runtime-health.md`, `docs/telegram-webapp-integration.md`.
- Green CI does not prove live token/webhook/deployed SHA.

## Runtime health / outage alerts

- Shallow liveness: `/api/health` in `src/app.ts`.
- Safe deep endpoint: `runtimeHealthRoutes.ts` -> `runtimeReadinessService.ts` -> Turso + Telegram/bot checks.
- Independent monitor: `.github/workflows/runtime-monitor.yml` -> `scripts/runtimeMonitor.mjs`.
- Amvera probe/operator procedure: `docs/RUNBOOK.md`.
- Never use the deep endpoint for Kubernetes liveness.

## VK

- `src/server/routes/integrationRoutes.ts`.
- Services: `vkJoinStartRouter.ts`, `vkJoinRegistrationCallbackRouter.ts`, `vkJoinRespondRouter.ts`, `vkJoinStateRouter.ts`, `vkDirectIntegrationRouter.ts`, `vkRuntimeHealthService.ts`.
- Runtime doc: `docs/vk-runtime-health.md`.

## Auth / permissions

- `src/server/auth.ts`, `src/server/routes/authRoutes.ts`, route mount order in `src/app.ts`.
- Organizer client: `src/components/OrganizerCRM.tsx`.
- If reads work but mutation gets 401/403, verify middleware on the exact route first.

## DB / schema / checkpoints

- `src/db/index.ts`, `src/db/`, `drizzle/`.
- Checkpoints: `src/scripts/createGitCheckpoint.ts`, `src/scripts/importGitCheckpoint.ts`, `mafia_crm.checkpoint.meta.json`.
- Safety rules: `AGENTS.md`, `docs/RUNBOOK.md`, `docs/BINARY_ARTIFACT_SAFETY.md`.
- Never overwrite a non-empty runtime DB as a side effect of sync/startup/import.

## CI / dependencies / deploy

- `.github/workflows/ci.yml`, `package.json`, `package-lock.json`, `src/scripts/releaseAudit.ts`, `src/scripts/projectContext.ts`.
- Canonical deploy target is Amvera combined Docker; `render.yaml` is legacy configuration.
- Green main != deployed main != runtime verified.
- Dependency PRs such as Dependabot updates are maintenance candidates, not product backlog.

## Generic recipe

1. Known feature: start here.
2. Unknown label/error/table/route: `npm run project:find -- "<exact phrase>"`.
3. Read only top 3–8 first hops.
4. Compare old PR/roadmap claims with current code before calling them unfinished.
5. After edits: `npm run project:affected -- <files>`.
6. Iterate with focused tests; before merge use the repository’s required CI gate.
