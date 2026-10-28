# 2LA Noire — Feature Map

Fast first-hop map for known features. For fuzzy terms use `npm run project:find -- "<query>"`; after edits use `npm run project:affected -- <files>`.

This map reflects current `main`. Do not use old roadmap text to infer that a subsystem is missing when it is listed here as implemented.

## Player shell / navigation

- Shell/router: `src/components/player/PlayerCabinetShell.tsx`.
- Unified Player/Organizer mode switch: `src/components/ProductModeSwitch.tsx`; route-level wiring: `src/App.tsx` and `src/components/OrganizerCRM.tsx`.
- Shared fixed chrome: `src/components/player/PlayerQuickAccessBar.tsx` and `src/components/player/PlayerBottomNavigation.tsx`.
- Explicit-save departure guard: `src/hooks/useUnsavedChanges.ts` + `src/lib/pageLeave.ts`; `src/App.tsx` owns Back/Forward restoration, the shell/profile openers check before mutation. Booking and profile forms opt in; no global autosave rule.
- Navigation model: `src/components/player/playerCabinetNavigation.ts`; focused coverage: `src/tests/playerCabinetNavigation.test.ts`.
- Persistent hub targets: `src/lib/appNavigation.ts` → `PlayerCabinetShell.tsx` → Community/Rating/Wallet; Community connections/mini-games, Activity subviews and Wallet tabs have addressable paths. Legacy wallet `?tab=` links remain supported.
- Personal Home evening: `src/lib/playerHomeEvening.ts` selects from the GET-only participation projection in `playerSelfCoreRoutes.ts`; shared debt loading/error/retry: `src/hooks/usePlayerDebtSummary.ts`.
- Primary hubs (menu of four): `PlayerHomeDashboard.tsx`, `PlayerEveningsHub.tsx`, `PlayerCommunityHub.tsx` (with `PlayerRatingHub.tsx`), `PlayerProfileHub.tsx` («Прогресс»); `PlayerSettingsHub.tsx` and `PlayerWalletHub.tsx` from the header. Club news for players: `GET /api/player/news` (`loadClubNews` in `clubDigestService.ts`).
- History/stats content: `src/components/player/PlayerHistoryStatsView.tsx`. Loaded-archive search and its disclosure/query context live here; career game filters are owned by `CanonicalPremiumPlayerProfile.tsx`.
- Past evening recap links: `src/server/services/playerEveningSummaryService.ts` projects canonical `game_links` (number/winner/viewer participation), consumed by `PlayerEveningSummaries.tsx`; legacy `game_ids` remains supported without guessed numbering.
- Actual Elo change history and optional forecast presentation: `PlayerEloJourney.tsx`; calculation/API ownership is unchanged.
- API family: `/api/player/*` mounts in `src/app.ts`, especially `src/server/routes/playerSelfRoutes.ts` and related player route modules.

**Already implemented:** Player Cabinet ↔ Organizer CRM bidirectional mode switching. Do not propose “connect the two apps” as new work unless a concrete missing transition is identified.

- Existing-response JSON compatibility: `src/lib/requestJson.ts:readJsonResponse` is shared by standard GET/write helpers and the CRM access/token adapters. `message` fallback is opt-in; request options, probe-null and optional204 behavior stay with their existing request owners. Coverage: `requestJson.test.ts`, `PlayerAccessSettings.test.tsx`.

## Player settings recovery

- Settings hub: `PlayerSettingsHub.tsx`; notification/invitation/privacy preferences retain their existing endpoint owners. `PlayerSettingsLoadState.tsx` supplies the common initial-load error/retry state. `PlayerProfilePrivacySettings.tsx` serializes visibility saves and accepts the server-confirmed visibility. Focused UI coverage: `src/tests/PlayerSettingsRecovery.test.tsx`.

## Events / calendar / registration

- Player UI: `src/components/player/PlayerEventsCalendar.tsx`; non-Mafia event detail and sign-up: `PlayerCustomEventDetail.tsx`.
- Organizer: `src/components/crm/EveningsList.tsx`, `src/components/crm/EveningWorkspace.tsx`.
- API: `src/server/routes/eveningsRoutes.ts`, `participantRoutes.ts`, `playerEveningJourneyRoutes.ts`, `eveningSlotRoutes.ts`.
- Rolling Friday calendar + Monday 19:00 TG/VK/personal-announcement reconciliation: `src/server/services/weeklyEveningAutomationService.ts`.
- State schema: `src/db/ensureWeeklyEveningAutomationSchema.ts`.
- Focused coverage: `src/tests/weeklyEveningAutomation.test.ts`.
- Existing Telegram `public_router_refresh_task` reaches `/api/bot/telegram/public-router`; `botTelegramRoutes.ts` reuses that heartbeat for the due-aware weekly reconciler.

### Evening payments and the extension («Продлить вечер»)

- CRM «Вечер → Оплата»: `src/components/crm/EveningPaymentsPanel.tsx` (two blocks «Не оплатили / Оплатили») and `EveningExtensionBlock.tsx` (the extension form); routes `GET/PATCH /api/evenings/:id/payments`, `POST/DELETE /api/evenings/:id/extensions` in `src/server/routes/eveningStaffRoutes.ts`.
- Calculation: `src/server/services/eveningExtensionService.ts` (split and shares), applied by `eveningPaymentPricingService.ts` (`reconcileRegularEveningPayments` for regular evenings, `reconcileOtherFormatExtensions` for the other formats). Who is free of fees on a regular evening: `isRegularFeeFreeByStaffRule` in the same file.

### RSVP ↔ game-slot synchronization

- Canonical participant response compatibility: `src/lib/eveningResponse.ts` plus participant/server routes.
- Read-only organizer roster and closeout attendance views: `src/lib/eveningParticipantView.ts`; used by `EveningActiveRosterView.tsx` / `EveningCloseoutPanel.tsx`. Actual response/attendance **writes** remain in `src/server/services/eveningParticipantState.ts`, not the UI.
- Exact game-slot plan API: `src/server/routes/eveningSlotRoutes.ts` and player event UI callers.
- Telegram RSVP integration: `src/server/routes/botTelegramRoutes.ts` / related bot announcement handlers and Python bot bridge.
- Current behavior: `going` selects all slots; `late`/`thinking` do not invent exact slots; `declined` clears slots; manual exact selection persists through the canonical PUT/save path.

## Games / replay (the player's statistics live in the one profile)

- Result → Replay return context: `src/lib/gameProtocolView.ts` snapshots the protocol disclosures plus window/ancestor scrolling in the current game history entry; `PlayerGameDetail.tsx` restores it after loading. Game/result retry stays in `PlayerHistoryStatsView.tsx`; Replay and independent clip retries stay in `PlayerReplayScreen.tsx`.
- Replay chapter indices: `src/lib/replayChapters.ts` → `PlayerReplayScreen.tsx`, prioritizing the same frame/engine/legacy sequence as rendering. No inferred historical snapshots.
- Tournament context: `TournamentDetailViewBase.tsx`, `useTournamentDetail.ts` and `PlayerTournamentView.tsx` keep per-tournament session tab/game ID; `PlayerTournamentResults.tsx` uses the query string for the opened result.

- Player UI: `PlayerEveningsHub.tsx` («Прошедшие», «Мои игры»), `PlayerHistoryStatsView.tsx` (the club archive and the page of one game, address `/player/games/:key`), `PlayerReplayScreen.tsx`. A player's own games: «Профиль → Игры» in `CanonicalPremiumPlayerProfile.tsx`; his Elo history: its «Elo» tab (`PlayerEloJourney.tsx` for himself). Statistics, roles, Elo, awards, streaks, season and «Игра в цифрах» are in the one profile: `CanonicalPremiumPlayerProfile.tsx` + `PlayerProfileCareerSections.tsx`, all numbers from `premiumPlayerProfileService.ts` (`/api/player/profiles/:id/summary`). The old «Карьера»/«Статистика» screens and `/api/player/career/:id` are gone; `/player/career` and `/player/stats` open the profile.
- Tournament card actions (start, complete, reopen, cancel, correct a game, seats, roles, judge): `src/components/crm/tournaments/useTournamentActions.ts`, shown by `TournamentDetailViewBase.tsx` (frame, tabs, modals) with its parts `TournamentCardHeader.tsx`, `TournamentOrganizationTab.tsx` (readiness, completion, correction, roster), `TournamentGamesTab.tsx` (game switcher, game actions, seats and roles), `SwapSeatsModal.tsx`; test `TournamentDetailViewBase.test.tsx`.
- Organizer evening games: `src/components/crm/EveningGamesView.tsx`, `EveningGameProtocolModal.tsx` (state, saving, handlers), `EveningLiveGameModal.tsx`; its OBS publication, replay frames and alive seats are `useClubLiveBroadcast.ts` (test `useClubLiveBroadcast.test.ts`); the saved frames live in the `game_replay_frames` table (`src/server/services/gameReplayFramesStore.ts`), read by `playerReplayRoutes.ts`, not in `games.protocol_text`.
- Club game protocol window (check / correct / confirm; two places «Протокол» + «Ход игры», sheets, tags, «Вы изменили»): `src/components/crm/gameProtocol/` — frame `ProtocolWindow.tsx`, views `OverviewView.tsx` / `GameFlowView.tsx` / `PlayersView.tsx` / `ResultView.tsx`, tag language `tags.tsx`, primitives `ui.tsx`, pure model (circles, ballots from the chronology, issues, changes with undo) `protocolReview.ts`; legacy-record repair `src/lib/legacyClubProtocol.ts`. Tests `gameProtocolReview.test.ts`, `EveningGameProtocolModalAutosave.test.tsx`; browser `e2e/tests/protocol-window-preview.spec.mjs` (+ `e2e/protocol-window.html`). One protocol for both kinds of game (owner, 2026-10-24): every edit is `useProtocolEditing.ts`, the autosave `useProtocolAutosave.ts`, the window with its checks is `ProtocolWorkspace.tsx`, reveals `RevealsCard.tsx`; `EveningGameProtocolModal.tsx` (club) and `tournaments/GameProtocolModal.tsx` (tournament) only load, save, confirm and reopen, and the tournament adds the judge's points (`tournaments/protocol/TournamentPointsView.tsx`) and its confirmation dialogs. Tests `tournamentProtocolWindow.test.tsx`, `protocolRevealsCard.test.tsx`.
- API: `gamesRoutes.ts`, `playerGameDetailRoutes.ts`, `playerReplayRoutes.ts`, `playerExperienceRoutes.ts`, `playerInsightsRoutes.ts`.

### Online Poker

- Player table UI: `src/components/player/PlayerPoker.tsx` (card order/identity: `pokerCards.ts`).
- Rules/hand engine: `src/server/services/pokerEngine.ts`; lobby lifecycle: `pokerLobbyService.ts`; bots: `pokerBot.ts` (how they play and every setting: `docs/POKER_BOTS.md`).
- Durable tables, active hands and history: `pokerPersistenceService.ts` + `src/db/ensurePokerRuntimeSchema.ts` (`poker_runtime_state`); compact log of finished hands the bots learn from: `poker_hand_log` (same files, test `pokerHandLog.integration.test.ts`). There is no separate durable human poker bankroll: a live human table stack is backed by the canonical club-token ledger.
- Money boundary: `pokerRoutes.ts` debits/returns the 1,000-token live-table stack atomically with the poker snapshot through `tokenLedgerService.ts`. Human-vs-human tables are always `club_tokens`; bot sessions are private `training` (one human + bots) and never mutate the token wallet. Legacy poker snapshots without a money mode load as training.
- «Иду» = all games: `registerGoingParticipantsForAllGames` in `eveningParticipantState.ts` (called by `setParticipantResponse` and the `runCrmAutomations` sweep).
- «MVP вечера» visibility: home card `VotePromptCard.tsx` (`GET /api/player/voting/pending` → `loadPendingVoteForPlayer` in `eveningVotingService.ts`), group/VK post `postVotePrompt` and reminder `remindUnvotedPlayers` in `clubResultPostService.ts` (called from `runClubResultPosts`), reminder messages `queueEveningVoteMessages(..., {nudge:true})` in `eveningVoteMessageService.ts`.
- Organizer-editable post text: `postTemplateService.ts` (table `post_text_templates`, default = the owner's words), `/api/post-templates` (`postTemplateRoutes.ts`), CRM `PostTemplatesCard.tsx` in `TelegramCRM.tsx` («Публикации»); used by `vkDirectJoinPublishingService.ts` (`clubShortVkText`); the VK evening card (`EveningVkCard.vk-direct.tsx`) shows the post photo and why a photo is missing.
- Player invitation settings («Настройки → Приглашения»): `playerInvitePreferencesService.ts` (columns `blocked_invite_formats`, `allow_direct_contact` on `player_notification_preferences`, added lazily in `ensurePersonalNotificationRoutingSchema.ts`), API `GET/PUT /api/player/invite-preferences` in `playerNotificationPreferenceRoutes.ts`, UI `PlayerInviteSettings.tsx`; enforced in `eveningAnnouncementTrackingService.ts`, `eveningRsvpNudgeService.ts`, `playerInvitationEligibilityService.ts`, `pokerInviteService.ts`; «Написать лично»: `DirectContactButtons.tsx` + `src/lib/directContact.ts`.
- Guest lead («+N», contact): `guestPlayerService.ts` (guests count in every game's sign-ups via `loadEveningSlotPlan` in `eveningSlotPlanningService.ts` and show in `EveningGameRegistrationDashboard.tsx`; `contact_kind/contact_value/plus_count/companion_of` on `guest_player_placeholders`; every «+1» is its own row made by `syncGuestCompanions`, added lazily by `ensureGuestPlayerPlaceholderSchema.ts`), CRM `GuestFields.tsx` + `EveningActiveRosterView.tsx`, link helper `src/lib/guestContact.ts`; the Telegram lineup reads guests through `/api/bot/evenings/:id/participants` (`handlers/crm_booking.py`), the «сегодня играем» post through `eveningTodayPostService.ts`.
- Evening colours by format: `src/lib/eventKind.ts` (calendar `OrganizerEventsCalendar.tsx`, `WeekEventsPanel.tsx`).
- CRM player card «Написать во ВКонтакте от себя»: `PlayersCRM.tsx` opens `https://vk.com/im?sel=<id>` from `vk_user_id` in `GET /api/players/:id` (the organizer writes from their own VK account; the app cannot send as a person).
- Poker invites/presence: `PokerInvitePanel.tsx` + `pokerInviteService.ts` + `ensurePokerInviteSchema.ts`. App presence comes from `presenceService.ts`; linked VK players get best-effort `users.get online,last_seen`; Telegram online is intentionally not claimed. Invites go through `queuePersonalNotification` (Telegram first, VK community message when only VK is linked) with a two-minute sender→recipient cooldown and a refresh-safe `/player/poker/:lobbyId` deep link.
- Poker MTT (rules: BUSINESS_RULES «Poker MTT»): pure settings/clock/table planning `src/shared/pokerTournament.ts`; storage `src/db/ensurePokerTournamentSchema.ts`; registration, auto start/cancel and the 15-second worker `src/server/services/pokerTournamentService.ts`; late registration (`lateRegisterInPokerTournament`, `seatLateEntrant` in `pokerTournamentTablesService.ts`) and the table of levels (`pokerTournamentSchedule` in `src/shared/pokerTournament.ts`, `src/components/player/PokerTournamentSchedule.tsx`), announcements in the groups/VK/personal messages and the 30-minute reminder `src/server/services/pokerTournamentAnnouncementService.ts` (called by the worker and after creation); API `src/server/routes/pokerTournamentRoutes.ts` (under `/api/player/poker/tournaments`); tables, busts, places, balancing and the finish `src/server/services/pokerTournamentTablesService.ts`; prizes, cup, medals and the winner's achievements `pokerTournamentRewardsService.ts` (the prize pool maths `pokerTournamentPrizes` is in `src/shared/pokerTournament.ts`); the re-buy `rebuyInPokerTournament` in `pokerTournamentService.ts` (tournament tables are `PokerLobby.tournament` in `pokerLobbyService.ts`); the calendar entry (`event_type: 'poker'` in `playerEventCalendarRoutes.ts`) and its page `PlayerPokerTournamentDetail.tsx` (wired through `PlayerEventsCalendar.tsx`); editing before the start (`updatePokerTournament`, `PATCH /poker/tournaments/:id`); player and organizer UI `src/components/player/PokerTournaments.tsx` with the shared create/edit form and its live table of levels `PokerTournamentSettingsForm.tsx` and the `TournamentStrip` in `PlayerPoker.tsx`; tests `pokerTournament*.test.ts` (incl. `pokerTournamentTables.integration.test.ts`), `PokerTournaments.test.tsx`, `pokerTournamentCalendar.integration.test.ts`.
- Poker table chat and emotes (rules: BUSINESS_RULES «Poker table chat and emotes»): emote catalog `src/shared/pokerEmotes.ts` (animations are `.poker-emote--*` in `src/index.css`); storage `ensurePokerChatSchema.ts` (`poker_table_chat`); posting, limits and listing `src/server/services/pokerChatService.ts`; routes `POST /poker/lobbies/:id/chat` and `chat` in `GET /poker/lobbies/:id` (`pokerRoutes.ts`); UI `src/components/player/PokerChat.tsx`; tests `pokerChat.integration.test.ts`, `PokerChat.test.tsx`, the «poker chat» case in `e2e/tests/poker-visual.spec.mjs`.
- API: `src/server/routes/pokerRoutes.ts`; persistence/token regression: `src/tests/pokerPersistence.integration.test.ts`; invite/presence regression: `src/tests/pokerInviteService.test.ts`.

### Pending/final game save recovery

When a final save is stuck or reports a roster conflict, start here:

- organizer list/editor: `src/components/crm/EveningGamesView.tsx` and protocol modal;
- pending-save/outbox helpers in the evening-game client flow;
- server game/protocol update route in `src/server/routes/gamesRoutes.ts` / evening game routes;
- focused tests: search `pending club game`, `identity recovery`, `final save reliability` under `src/tests/`.

Current invariant: stale local gameplay data may be rebased **by seat** onto the canonical server roster, but stale local `player_id` / `participant_id` values must not replace server identities.

## Rating / Elo

- UI: `src/components/player/PlayerRatingHub.tsx` (Elo · Сезон · Турниры), `PlayerRatingTable.tsx`, `PlayerRatingPeriods.tsx`, `PlayerTournamentResults.tsx`; one selected season: `PlayerSeasonHub.tsx` coordinates `PlayerRatingPeriods.tsx` and `PlayerSeasonsPanel.tsx` by canonical RATING period key; `?period=period:<id>` in `playerClubWorldRoutes.ts` returns its separate all-format win statistics. NOVICE never borrows RATING statistics.
- API: `ratingRoutes.ts` (`GET /api/rating/metrics` → `metricRatingService.ts`), `ratingPeriodRoutes.ts`, `ratingPeriodStandingsRoutes.ts`, `playerTournamentResultsRoutes.ts`, `eloSeedAdminRoutes.ts`.
- Formula work: `npm run project:find -- "elo expected rating"` before changing output.

## Finished-game score sheets and startup reads

- Game result sheet, personal vote/check accuracy and individual ballots: PlayerGameDetail.tsx; finished-only source events: playerGameDetailRoutes.ts; folding/metric owners: liveGameAnalysis.ts and gameActionFacts.ts. Historical aggregate counts never imply voter identities.
- Evening result sheet including personal result, nominations and protocol links: PlayerEveningSummaries.tsx.
- Reused completed-protocol reads: gameStatisticsService.ts with analyticsInputsVersion.ts; inputs include protocol corrections and cancelled evenings, not token/notification writes. Route bundle boundaries: App.tsx.

## Rules, glossary and novice guide

- Approved two-page teaching cards and publication copy: `docs/SPORTS_MAFIA_BEGINNER_CARDS.md`; PNGs in `public/assets/guide/sports-mafia-game-flow.png` and `sports-mafia-table-rules.png`. Full rule owner: BUSINESS_RULES; guide text owner: clubGuide.ts.

- Public page `/guide` (no sign-in): `src/components/public/PublicGuide.tsx`, routed in `src/App.tsx`.
- Learning statistics for the organizer (reasoning school steps/practices and the judge trainer): record `src/server/routes/playerLearningActivityRoutes.ts` (table `src/db/ensureLearningActivitySchema.ts`, catalog `src/lib/learningActivity.ts`, client `src/lib/learningActivityClient.ts`, called from `MafiaReasoningCourse.tsx`, `MafiaReasoningLabs.tsx`, `JudgeConductTraining.tsx`); curator view `GET /api/learning/activity` in `learningProgressRoutes.ts` and `src/components/crm/LearningActivityCRM.tsx` (tab inside `LearningProgressCRM.tsx`); the split-vote exams stay in `player_split_vote_progress`.
- Judge practice (one place for the guided training game and the free test game): `/guide?tab=judge-conduct` via `JudgeConductTraining.tsx` → `JudgeTestGameModal` sandbox → real `EveningLiveGameModal` / `LiveGameEngine`; `JudgeConductCoach.tsx` reads saved engine snapshots and `judgeConductTraining.ts` specifies ordinary linear prompts. Public/no role required; fake game and scoped local keys are isolated by `testGameSandbox.ts`. Training seating UI: `JudgeTrainingSeating.tsx`, plan and fixed role cards: `judgeTrainingSetup.ts`; real `PhysicalRoleDeal.tsx` takes optional `trainingRoles` via `EveningLiveGameModal` → Live Engine → SetupPhase → ClubGameSetupPhase. JudgeConductCoach is an optional fixed task trigger and dismissible instruction overlay, mounted outside the unchanged Live Game shell. Its training-only highlights and input gate never change seat geometry: the same CRM identity layer, judge HUD and mobile table arrangement are used in real and synthetic games. Strict introductory task gating: judgeConductTraining.ts (getJudgeTrainingGate) + JudgeConductCoach.tsx (highlight) + EveningLiveGameModal.tsx (input capture); Back to speeches in LiveGameEngine.tsx / CenterPanel.tsx; voting-action visibility and nomination borders in liveGameEveningBugfixes.css + SeatCard.tsx.
- Split-vote trainer: `src/lib/splitVoteTraining.ts`, expert level `src/lib/splitVoteExpert.ts`; progress `/api/player/split-vote-progress`; curator view `/api/learning/split-vote` (`learningProgressRoutes.ts`) and `src/components/crm/LearningProgressCRM.tsx` («Ещё → Обучение», player card block).
- Texts (scenario, roles, table rules, glossary): `src/lib/clubGuide.ts`. The old trivia test is replaced on the stable `/guide?tab=quiz` route by the five-level Mafia reasoning course: `src/lib/mafiaReasoningCourse.ts` + `src/lib/mafiaReasoningExtraCases.ts` (42 manually reviewed scenario archetypes across 5 themes: 14/7/7/7/7; selection rotates 5 first-theme or 3 per other theme per run; numbered-player permutations on new attempts; canonical generated IDs restore saved scenarios and old progress; multi-answer compatible hypotheses, per-option feedback and position rotation; method in `docs/REASONING_PEDAGOGY_REVIEW.md`) + `src/components/public/guide/MafiaReasoningCourse.tsx` (mobile training UI, explanations and device-local progress). `src/lib/clubGuideQuiz.ts` remains as unlinked legacy content for now; split and judge trainers are separate.
- What the page shows (lessons, reference, articles, trainers) and in which order: `src/lib/guideCatalog.ts` (sections `GUIDE_SHELVES` with the home-card summary, entries with an optional topic `group`) — add a lesson or an article there; a new kind of screen or trainer also gets a component in `GUIDE_VIEWS` (`PublicGuide.tsx`). Shared pieces and screens: `src/components/public/guide/`.
- Anonymous testament practice: `src/lib/anonymousTestamentTraining.ts` (written examples plus anonymous reconstruction of completed event-log best moves and death protocols, deliberately hypothetical example arguments), GET-only `src/server/routes/anonymousTestamentRoutes.ts`, mobile `src/components/public/guide/AnonymousTestamentPractice.tsx` under advanced reasoning. No player/game/account identifiers exposed, no automatic inference from missing transcript, no moderation/database table/mutations; each attempt rotates cases. Focus: strength of evidence, not predicting roles from one action.
- Reasoning stage 2: `src/lib/mafiaReasoningDecisionTree.ts` (pure, exhaustively validated legal two-nominee vote tree; fixed first nominee hands, automatic last-nominee assignment, parity/tie/continuation and possible vs forced outcomes) and `src/lib/mafiaReasoningDiagnostic.ts` (six held-out written analysis situations with non-automated rubrics), UIs `src/components/public/guide/MafiaReasoningDecisionTree.tsx` and `MafiaReasoningDiagnostic.tsx` reached through `MafiaReasoningLabs`, and regression tests `src/tests/mafiaReasoningDecisionTree.test.tsx`. No backend mutations, badges or automatic scoring of free text.
- Advanced reasoning labs: `src/lib/mafiaReasoningLabs.ts` (verified forward-vote arithmetic, snapshots, authored multi-phase exercises on hypothesis rejection, sheriff claims, psychological uncertainty, next actions and the «Решить и высказаться» decision cases) → `src/components/public/guide/MafiaReasoningLabs.tsx` (one compact «Разборы партий» entry from the five-chapter `MafiaReasoningCourse` picker, separate screens, local progress and optional first-person reasoning) → `src/tests/mafiaReasoningLabs.test.tsx` (vote rules and session tests). It is independent of real Live Game, backend ratings and awards.
- Player home entry for zero-round split-vote practice: `src/components/player/PlayerHomeDashboard.tsx`; public mode/exam UI: `src/components/public/SplitVoteTraining.tsx`, with generated questions and approved vote mapping in `src/lib/splitVoteTraining.ts`.
- Account-level unlocks: `src/server/routes/playerSplitVoteProgressRoutes.ts`; additive storage: `src/db/ensureSplitVoteProgressSchema.ts`.

## Wallet / tokens / shop / payments

- Player UI: `src/components/player/PlayerWalletHub.tsx`.
- API: `playerEconomyRoutes.ts`, `playerPaymentRoutes.ts`, `playerTokensRoutes.ts`, `commerceAdminRoutes.ts`.
- Robokassa test flow: `robokassaTestRoutes.ts` (mounted before cookie-based DB selection), `robokassaTestPaymentService.ts` (isolated test invoice persistence), `robokassaTestAdapter.ts` (provider signatures). `playerPaymentEligibility.ts` shares wallet/checkout eligibility. No real settlement; setup procedure: `ROBOKASSA_SETUP.md`.
- Token ledger: `src/server/services/tokenLedgerService.ts`.
- External online acquiring/SBP is intentionally disabled until explicit provider decision; manual accounting is real functionality.

## Evening attendance / closeout / payments

Primary organizer surfaces:

- `src/components/crm/EveningActiveRosterView.tsx` — mounted confirmed/arrived roster and quick attendance;
- `src/components/crm/EveningCloseoutPanel.tsx` — closeout reconciliation;
- `src/components/crm/EveningPaymentsPanel.tsx` — mounted payment view, including closed-evening edits.

The shared EveningListControls provides list search and filters. EveningManagementView owns the roster/payment mounts and collapsed staff assignment.

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

### Novice development funnel

- Schema: `src/db/ensureNoviceSystemSchema.ts` (`club_stage`, `novice_applications`).
- Rules/types: `src/shared/novice.ts`, `src/server/services/noviceService.ts`.
- Player API: `/api/player/novice*`; organizer API: `/api/novice/*` in `src/server/routes/noviceRoutes.ts`.
- Player entry UI: `src/components/player/PlayerEventsCalendar.tsx`.
- Organizer CRM: `src/components/crm/NoviceDevelopmentCRM.tsx`, opened from **Ещё → Развитие**.
- NOVICE personalized pricing is enforced in `eveningSlotPlanningService.ts`; do not duplicate it in Telegram/VK clients.

- Profile/self identity: `PlayerProfileHub.tsx`, `PlayerProfileSettings.tsx`, `PlayerIdentityFields.tsx`; canonical read/write is `/api/player/me`.
- Conduct/staff workspace: `PlayerConductCenter.tsx`.
- Personal connections (profile → Связи, own profile): `PremiumProfileConnections.tsx` (Players / My Team / Invitations; searchable list, remembered view, honest inbox/eligibility retry), `PersonalTeamwork.tsx` («Моя команда», role pairs, opponents, steps, never played; API `GET /api/player/team-connections` in `playerPulseRoutes.ts`, logic `personalTeamworkService.ts`), `PersonalRecentEvening.tsx`. The Community → Связи screen is club-wide only.
- Club discovery: `PlayerClubDirectory.tsx`, `PlayerClubConnections.tsx`. Connections API: `playerPulseRoutes.ts`, aggregation `clubRelationshipsService.ts` over canonical completed club/tournament snapshots; club best/most-played/first-game pairs and last personal event. One selector for Teammates / Opposition / Table encounters; pair ordering stays inside Teammates. Distinct club stories: `ClubConnectionStories.tsx`, `clubConnectionStoriesService.ts`, shared contract `clubConnectionStories.ts`; rationale in `CLUB_CONNECTION_STORIES.md`.
- Organizer player work card: `PlayersCRM.tsx`; access/roles: `PlayerAccessSettings.tsx`; limited cabinet «Проводит вечера»: `EventHostCabinet.tsx` + `canUseEventHostRoute` in `src/server/auth.ts` (marks `src/lib/organizeFormats.ts`); separate «Свои ивенты»: `CustomEventsPanel.tsx`, `src/server/routes/customEventRoutes.ts`, schema `src/db/ensureCustomEventsSchema.ts`, manual idempotent delivery `src/server/services/customEventPublishingService.ts`; many players at once: `PlayerAccessBulkCRM.tsx` («Ещё → Уровни и роли», `POST /api/players/access/bulk` in `playersRoutes.ts`; organizer cabinet access stays per player); token/Elo/manual-achievement corrections: `PlayerServiceTools.tsx`; owner-only safe duplicate merge: `POST /api/players/:id/merge-preview` → `POST /api/players/:id/merge`, `playerProfileMergeService.ts`, `ensurePlayerProfileMergeSchema.ts`, with preview, conflict guards, tombstone and audit.
- API: `playerSelfCoreRoutes.ts`, `playersRoutes.ts`.
- Avatars: `src/lib/playerAvatarManifest.ts`, `public/player-avatars/`.

### Organizer player access model

The organizer player card intentionally separates four values:

- `game_level` — playing skill/access level;
- `club_role` — relationship/status inside the club;
- `judge_level` — hosting/judging qualification;
- `organizer_player_access` — separate server-authoritative Organizer CRM entitlement.

`club_role=organizer` does not grant CRM access, and grant/revoke of `organizer_player_access` does not modify the other three fields. The player-bound organizer session is checked against the current entitlement, so a revoked player cannot restore access by repeating password login. The deliberately supported password-only root organizer session remains an explicit separate flow.

The historical registered-player `club_role=guest` value means an external/occasional **registered account**, not a non-account guest placeholder. A true guest placeholder has no profile/account, Elo, tokens, or Telegram/VK identity and is excluded from editable registered-player CRM profiles.

CASUAL payment waivers remain evening-specific and are not derived from these profile fields. Repository CI/UI preview is not evidence that the same revision is deployed on Amvera or that real Telegram/VK sessions work; those are runtime checks after deployment.

Relevant implementation: `src/components/crm/PlayerAccessSettings.tsx`, `src/server/routes/organizerPlayerProfileRoutes.ts`, `src/server/services/organizerPlayerAccessService.ts`, `src/server/auth.ts`, `src/server/routes/authRoutes.ts`, with focused coverage in `src/tests/crmPlayerAccess.integration.test.ts` and `src/tests/organizerAccountLink.test.ts`.

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
- «Дела» (organizer to-do, replaces «Задачи» + «Порядок в клубе» on screen): `organizerAgendaService.ts` (uses `clubOrderService.ts` checks and open `organizer_tasks`), UI `OrganizerAgenda.tsx`.
- «Игрок вечера» vote: rules `eveningVotingService.ts` (app route `playerEveningVotingRoutes.ts`, bot route `POST /api/bot/evenings/:id/vote` in `botRoutes.ts`), bot message `eveningVoteMessageService.ts`, bot handlers `evv:` / `evr:` in `handlers/crm_evening_response.py` (`bot_api.cast_evening_vote`); coverage `eveningVoteBot.test.ts`, `tests/test_evening_vote_bot.py`.
- «Игры в цифрах» (statistics across games from the chronology): pure `src/lib/gameStatistics.ts`, data `gameStatisticsService.ts` (`loadStatGames`), organizer `GET /api/analytics/game-stats` → `GameStatsPanel.tsx` in «Аналитика»; player `game_stats` in `/api/player/profiles/:id/summary` → `PlayerGameNumbers.tsx` in the career profile; coverage `gameStatistics.test.ts`, `gameStatisticsRoutes.test.ts`.
- «Активность в приложении» in the CRM player card (visits, screens, clicks per player, organizers only): `uiUsageService.ts` (`loadPlayerActivity`, `ui_usage_events.player_id`) → `GET /api/ui-events/players/:id` in `uiUsageRoutes.ts` → `PlayerActivityCard.tsx`; labels in `src/lib/screenLabels.ts`.
- «Сейчас в приложении» (who is online, owner only): `src/lib/presence.ts` → `presenceRoutes.ts` / `presenceService.ts` (memory only) → `OnlineNowPanel.tsx` in «Аналитика».
- Curators («Куратор направления»): `src/lib/curatorAreas.ts`, set in `PlayerAccessSettings.tsx` / `PlayerAccessBulkCRM.tsx`; visits: `playerVisitsService.ts`.
- API: `crmRoutes.ts`, `tasksRoutes.ts`, `analyticsRoutes.ts`, `adminDataRoutes.ts`. Analytics: `AnalyticsCRM.tsx` (four persistent tabs), `analyticsShared.tsx` (query state/retry/help), `clubAnalyticsService.ts` (`/overview`, `/now`, owner-only `/finance`, staff), shared boundaries `src/lib/analyticsPeriod.ts`, percentage/summary `analyticsFormat.ts`, canonical help `analyticsHelp.ts`, source labels `playerSources.ts`; bounded usage aggregation `uiUsageService.ts`. Legacy endpoints delegate for one release. Mobile evidence: `e2e/crm-analytics-harness.tsx`, `crm-analytics-preview.spec.mjs`.
- «Порядок в клубе» on the home screen (evenings, statuses, profiles, games and money that need the organizer): service `src/server/services/clubOrderService.ts`, API `GET /api/crm/club-order` in `crmRoutes.ts`, UI `ClubOrderPanel.tsx` inside `OrganizerCommandCenter.tsx`; coverage `src/tests/clubOrder.integration.test.ts`.
- «Что нового» for players, written by the organizer: CRM `src/components/crm/WhatsNewCRM.tsx` («Ещё → Что нового»), player home card `src/components/player/WhatsNewCard.tsx`, server `src/server/routes/whatsNewRoutes.ts` + `whatsNewService.ts`, table `whats_new_entries` (`src/db/ensureWhatsNewSchema.ts`).
- App-usage tracking (screens opened, buttons pressed; events of a signed-in player carry his id, never text; organizers see «Кто куда заходил» per player since 2026-10-13): client `src/lib/uiTelemetry.ts` (installed in `main.tsx`; actions come only from `data-track`/`data-testid`), API `uiUsageRoutes.ts` (`POST /api/ui-events`, `GET /api/ui-events/summary`), storage `uiUsageService.ts` (`ui_usage_events`, 180-day retention), CRM view `AppUsagePanel.tsx` in Аналитика.

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
- Novice evening invitation (promo text and organizer contacts in `src/shared/novicePromo.json`): VK post via `src/lib/novicePromo.ts`, Telegram public entry group via `novice_invitation_text` in `handlers/telegram_evening_copy.py`. Destination rules: `docs/BUSINESS_RULES.md` → «Where announcements go».
- Venue address and «Как добраться» map link: one list `src/shared/venues.json`, read by `src/lib/venues.ts` (web, VK text, `VenueAddress.tsx`) and `handlers/telegram_evening_copy.py` (Telegram).
- «Перенести начало» (draft/published only): `EveningStartTimeEditor.tsx` → `PUT /api/evenings/:id/slots` (`updateEveningSlotSettings`) moves every game with the start and re-syncs the Telegram/VK posts of a published evening.
- Club announcement photos: `announcementPhotoService.ts` selects the stable photo, stores one reusable VK wall attachment per photo/group and `vkDirectJoinPublishingService.ts` adds it to the existing VK announcement when an API-compatible organizer token is available.

### Telegram history preservation

Closed evenings must not have their old useful Telegram announcement replaced wholesale by a minimal “registration closed” message. Start with announcement/publication finalization code in `botAnnouncementRoutes.ts`, `botTelegramRoutes.ts`, Telegram sync/outbox services and the Python bot message-edit path.

## Live Game / voting / fouls / PPK

- «Вскрытие» (a player openly claims to be the Sheriff + the checks he announced, judge's hand record): model `src/lib/liveReveals.ts`, judge panel `src/components/LiveGameEngine/RevealPanel.tsx` (button in `LiveGameJudgeToolbar.tsx`), state in `LiveSnapshot.reveals` (`engineStateModel.ts`, Undo and reload included), chronology events `reveal` / `reveal_removed` / `announced_check` / `announced_check_removed` (`liveGameEventLog.ts`, text in `liveGameEventText.ts`). Rules: `BUSINESS_RULES.md` «Night, agreement…». Broadcast: `LiveBroadcastState.reveals` (`liveBroadcast.ts`, sanitised in `liveBroadcastService.ts`) drawn by `LiveBroadcastOverlay.tsx` (banner + «Назвал»). Statistics and the game page for it are not built yet. Statistics: `src/lib/revealStats.ts` → profile block `PlayerReveals.tsx` (`premiumPlayerProfileService` `reveals`) and rating group «Вскрытия» in `metricRatingService.ts`; game page block via `revealsForGamePage` (`playerGameDetailRoutes.ts` → `PlayerGameDetail.tsx`), training review via `AnalysisCircle.reveals` (`liveGameAnalysis.ts` → `GameAnalysis.tsx`).
- Main UI/state: `src/components/LiveGameEngine.tsx` plus `src/components/LiveGameEngine/`.
- Setup: `setupMode.ts`, `setupRoles.ts`, `setupState.ts`.
- Table size and role deck (10, or 8–9 at a novice table): `src/lib/tableComposition.ts`; the club game size comes from `getLiveGameTableSize` in `setupMode.ts`.
- Day speech ordering: `daySpeechModel.ts`.
- Night targeting/checks: `nightTargetModel.ts`.
- Two-fouls-for-+30 rule: `speechExtensionModel.ts`.
- Timer calculations: `timerModel.ts`.
- Voting presentation: `votingPresentationModel.ts`.
- Reload returns to the open game window: `src/lib/liveGameResume.ts` (record) + `src/lib/useResumeLiveGame.ts` (reopen in `EveningGamesView`, `PlayerJudging`, `PlayerConductCenter`, `TournamentDetailViewBase`); the modals `EveningLiveGameModal` / `TournamentLiveGameModal` write and clear the record.
- Desktop keyboard control (seat digits, mirrored action keys, arrows): `LiveGameEngine/hotkeyModel.ts` (pure key map) + `useLiveGameHotkeys.ts` (calls the engine handlers) + `LiveGameHotkeyLayer.tsx` (menu, cheat sheet), styles `crm/liveGameHotkeys.css`.
- Unfinished games reminder (owner, 2026-10-27): `unfinished_games` in `/api/crm/command-center` (`tableScoutingRoutes.ts`), card `unfinished-games` in `OrganizerCommandCenter.tsx`; test `unfinishedGamesReminder.test.ts`.
- Vote count panel (owner, 2026-10-27): candidate strip `live-judge-vote-strip` in `CenterPanel.tsx` (collecting stage), seat vote state `data-vote` in `SeatCard.tsx`, styles at the end of `liveGameEveningBugfixes.css`; overlap check «vote count has no overlaps» in `e2e/tests/live-game-compact-layout.spec.mjs`.
- Vote count shortcuts (owner, 2026-10-27): «Поделилось также» on a revote — `sameSplitAvailable` / `handleSameSplit` in `LiveGameEngine.tsx` with the previous round's votes kept as `previousRoundVotes`; «Цифрами» — `VoteByNumbersOverlay.tsx` opened from `CenterPanel.tsx`; row layout in `liveGameEveningBugfixes.css` (`.live-judge-vote-shortcuts`); test `liveGameVotingShortcuts.test.tsx`.
- Auto mode («Авто», next step after a timer): `CenterPanel.tsx` (`autoStep`, `toggleAutoAdvance`), key `mafia_live_auto_advance`.
- Announcement step before each voting/revote: `CenterPanel.tsx` (`renderVotingAnnouncement`) + `handleStartVoting` / `handleZeroRoundSingleToNight` in `LiveGameEngine.tsx`, stage `votingStage === 'setup'`.
- Seat presentation: `seatPresentationModel.ts`.
- Snapshot schema/restore: `engineStateModel.ts`; canonical role/team recovery: `canonicalizeLivePlayers`, used by `liveSessionStorage.ts` for current and Undo players. UI/result/OBS labels remain at presentation boundaries.
- Overlays/actions/best move: `LiveGameOverlays.tsx`.
- Game chronology (events of a live game: nominations, who voted for whom, shots, Don/Sheriff checks, fouls, exits, colour protocols): model and cleaning `src/shared/liveGameEvents.ts`; captured at the engine persistence boundary by `src/lib/liveEngineJournal.ts` with the shared `src/lib/liveClubSession.ts` evidence projector and `src/lib/liveGameEventLog.ts` event derivation; native snapshots carry `protocolEvidence` and finished results carry `protocol_evidence`/`protocol_snapshot`. Legacy interrupted sessions retain recorder derivation; saved by the tournament engine (`TournamentLiveGameModal.tsx`) into `tournament_game_protocols.events_json` through `tournamentProtocolRoutes.ts`; shown as «Журнал партии» by `protocol/GameEventLog.tsx` + `src/lib/liveGameEventText.ts`.
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
- routine player actions remain available during active phases, including direct removal/PPK for players already outside the table and PPK after removal;
- protocol/best-move overlays have a usable Back path;
- `+30с за 2 фола` follows `docs/BUSINESS_RULES.md`.

Browser evidence: `e2e/live-game.html`, `e2e/live-game-harness.tsx`, `e2e/tests/live-game.spec.mjs`.

### Tournament seating generator

- Balanced plan (each player on each seat once per ten games, neighbours varied): `src/server/services/tournamentSeatingPlan.ts`; used by `src/server/services/tournamentDistanceService.ts` (`regenerateTournamentGames`) and `generateGamesAndSeating` in `src/server/routes/tournamentsRoutesBase.ts`, and `prepareTournamentEveningSeating` (with `regenerate`) in `src/server/services/tournamentEveningService.ts` for tournaments made through «Турнирный вечер». Test: `src/tests/tournamentSeatingPlan.test.ts`, `src/tests/tournamentEveningSeatingRegenerate.test.ts`.
- Sending the «Рассадка для игроков» PNG through the bot (to the rating group or to the organizer's own Telegram): `src/components/crm/tournaments/SeatingExportModal.tsx` → `POST /api/tournaments/:id/seating-image` in `src/server/routes/tournamentSeatingShareRoutes.ts` → `src/server/services/tournamentSeatingShareService.ts`; short-lived public link for saving/sharing: `POST /api/tournaments/:id/seating-image/link` + public `GET /api/public/seating-image/:token/:name` (same route file) and `src/server/services/seatingImageLinkService.ts`; test `src/tests/tournamentSeatingShare.test.ts`.

### OBS / Twitch Live Game overlay

- Audience-state contract: `src/lib/liveBroadcast.ts`.
- Phone publisher and one-time OBS link UI: `src/components/crm/EveningLiveGameModal.tsx` and `src/lib/clubGamesApi.ts`.
- Token/transient relay: `src/server/services/liveBroadcastService.ts`.
- API: `src/server/routes/liveBroadcastRoutes.ts`, mounted under authorized `/api/games/*` and secret `/api/public/broadcast/*` paths.
- Browser Source UI: `src/components/public/LiveBroadcastOverlay.tsx` + `liveBroadcastOverlay.css`, route `/broadcast/:token` in `src/App.tsx`.
- Commentators' window frame (static transparent Browser Source, no token): `src/components/public/BroadcastCommentatorFrame.tsx` + `broadcastCommentatorFrame.css`, route `/broadcast/frame` in `src/App.tsx`; test `src/tests/broadcastCommentatorFrame.test.ts`.
- Focused coverage: `src/tests/liveBroadcast.test.ts`, `src/tests/liveBroadcastRoutes.test.ts`, `e2e/tests/live-broadcast.spec.mjs`.

Current contract: one stable secret main-channel URL, one streamed game at a time, roles/statuses and ordered nominations visible, and voter assignments withheld until the judge fixes the round result. This relay is transient and must not become a second in-progress game database.

### OBS Studio remote connection

- Organizer setup/status: `src/components/crm/ObsRemoteCRM.tsx`, opened with the monitor button inside the active game.
- Laptop bridge: `src/components/public/ObsBridgePage.tsx`, public route `/obs-bridge`.
- Local OBS WebSocket v5 client: `src/lib/obsWebSocket.ts`.
- Pairing/status API: `src/server/routes/obsRemoteRoutes.ts` + `src/server/services/obsRemoteService.ts`.
- Durable hashed pairing state: `src/db/ensureObsRemoteSchema.ts`.
- Focused coverage: `src/tests/obsRemoteRoutes.test.ts` and organizer routing tests.

Current contract: one paired laptop, one-time eight-character code valid for ten minutes, local OBS at `127.0.0.1:4455`, and status-only integration. The OBS password never leaves the laptop. Scene switching and media transport are later layers, not part of this bridge foundation.

Read `docs/BUSINESS_RULES.md` before changing game behavior.

## Tournaments / protocols / awards / results

- Shared player/discipline, shots, first-killed and best-move checks: `src/lib/protocolConsistency.ts`, consumed by club save service, tournament routes and tournament completion UI. Shared club/tournament voting consistency: `src/lib/protocolVotingValidation.ts`, reused by both APIs and completion forms with table-size and zero-round-rule options. Club live ballots use `renumberVotingRoundsSequentially` before saving.

- API: `tournamentsRoutes.ts`, `protocolImportsRoutes.ts`, `tournamentProtocolRoutes.ts`, `tournamentAwardsRoutes.ts`, `flexibleTournamentResultsRoutes.ts`, `tournamentTokenSettlementRoutes.ts`, `judgeAuthorityAdminRoutes.ts`.
- Schema: `drizzle/` and matching `src/db/ensure*.ts`.
- Wrong result: trace persisted protocol -> calculation/service -> publication/UI; do not patch only the final number.

### Tournament evening registration / reserve / payments

`TOURNAMENT-EVENING-001` is an additive front door into the existing tournament domain, not a second tournament engine.

- Organizer setup/share: `src/components/crm/tournaments/CreateTournamentEveningModal.tsx`, `TournamentEveningSettingsPanel.tsx`.
- Single organizer entry: CRM «События → Турниры» (`TournamentsList.tsx` → `TournamentDetailView.tsx` with `TournamentEveningSettingsPanel` + `TournamentParticipantsPanel`). The former «Ещё → Турнирные вечера» screen was a duplicate and is removed.
- Organizer roster/payment queue: `src/components/crm/tournaments/TournamentParticipantsPanel.tsx`.
- Player detail: `src/components/player/PlayerTournamentEveningDetail.tsx`; calendar integration: `PlayerEventsCalendar.tsx` + `src/server/routes/playerEventCalendarRoutes.ts`.
- API: `src/server/routes/tournamentEveningRoutes.ts`.
- Server-owned registration/reserve/payment truth: `src/server/services/tournamentEveningService.ts`.
- Additive schema: `src/db/ensureTournamentEveningSchema.ts`.
- Focused coverage: `tests/tournamentEvening.test.ts`.
- Operator procedure: `docs/TOURNAMENT_EVENING_RUNBOOK.md`.

Canonical invariants: capacity is exactly 10 excluding judge; reserve is FIFO unless an organizer performs an explicit audited reorder; confirmed registrations synchronize into `tournament_participants` before seating; player payment reports are only pending claims until organizer confirmation; tournament fee/prize data never enters regular-evening CASUAL reconciliation, wallet tokens or betting; external personal notifications go through the channel-neutral router and select at most one Telegram/VK channel. The shared player link is `/player/events/<tournamentId>` and draft publication is always explicit.

After registration/preparation, continue through the existing tournament seating, games, protocols, standings, compensation scoring, awards, three result outputs, image/publication, Elo/token settlement and backup/correction surfaces above. Historical tournaments, including `Турнир Богдана 1.08`, must not be rewritten to add registration metadata.

## Speech recording

- API: `src/server/routes/playerSpeechRecordingRoutes.ts`.
- Runtime/design notes: `docs/game-audio-v1.md`.
- Find callers with `npm run project:find -- "speech recording audio"`.

## Telegram

- Web API: `botRoutes.ts`, `botAnnouncementRoutes.ts`, `botTelegramRoutes.ts`, `telegramSettingsRoutes.ts`.
- Worker: `src/server/services/telegramSyncOutboxService.ts`.
- Python: `main.py`, `bot_api.py`, `bot_announcement_api.py`, `bot_profile_link_api.py`, `bot_telegram_api.py`, `handlers/`.
- Runtime docs: `docs/telegram-runtime-health.md`, `docs/telegram-webapp-integration.md`.
- Elo breakdown of a game, one source for the chat picture and the in-app protocols (owner, 2026-10-27): `seatEloOfGame` / `seatEloLines` / `eloTableOfEvent` / `loadGameEloBlank` in `src/server/services/clubResultData.ts`; player game page `PlayerGameDetail.tsx` (`elo_lines`, `elo_table` from `playerGameDetailRoutes.ts`), organizer protocol window «Эло за игру» `gameProtocol/EloBlankSection.tsx` (`GET /api/games/:id/elo-blank` in `gamesRoutes.ts`); shared lines UI `src/components/game/EloBreakdown.tsx`; tests `src/tests/gameEloBlankRoutes.test.ts`.
- Club chat pictures (game blank after each game, evening summary at closeout): data `src/server/services/clubResultData.ts`, drawing `clubResultImages.ts` (SVG → PNG with `@resvg/resvg-js`, fonts in `fonts/`), posting `clubResultPostService.ts` (run by the personal-notification worker, table `club_result_posts`).
- Tournament game blank to the rating group and personal «you sit on seat N» messages (first game 30 min before the start, next games after the result post): `loadTournamentGameBlank` in `clubResultData.ts`, `postTournamentGameBlank` / `runTournamentGameFollowUps` in `clubResultPostService.ts` (same worker scan), `tournamentSeatNotificationService.ts` (also the organizer's manual «Разослать места игрокам»: `POST /api/tournaments/:id/seat-messages` in `tournamentSeatingShareRoutes.ts`, a visible block `TournamentSeatMessagesCard.tsx` on the «Участники» and «Игры» steps in `TournamentDetailView.tsx`, and a button in `TournamentDetailViewBase.tsx`); tests `src/tests/tournamentGameFollowUps.test.ts`, `src/tests/tournamentSeatMessagesManual.test.ts`.
- Personal evening message in the bot and «Позвать друга»: `queueEveningPlayerCards` in `src/server/services/clubResultPostService.ts` (points and invite link helpers in `gameResultCardService.ts`); the invite link `/start ref_<id>` → `handlers/registration.py` → `POST /api/bot/players/register {invited_by}` → `recordInviteLinkReferral` in `premiumPlayerConnectionsService.ts`.
- Bot frequent questions edited by the organizer: CRM `src/components/crm/BotFaqCRM.tsx` («Ещё → Ответы бота»), server `src/server/routes/botFaqRoutes.ts` (`/api/bot-faq`), `botFaqService.ts`, table `bot_faq_entries` (`ensureBotFaqSchema.ts`, seed `botFaqSeed.ts`); the bot reads `GET /api/bot/faq` (`bot_api.get_bot_faq`, `bot_home.load_faq`) and falls back to the built-in `FAQ` list when the API is unreachable. Seeded keys `place` and `novice` keep their extra buttons (map, rules).
- Bot home card (/start, «📋 Меню», /events, /faq): `handlers/bot_home.py`. Two menus chosen by `audience_for` (player `game_level` from `GET /api/bot/players/by-telegram/:id/home`): newcomers (no profile, unrated, novice) get «Записаться на вечер» (novice evenings), «Что за игра?» and «Вопросы»; club players (club/tournament/rating) get the app, «Расписание», «Мои записи», «Составы» and «☰ Ещё» (`more_view`: stats, rating, tokens and shop, learning, groups, questions). Keep menus short: two buttons per row (`_pairs`). Command list and bot description: `commands.py`.
- Green CI does not prove live token/webhook/deployed SHA.

## Runtime health / outage alerts

- Shallow liveness: `/api/health` in `src/app.ts`.
- Safe deep endpoint: `runtimeHealthRoutes.ts` -> `runtimeReadinessService.ts` -> canonical Amvera SQLite + Telegram/bot checks.
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
- Player-bound organizer sessions require an existing active `organizer_player_access`; successful password verification does not grant or restore that entitlement.
- If reads work but mutation gets 401/403, verify middleware on the exact route first.
- Claiming a profile the organizer made: verified Telegram/VK sign-in → `playerOnboardingService.ts` (nickname request, `completeClaimPlayerOnboarding`), organizer approval `playerOnboardingOrganizerService.ts` (`attachExternalIdentity`), personal links `playerClaimLinkService.ts` (bot `/start claim_<code>` in `handlers/registration.py`), VK page field `vkProfileLinkService.ts`; card UI `PlayerAccountLinks.tsx`, player UI `VerifiedPlayerOnboarding.tsx`.

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

## Tournaments for players (owner, 2026-10-06)

- Player screens: list `src/components/player/PlayerTournamentResults.tsx` (tab «Турниры» of the rating hub), one tournament `PlayerTournamentView.tsx` (registration, roster, games with roles, live table, nominations).
- API: `GET /api/player/tournaments`, `GET /api/player/tournaments/:id` (`playerTournamentResultsRoutes.ts`, assembled by `src/server/services/playerTournamentViewService.ts`).
- «Закрыть таблицу для игроков»: `tournaments.standings_hidden_at`, organizer button `TournamentTableVisibilityCard.tsx`, `POST /api/tournaments/:id/standings-hidden`.

## Weekly development snapshot
- Scoped export: `src/server/routes/developerSnapshotRoute.ts`, mounted in `developerReadRoutes.ts`.
- Reviewed projection: `anonymizedSnapshotPolicy.ts`, `anonymizedSnapshotService.ts` under `src/server/services/`.
- Download/encryption/decryption: `scripts/developmentSnapshot.mjs`; `.github/workflows/development-snapshot.yml`.
- Operational contract: `docs/DEVELOPMENT_SNAPSHOT.md`; tests: `src/tests/anonymizedSnapshot.test.ts`, `developmentSnapshotDownload.test.mjs`.

### Achievement paths and game-action evidence

`src/lib/achievementStories.ts` owns first-release story conditions/path definitions; `gameActionFacts.ts` owns final-ballot exclusions, confirmed checks and critical composition. `playerAchievementStoriesService.ts` calculates private evidence and career progress; `playerAchievementsService.ts` keeps canonical evaluation and overrides. `PlayerAchievementPaths.tsx` renders paths/pins and the old collection; `PlayerGameNumbers.tsx` renders the action breakdown. `PATCH /api/player/achievement-preferences` persists the authenticated player's settings only.

 Navigation and education UX: keep four main tabs in PlayerBottomNavigation.tsx. CanonicalPremiumPlayerProfile.tsx groups eight Progress views as five main groups with nested Career/Awards tabs; PlayerLearningBlock.tsx is a clear categorized Learning hub with links to the single public guide. PublicGuide.tsx offers a visible return to Progress and uses the same bottom menu when entered from the cabinet. App.tsx gives Telegram Back ownership to PublicGuide on /guide; legacy /player/profile/<tab> paths remain supported.

- Player 2.5D trophies: `src/components/player/TrophyCabinet.tsx` + `TrophyCabinet.css` (interactive shelves, vector exhibits, categories, controls); pure award classification in `src/lib/trophyCabinetModel.ts`; mounted in `PremiumProfileShowcase.tsx` under Progress → Awards. Reads `/api/player/profiles/:playerId/showcase` verified awards and earned achievements from existing services, no new database or fictitious grants. Check `src/tests/TrophyCabinet.test.tsx` for prize ownership/first-place cases.

- Unique tournament trophy artwork and award source drill-down: `src/components/player/TournamentCupAsset.tsx` (four SVG silhouettes, individual engravings); `src/lib/trophyCabinetModel.ts` (stable tournament design and verified source IDs); `TrophyCabinet.tsx` reuses `PlayerTournamentView.tsx` for tournament details and `/player/events/:id` for auto-issued evening awards. No new trophy table or manually granted wins. Browser art fixture: `e2e/player-profile-harness.tsx?trophies=2`, `trophy-cabinet-preview.spec.mjs`.
- Server slowness diagnostics (event-loop stalls, slow requests, slow database transactions; `GET /api/health/performance`): `src/lib/performanceProbe.ts` (records), `src/server/services/performanceWatchdog.ts` (monitor and request middleware), transaction timing in `src/db/index.ts`, route in `src/server/routes/runtimeHealthRoutes.ts`. Requests are recorded by route template only (URLs can carry secret tokens). Cache versions that unrelated writes must not drop: `src/server/services/analyticsInputsVersion.ts` (finished-game snapshots).

- CRM «Ещё → Проект» (read-only view of `docs/PROJECT_STATE.md` by direction/status + the pull requests, owner request 2026-10-12): parser `src/lib/projectBoard.ts`, routes `src/server/routes/projectBoardRoutes.ts` (`/api/project-board`, `/pulls`) → `projectBoardService.ts`, screen `src/components/crm/ProjectBoardCRM.tsx`, entry in `MoreCRM.tsx`.

- Rating «По ролям» (the club's Dons / mafia / Sheriffs / citizens with the role's reveal figures, owner request 2026-10-12): `loadRoleRating` in `metricRatingService.ts` → `GET /api/rating/roles` (`ratingRoutes.ts`) → `PlayerRoleTables.tsx`, opened from the switch in `PlayerMetricRatings.tsx`. «Две версии стола» also on the broadcast (`LiveBroadcastOverlay.tsx`) and in the CRM game analysis (`GameAnalysis.tsx`) via `revealVersions`.
- Public offer / seller details / refund and personal data policy (payment provider moderation, owner 2026-10-13): `src/components/public/PublicOffer.tsx` at `/offer` (no login), details in `src/lib/legalInfo.ts`, link in the organizer login sheet (`OrganizerCRM.tsx`); texts follow `docs/BUSINESS_RULES.md` prices and payment rules.
- «MVP вечера»: `eveningVoteRounds.ts` owns the durable finalists/deadline in `evening_mvp_runoffs`; `eveningMvpService.ts` resolves the primary vote → separate finalist runoff → owner decision only after a repeated tie. Already finalized historical results retain their original resolution. `eveningVotingService.ts` provides the same active round to app/bot; `eveningVoteMessageService.ts` runs the independent worker and queues round-specific callbacks (`evv:` / `evr:`). `clubResultPostService.ts`, `mvpCardService.ts`, `clubYearAwardsService.ts` consume that result; medals/cups use `isCupAward` in `trophyCabinetModel.ts`. Coverage: `eveningRunoff.integration.test.ts`, `mvpResultPost.test.ts`, `club-followups.spec.mjs`.
- MVP pictures: `mvpVoteSvg` / `mvpResultSvg` in `clubResultImages.ts` (noir style, player photos from `loadAvatars`), used by `postVotePrompt` and `postMvpResult` (Telegram `sendPhotos`, VK `sendVk` with `image` → `uploadVkWallPhotoBytes` in `announcementPhotoService.ts`).
- Pictures in personal Telegram messages: `photoPng` on `enqueueTelegramMessage` / `telegramPhotoPng` on `queuePersonalNotification` (column `photo_png` in `telegram_message_outbox`, sent by `sendTelegramMessage` as a photo with the caption, cleared once delivered); cards from `mvpCardService.ts`.
- «Связать Telegram» for a VK player: `POST /api/player/telegram-link` (`playerNotificationPreferenceRoutes.ts` → `createPlayerClaimLink`), button in `PlayerNotificationSettings.tsx`; the bot's VK-only nickname message in `handlers/registration.py` (`vk_only` from `isNicknameVkOnlyProfile`).
- Telegram link requested from the bot (`telegramLinkRequestService.ts`, `/api/bot/telegram-link-request`, `/api/player/telegram-link/redeem`, `TelegramLinkRedeem.tsx` at `/player?tglink=`, hint in `VerifiedPlayerOnboarding.tsx`; bot buttons in `handlers/registration.py`).

## Sporting role identity and UI

Role metadata/types: `src/shared/gameRoles.ts`. Shared icon, card mark and inline badge: `src/components/ui/GameRole.tsx`. Compatibility adapters: `src/lib/tournamentRoleValidation.ts`, `src/lib/playerGameRoleLabels.ts`. Used by the player cabinet, physical deal, Live Game seats and OBS broadcast. Do not add another local role dictionary; see `ARCHITECTURE.md`.
- «Кровь на часовой башне» (stub: rules + rooms + invitations, no game): rules texts `src/lib/clocktowerGuide.ts` + shelf in `src/lib/guideCatalog.ts`; player section `PlayerClocktower.tsx` (route `clocktower` in `appNavigation.ts`, entry: the «Мини-игры» tab of `PlayerCommunityHub.tsx`, which also holds the poker table card); rooms `src/db/ensureClocktowerSchema.ts`, `clocktowerRoomService.ts`, `src/server/routes/clocktowerRoutes.ts`; invitations reuse `pokerInviteService.ts` (`kind: 'CLOCKTOWER'`) and `PokerInvitePanel.tsx`; tests `clocktowerStub.test.tsx`, `clocktowerRooms.integration.test.ts`.

- Evening tariff settings: EveningPriceSettingsCard.tsx in DataSettingsCRM → /api/evening-prices → eveningPriceSettingsService.ts; shared defaults/formulas in lib/eveningPrices.ts. Frozen evening tariffs: evening_price_policies; changing defaults does not reprice existing evenings.
- Evening posts: VK — vkDirectJoinPublishingService.ts (club post = postTemplateService template; novice/rating own text); Telegram — handlers/telegram_evening_copy.py. Prices: eveningPriceSettingsService.ts. Open evening predicate: lib/eveningStatus.ts.

- Achievement progression API (`playerProgressionRoutes.ts`) projects `loadPlayerAchievementProfile` through `achievementProgressionFromProfile` in `playerAchievementsService.ts`; it has no separate achievement catalog. Shared observed-role ranking without minimum-game eligibility: `src/lib/rolePerformance.ts`, used by profile, progression and insights.

- CRM role changes during tournament Live Game: `src/lib/liveRoleCorrections.ts` (complete assignment boundary, explicit `role_corrected` commands and replay); `TournamentLiveGameModal.tsx` (20-second observer); `LiveGameEngine.tsx` (producer journal, current/Undo projection); `src/lib/liveNightChecks.ts` (shared current check answers). Tests: `liveRoleCorrections`, `liveGameReloadRestore`, `liveGameScenarios`; browser fixture `tournament-live-game.html?mode=role-correction`, mobile checks in `live-game-compact-layout.spec.mjs`. Seat changes still use their existing warning path.

- Community/Progress CP01–CP15: `CanonicalPremiumPlayerProfile.tsx` owns grouped navigation, scope recovery, independent content states and neutral public privacy states; `PlayerCabinetShell.tsx` synchronizes existing profile routes. `src/lib/profileViewMemory.ts` stores only viewer/player view preferences in session storage (tab, filters, page, scroll), never fetched player data. Overview owns recent games and `PlayerInsightsPanel.tsx` before open detailed statistics.
- Community metric search/count/context: `PlayerMetricRatings.tsx`; seasonal accrual→protocol: `PlayerRatingHub.tsx` / `PlayerRatingPeriods.tsx`; match spotlight→protocol: `PlayerStoriesPanel.tsx`. Canonical destinations remain `playerProfileNavigation.ts`.
- Awards collection/goals/arrangement: `PremiumProfileShowcase.tsx`, pin-limit UI in `TrophyCabinet.tsx`. Trusted self-only timeline game keys: `premiumPlayerProfileShowcaseService.ts`; absent source IDs remain unlinked.
- Learning continuation: `PlayerLearningBlock.tsx`; shared browser-only `guide-progress-v2` contract now in `src/lib/guideProgress.ts`, re-exported by `public/guide/GuideScreens.tsx` for current consumers.

- Community/Progress menu continuation: `PlayerCommunityHub.tsx` exposes all Community destinations; `ClubConnectionStories.tsx` uses a2×2 phone selector. `SegmentedControl.tsx` opt-in `wrapLabels` keeps affected labels/counts whole without changing other controls. `CanonicalPremiumPlayerProfile.tsx` remembers Career/Awards subviews in `profileViewMemory.ts`; only `.profile-content` scrolls and owns view restoration. Cabinet work-area bounds: `styles/telegram-viewport.css`; wide statistics placement: `styles/desktop-workspaces.css`. `e2e/tests/community-progress-menu.spec.mjs` adds the affected route to the existing unchanged layout detector; app CSS order is guarded for live/profile/cabinet harnesses in `liveGameHarnessStyles.test.ts`.

- Community nested context: `src/lib/communityViewMemory.ts` owns viewer-keyed session preferences for the last rating route and Activity subview; `PlayerCommunityHub.tsx` applies them only to group navigation, with explicit route/Back priority. Metric picker reset/clear/Escape/focus: `PlayerMetricRatings.tsx`; role list extent/identity: `PlayerRoleTables.tsx`; self/public award wording: `PremiumProfileShowcase.tsx`. `community-menu-context.spec.mjs` covers the connected route through the existing layout detector; paired multiline clip/overlap cases live in `layout-audit-detector.spec.mjs`.

- Approved Community structure (2026-10-28): `PlayerCommunityHub.tsx` owns Players (directory/metrics/form), Rating (Elo/season/tournaments), Connections, History (evenings/Hall of Fame), Mini-games. `appNavigation.ts` maps old rating-metrics/activity URLs to the new homes; `communityViewMemory.ts` stores the last group/subview per viewer, used by the cabinet footer. `PlayerSeasonHub.tsx` keeps sporting/current/past period selection together; the existing calendar-statistics archive remains available when no sporting period exists. Hall of Fame is only `PlayerSeasonsPanel part="hall"` in History. `ClubConnectionCard.tsx` is shared by all relationship summaries; both-colour partners are under Teammates. `shared/playerForm.ts` owns the unchanged Form formula and consistent comparison order; `PlayerClubActivity.tsx` explains it and shows optional visible/own recent outcomes from `playerPulseRoutes.ts`. `community-structure.spec.mjs` covers all states with the unchanged layout detector.

- Community content: `PlayerMetricRatings.tsx` is the six-category matrix/comparison; `GET /api/rating/metrics/table` → `metricTableService.ts` reuses `metricRatingService.ts` with one complete `loadMetricScope`. `shared/metricTable.ts` owns the matrix contract/sort/difference. Existing single-figure/role APIs keep their contracts. `GET /api/player/relationships` adds scoped `content` from `connectionContentService.ts`; `shared/connectionContent.ts` owns stories/pair history. `ConnectionPairHistory.tsx` opens canonical game links; the Community hub passes the same pair/scope from comparison. `connections-metrics-content.spec.mjs` audits new states at four sizes.

- Aggregated outstanding-evening reminders/tasks: read-only `playerEveningDebts.ts` is shared by `eveningPaymentReminderService.ts`, `organizerReminderService.ts` and `clubOrderService.ts`; ledger writes remain in the payment services.
- Current birthday task wording: `shared/birthdayTask.ts` reads the dated automation key on the Moscow calendar; task/agenda/bot routes and organizer reminders share it. `playerProfileIntegrityService.ts` refreshes the existing open row, preserving postponed due dates and completed tasks.

### Public-post acknowledgement and recovery

`src/server/services/publicationDeliveryService.ts` owns durable public attempts, frozen request/target, certainty, startup cutover and versioned decisions. `publicationTelegramService.ts` requires valid Telegram message IDs (every album item); `publicationRecoveryService.ts` projects CRM metadata and replays an explicitly released saved request. `/api/crm/publications/held` and `/reconcile` in `crmRoutes.ts` serve full club organizers; `PublicationRecoveryQueue.tsx` lives in OrganizerAgenda («Дела»). Consumers: today, cancellation, reschedule, club/MVP/tournament results and poker/custom announcements. Personal queues and weekly sync/outbox keep their own policies.

### Fair virtual role deck

`src/components/game/VirtualRoleDeal.tsx` owns the shuffled closed deck, horizontal cards, reveal/confirm, seat choice, undo/redeal, music lifecycle and async completion feedback. Club/novice/rating use `LiveGameEngine/ClubGameSetupPhase.tsx`; unmanaged setup uses `GeneralSetupPhase.tsx`; `player/TournamentLiveGameModal.tsx` saves through the existing tournament roles API and reads back before dismissing. `tableComposition.ts` remains the role-count owner. Existing physical dealing and training remain; VIP effects are not included. Current approved/deferred scope: `ROLE_DEAL_SPEC_2026-10-28.md`. Browser path: live-game-text-audit virtual cases and tournament-virtual-deal.spec.mjs.
