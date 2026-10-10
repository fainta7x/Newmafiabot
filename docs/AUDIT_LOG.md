# Audit log

## 2026-10-10 · App-wide wording audit (owner request: no rule-book language, plain words)

Scope: ~420 long Russian sentences across `src/components` (player 108, public 63, CRM 227, live game 16) plus player-facing server texts (`playerInsightsRoutes`, `playerPulseRoutes`, `playerStoriesRoutes`, `playerReplayRoutes`, `playerPaymentRoutes`). Read the player and public sets in full, the CRM set by keyword.

- [fixed] 28 rule-book / developer-speak phrases rewritten in plain words: game-number footnotes, payments («Интерфейс и назначения платежей уже разделены…»), Elo journey, achievement paths, progression, replay disclaimer, invite suggestions, award suggestion, privacy note, betting hints, live-center and evening hidden-roles lines (unified «Роли и проверки откроются после игры.»), judging mode note, onboarding, public join, server insights («п.п.», «Выраженная ролевая разница»), pulse/stories/replay/payment captions, and CRM texts («Серверный адаптер публикации готов», «Никакой курс автоматически не придуман», «через журнал жетонов», «канонические статистические критерии»).
- [open] Mixed address form: onboarding, events calendar, judge screens, guides and the public guide use «вы», most other player screens and the bot use «ты». Needs an owner decision (proposal: «ты» for all player screens) before a sweep.
- [open] The rest of the CRM texts are operational notes written for the organizer; not rewritten in bulk. Point at any screen that reads badly and it will be rewritten.
- [open] Business-rule footnotes inside the mafia trainers/guides (`SplitThreeTraining`, `SplitVoteTraining`) are lessons, not UI boilerplate; left as is.

## 2026-10-10 · Player «Связи»: duplicated blocks and rule-book wording (owner request)

- [fixed, step 1] The same personal data was shown in 3–4 places (Community → Связи rivals/teammates/recent, profile → Связи list, insights panel opponents, invite suggestions). Community is now club-wide only; personal lists live in the profile.
- [fixed] Misleading title «С кем хорошо играется вместе» (it was the most-played-with list, not a quality ranking) — removed with the block; profile list is titled «С кем ты играешь».
- [fixed] Rule-book phrases in club stories, best pairs, profile list, insights panel and invitations («Минимум две совместные игры», «События: N», «В порядке имён выше», «Только факты завершённых игр… без скрытого рейтинга», «Нужно ≥3 очных игр», «Показывается только при достаточной выборке…») rewritten or removed.
- [fixed after review] Opponent rankings («Сложные/Удобные соперники») and the social graph in `PlayerInsightsPanel` removed so the profile list is the single owner; club-story entries keep the distinct event count required by BUSINESS_RULES (plain wording «вечеров и турниров: N»); invitation delivery wording stays channel-neutral. Step 2 brings nemesis/comfortable back inside the personal list.
- [open, pre-existing] `e2e/tests/club-pilot.spec.mjs` fails on `main` before this change as well (stale selectors, not part of the CI preview set); its connections assertions were updated for the new structure but could not be verified.

## 2026-10-10 · Review of «Факт или фантазия» task clarity

Scope: first-chapter content, mobile coaching interface, repeated practice and saved attempts. Owner reports too few similar tasks, unclear prompts/explanations and unnatural player references. No changes to Live Game, split-vote or judge trainers.

- [fixed in unmerged PR, CI pending] `src/lib/mafiaReasoningCourse.ts`: the first chapter had 3 near-duplicate cases; now 10 distinct situations, with 5 per attempt and alternating case selections on repeat.
- [fixed in unmerged PR, CI pending] `src/lib/mafiaReasoningCourse.ts`: vague assertions, mind-reading and shorthand nicknames made some explanations hard to follow; revised the first chapter and player references throughout all five chapters.
- [fixed in unmerged PR, CI pending] `src/components/public/guide/MafiaReasoningCourse.tsx`: two questions per case looked repetitive; context now explicitly identifies the situation and step, with clearer explanations, dynamic scoring and migration of existing local attempts.
- [verification pending] Focused bank/rotation/legacy-storage/UI tests, TypeScript/lint/build, PR mobile preview. Main must stay unchanged until the owner completes hands-on review and explicitly authorizes merge.


## 2026-10-10 · Owner-reported: protocol editor cannot be finished; deleted games take evening numbers

- [fixed] `EveningGameProtocolModal.tsx`: every save wrote the server's echo (a fresh object) back into state, which re-triggered the autosave effect — an endless «сохранение… / есть изменения» loop; the pending 1-second timer also held a stale closure of the draft, so «Завершить игру» was overwritten by a draft save and the game fell back to «Не завершена». Now: autosave compares against the last server-confirmed snapshot (echo never re-saves), saves are serialized and only the newest may update the screen, the pending autosave is cancelled by complete/reopen, and the reasons completion is blocked (roles, winner) are shown on screen instead of `alert()`. Regression tests: `EveningGameProtocolModalAutosave.test.tsx` (failed before: 6 saves for one edit; final status draft).
- [fixed, owner rule 2026-10-10] Evening game numbers counted deleted/archived games in the CRM list, the Telegram result blank (`clubResultData.loadGameBlank`) and personal results (`loadEveningPlayerResults`), while the player app did not — a deleted test game made the real first game «№2». All now number kept games only; the archive list shows «Удалённая игра». `global_game_number` is unchanged (separate counter, may have gaps). Rule recorded in BUSINESS_RULES.
- [open, info] Results already posted to Telegram with the old numbering are not edited.

## 2026-10-10 · Audit of everything merged after #725 (last Claude PR) up to #769

Scope: 39 commits, ~11k lines. Automated: `tsc --noEmit` clean, `npm run lint` clean, full Vitest 2168 passed (3 failures only because this container exports a real `ORGANIZER_PASSWORD`; green with it unset), Python bot tests 63 passed. Read in detail: Robokassa test payments, Telegram late-arrival RSVP (#768), evening reschedule notices (#757), player evening workspace (#765/#766), poker buy-ins/invites (#737, pokerInviteService), judge scoping (#739), VK profile claim fallback (#752), perf caches (#767), club relationships privacy. Not covered: live-game mobile geometry hotfix (#769), judge-trainer content, trophy cabinet visuals — need browser/phone checks.

- [fixed] `handlers/crm_evening_response.py`: late-arrival prompt "С какой игры тебя ждать?" contained a literal `\\n` (backslash-n shown to players in Telegram). Now a real line break.
- [fixed] `EveningActiveRosterView.tsx`: add-to-evening picker hid every player who already had any participant row, but the roster hides «Не буду» / «Пока думаю» / «не пришёл» rows, so such a player (e.g. a walk-in who had answered no) could not be added anywhere. They now stay in the picker and are returned to the roster.
- [fixed] `pokerInviteService.ts`: invite text hardcodes «вход 1 000 🪙» although buy-ins are now variable (from 10 BB, #737).
- [fixed] `pokerInviteService.queuePokerInvite`: cooldown check and insert are not atomic; two simultaneous invites can both pass (worst case one extra message).
- [open, info] `/api/bot/.../respond` now returns 400 `starting_slot_required` for «late» without a game; any old client that sends plain «late» (old Telegram buttons are handled by the new callback) would be rejected.
- [checked, no defect] poker create/join charge-before-seat ordering: token debit and table snapshot are one transaction (`withPersistedPokerRuntime` rolls both back); regression test added (`pokerBuyInExploit.integration.test.ts`).
- [checked 2026-10-10, no defect] Browser pass on current `main` (local Chromium via the preview build, 360/390 px and desktop): all 69 preview specs (live-game compact geometry after #769, trophy cabinet, Telegram viewport matrix, cabinet, split-vote trainers) and the 6 judge-trainer specs (mobile layout, finalization, desktop) pass; screenshots of the 360 px table, trophy cabinet and judge-trainer table/death protocol inspected. Observation only: at 360x700 the bottom «События» bar of the training table sits at the screen edge, partly under the floating clipboard button; not reproduced as a functional break.
- [checked, no defect] Robokassa test checkout/ResultURL: signed, amount checked, test-DB only, idempotent, success/fail redirects confirm nothing.

## 2026-10-09 · Broken three-way split prompt wording

- [fixed in PR] `SplitThreeBreakTask.tsx` displayed a long and mechanical broken-split condition, including votes already cast and a separate sentence about the breaker. The owner requested direct wording: «Попил сломан! 8 не поставил руку в 1. Что делаем дальше?»; both numbers come from the existing scenario. Details about prior hands remain in the voting step, without changing vote distribution or the 15-second deadline.
- Regression: test both the owner's example and a different breaker/first nominee, and keep mobile preview checking the live generated wording.


## 2026-10-09 · Split-vote trainers CI follow-up

- [fixed] Required Vitest splitThreeScreen test still expected the old breaker-feedback expression. Updated explanation explicitly names the breaker rather than an ambiguous pronoun, retaining the numeric regression assertion.
- [fixed] Mobile Playwright preview assertions retained four phrases that were intentionally replaced by short teaching copy. Updated these assertions to verify equivalent learner-visible guidance and statuses; no release gate disabled or relaxed to ignore runtime failures.
- [fixed] `SplitTableMap.tsx` legend printed comma-delimited voters instead of club notation: use canonical `seatList` for groups, retain literal `10` for a singleton seat 10; new focused tests cover both.

## 2026-10-09 · Split-vote trainers UX

- [fixed in PR] `SplitTableMap.tsx`: cramped schematic mixed nomination order, vote color, self seat and sheriff flags; tiny arrow labels collided with seat circles. Preserve seating rule but add clear labeled chips, a vote-by-candidate list and readable within-seat vote arrows.
- [fix in PR] `SplitVoteTraining.tsx`, `SplitThreeTraining.tsx`, `SplitVoteExpert.tsx`: conditions were scattered verbose sentences, and feedback lacked precise rationale or first incorrectly placed voting hand. Keep rule engines intact; simplify task briefs and add rule-based error feedback.
- Verification target: tasks at 360/390 CSS px, no spoilers before checking, full exam/achievement state and 15-second deadlines unchanged.


## 2026-10-09 · CRM route cleanup follow-up (Codex/CI)

- [fixed] `eveningRouteService.ts`: planned announcement time was repeated twice while the same Monday 19:00 due time was already present in the pending message. Use the existing due text directly while pending; focused pending regression remains authoritative.
- [fixed] `EveningPersonalInvites.tsx` and `EveningParticipantsView.tsx`: changing a quick response reloaded only the personal-invites subview, leaving the primary game-registration dashboard stale. Successful saves now notify the parent and bump the sibling's refresh key; added a focused callback test.

## 2026-10-09 · CRM route cleanup (owner UI request)

- [fixed in PR] `EveningWorkspace.tsx` mounted a second overview underneath the route with duplicated timing, messaging and responses controls. The route is now the single home.
- [fixed in PR] `EveningRouteView.tsx` did not expose the existing move-start editor or announcement channel controls from the corresponding Preparation steps. Both are inline and collapsed by default.
- [fixed in PR] `EveningPersonalInvites.tsx` duplicated the answers dashboard in the wrong tab. Keep its useful contact and quick status features in a collapsed section of `EveningParticipantsView.tsx`.
- [unchanged] The Monday 19:00 Moscow auto-announcement schedule is fixed by `weeklyAnnouncementDue.ts`; this request changes placement only, not the scheduler. UI check: controls expand and mobile viewport remains usable.


## 2026-10-09 · Evening route, host and move notices

- UI: «День вечера» duplicated preparation/gathering duties — fixed by moving staff/tables and start to those stages; cancel belongs under closing, without loosening cancellation permission.
- Telegram/VK: existing announcement formatters showed the assigned judge only in player rosters — fixed by reading `evening_staff_assignments.judge_player_id`; refreshing existing posts when this assignment changes.
- Slot reschedule: game times and original channel posts updated but registrants received no distinct notice — add individually keyed personal outbox deliveries and a separate Telegram/VK correction, guarded against no-op edits.
- Verification: targeted route/start/notification tests; external provider delivery and Amvera deploy remain separate checks.

Owner of: findings of code/behaviour audits (what was found, what is fixed, what is still open). Current queue and deploy state stay in `docs/PROJECT_STATE.md`; this file is the evidence behind the queue, so an audit never lives only in chat.

Rules:

- Every audit (own review, subagent sweep, parity check) is written here **in the same session it is done**, before fixing starts: date, scope, each finding with file and a one-line defect.
- A finding is marked `open`, `fixed (PR/commit)` or `wontfix (reason)`. Do not delete fixed entries; change their status.
- A finding that only exists in a summary or chat does not count as recorded.

## 2026-10-08 · Stranded VK profile linking (PR #752)

Scope: owner-reported first VK login to a historical/manual profile, private Telegram confirmation, organizer approval in the player card and exact-head review.

- `src/server/services/playerOnboardingService.ts` — VK claim for a Telegram-linked profile completed with private confirmation only, leaving no organizer-reviewable request when the old Telegram was inaccessible. Status: fixed (PR #752); verified VK identity also receives an explicit organizer-review request, including unavailable delivery and rate limiting; identity conflicts remain denied.
- `src/components/player/VerifiedPlayerOnboarding.tsx` — pending screen did not explain where confirmation was sent or how the organizer could help. Status: fixed (PR #752); exact confirmation channels, CRM location and same-channel sign-in after approval are explained.
- `src/components/crm/PlayerAccountLinks.tsx` and `src/server/routes/playersRoutes.ts` — player card did not expose pending verified-account requests for manual approval. Status: fixed (PR #752); safe request metadata and authenticated approve/reject actions reuse existing conflict guards.
- `src/server/services/vkPlayerAuthService.ts` — private Telegram approval needed to close the parallel CRM request. Status: fixed (PR #752); matching pending request is marked approved after successful binding.
- `docs/AUDIT_LOG.md` — initial PR omitted the durable bug-hunt record required by AGENTS.md. Status: fixed (PR #752 review follow-up); this entry records scope, affected files, defects and final code status.

Verification: initial code head `7a0ff3c7af1695d113ec7cb075904e22184b93f9` passed CI, CodeQL, Gitleaks and UI preview. Follow-up changes documentation only; final-head gates are checked separately. Amvera deployment and real Telegram/VK runtime verification remain unverified. No production data edits.

## 2026-10-08 · Achievement paths review follow-up (PR #742)

Scope: exact-head automated review after the first green release gates.

- `achievementPathsApi.test.ts` — the new summary privacy test assumed a dated story was among the latest three despite newer legacy grants. Status: fixed (PR #742 follow-up); fixture legacy dates made older explicitly, retaining the production three-item limit and positive organizer/negative public evidence assertions.

- `playerAchievementStoriesService.ts` — raw first-killed/best-move markers survive a restoration and could issue two PU stories from retracted evidence. Status: fixed (PR #742 follow-up); PU evidence collapses restorations/replacements and regressions cover retraction, replacement and valid re-selection.
- `premiumPlayerProfileRoutes.ts` `requireViewer` — a player cookie hides independently authenticated organizer rights, causing the new evidence scrub to hide grounds from player-bound organizers. Status: fixed (PR #742 follow-up); independently authenticated organizer flag retained, API regression covers player-bound organizer cookies and an invalid organizer token.
- `PlayerGameNumbers.tsx` — vote card headings describe the target color even though cards group by the actor's color. Status: fixed (PR #742 follow-up); headings explicitly say «играл красным/чёрным», target counts retained.

## 2026-10-08 · Achievement paths and action counters release verification

Scope: the approved first release of 16 story/career achievements, role-separated action facts and profile UI, PR #742.

- `src/tests/gameStatisticsRoutes.test.ts` — profile API regression still expects a zero-circle ballot in `votesAsRed`, contrary to the owner-approved exclusion. Status: fixed (PR #742 follow-up); zero-circle exclusion and positive ordinary-day/check API regressions are both asserted.
- `e2e/tests/achievement-paths-preview.spec.mjs`, `e2e/tests/desktop-workspaces.spec.mjs` — unscoped descendant `summary` selectors now match both nested disclosure controls. Status: fixed (PR #742 follow-up); direct disclosure summaries targeted, visual/overflow assertions preserved.
- Local full-suite execution was stopped by automatic approval review over possible Telegram traffic. Background integration workers are disabled under Vitest; GitHub test jobs have no production tokens. Local focused tests passed; CI is the full-suite gate. Local exec transport then became unavailable; publication/CI remain accessible through the GitHub connector. No production data or messages were sent by this workstream.

## 2026-10-07 · Poker bots suddenly play weak (owner report)

Scope: players say the bots got weak after the bot patch; a novice (Диссонанс) went from losing to a 6 000 stack. Checked the bot code history, the card visibility, the bot turn loop and the stored-hand statistics.

- `pokerBot.ts` strategy — unchanged since #696/#697 (2026-10-05); #706 only sped up the deal. Not the cause by itself. Status: checked.
- `pokerLobbyService.ts` `publicState` — other players' cards reach a viewer only after a showdown or an all-in runout; history shows only revealed cards. No card leak. Status: checked.
- `pokerLobbyService.ts` `tickPokerLobby` — bots decide on every tick inside the database's memory scope; they never time out. Status: checked.
- Stored hands (296): Диссонанс 169 hands, VPIP 89%, PFR 76%, fold to a bet 4%, aggression 0.33 — raises almost every hand and almost never folds. The bots' adaptation to this profile is the main suspect. Status: open — `/poker/results` added to see where the chips go (by day, opens, re-raises, bets after the flop).
- `/poker/results` (304 hands): bots +3300 overall; Диссонанс −790 over 177 hands (−4730 on 6 Oct, +3940 on 7 Oct), +3430 from pots won without a showdown, −3710 at showdowns; the bots folded to his re-raise 43 times of 60. Status: found.
- `pokerBot.ts` `preflopDecision` — a re-raise was answered from a fixed chart by the number of raises, not by the price: a min-raise from 2 to 3 big blinds (one more big blind) was folded like a 3x re-raise. Status: fixed — equity against the re-raiser's measured range (bots now count re-raises) against the price and the position.
- `pokerBot.ts` — a call of at most a quarter of the pot, or a re-raise under 2x, was folded with weak hands. Status: fixed — such a cheap call is never folded (owner: «если доплата ничтожна — это всегда колл»).
- `pokerBot.ts` `opponentRanges` — a 1 bb bet into a 7 bb pot narrowed the bettor's range almost like a half-pot bet. Status: fixed — bets under a quarter of the pot weigh much less.
- `pokerBot.ts` `preflopDecision` — an all-in before the flop was called only with the top 5–11% of hands, so «push any two» (Диссонанс now shoves every hand) won the blinds every time. Status: fixed — call when equity against the shover's measured shove range beats the price (≈ A2+, K5+, Q8+, J9+, any pair against any two at 50 bb).
- `pokerBot.ts` — no fear of busting at the cash table (ICM only in tournaments); short stacks shoved with push/fold-chart hands. Status: fixed — `stackPressure`: ranges ×0.6 and +6% needed equity at ≤15 bb, ×1.25 and 0% at ≥125 bb; short-stack shoves only with strong hands.

## 2026-10-06 · Production slowness: the app loads slowly, the monitor reports outages (owner report)

Scope: production response times (read-only probes of `/api/health`, `/api/health/runtime`, `/__developer/status`), periodic workers, player polling.

1. HIGH `fixed (this PR)` — the server froze for 18–34 s about once a minute (health answered in 0.5 s otherwise). `loadPlayerEloHistory` (`playerEloHistoryService.ts`) replays every club and tournament game, with full tournament standings, synchronously on the database; it ran every minute from the background notification scan (`personalTelegramNotificationService.ts`, `queueEloNotifications`) and twice per `GET /api/player/notifications`, which every open player app polls once a minute (`PlayerSmartNotifications.tsx`). PR #713 moved every tournament to the flexible format, which made the replay heavier. Fix: the timeline is kept per database and replayed only when its inputs change (row counts, protocol sizes, stored Elo); the minute scan does nothing without a tournament game finished in the last week.
2. LOW `open` — the monitor's outage issue #715 opened at the deploy of PR #714 (the restart); it closes itself after recovery.

## 2026-10-04 · Tournament / live-game audit and bug hunts (owner request)

Scope: tournament lifecycle, live game engine, protocol, registration/payments, Telegram/VK notifications, broadcast overlay, parity between game modes (tournament, club evening, novice, test sandbox).

### Fixed (merged to `main`)

- Tournament distance change (`game_count`) atomic with notifications, cancel / reset-to-planned rules, judge rule, trophy sync on completion.
- Live session persistence per game (`sessionKey`), winner confirmation, vote decided leader (`findDecidedVoteLeader`), clock catch-up after background, undo cap.
- One chronology for every mode (`buildFinalChronology`), game analysis, club protocol stores `events`.
- Correct-player change rebuilds Elo atomically; stale evaluator achievements revoked.
- Evening awards: one «Игрок вечера» vote (3-day window), yearly counter and «Игрок года», single win-rate rule (`winRatePercent`), season = rating period (`clubSeasonService`).

### Engine / protocol correctness — re-audit 2026-10-04 (replaces the lost «B1–B7»)

Read-only sweep by a subagent; traced from code, not reproduced. Status is updated as each is verified and fixed.

1. HIGH `fixed (engine-audit PR)` — only one ЛХ survives: `gameProtocolCore.ts:59-80` (`setBestMove`) keeps a single best-move marker, `EveningLiveGameModal.tsx:105-117` / `TournamentLiveGameModal.tsx:82-88` build `best_moves` from it, so the zero-round ЛХ is overwritten by the first-killed ЛХ (servers accept two).
2. HIGH `fixed (engine-audit PR)` — removal during the voting farewell cancels the voting and jumps to night: `LiveGameEngine.tsx:629-657` treats stage `resolved` as voting in progress; `startNightPhase` (1078-1102) does not clear `votingFarewellQueue` (winner effect stays blocked); `gameDiscipline.ts:161-208` `confirmAction` ignores `alive`, so removing an already-out player cancels the next voting.
3. HIGH `fixed (engine-audit PR)` — tournament: night without a shot (`liveClubSession.ts:133` emits `target_seat: 0, result: 'agreement_failed'`) is rejected by `tournamentProtocolRoutes.ts:372-375` (`validateShots`) on draft and complete.
4. MEDIUM-HIGH `fixed (engine-audit PR)` — «decided leader» exception counts the removed voter's ballot as unspent (`LiveGameEngine.tsx:629-635` passes old `eligible_voters` to `findDecidedVoteLeader`); also the round keeps `eligible_voters` 10 with 9 voters (`handleFinalizeVote` 826-835).
5. MEDIUM `fixed (engine-audit PR)` — 3rd foul / bought extension during a revote speech is consumed at once (`LiveGameEngine.tsx:438-444` effect on `discipline`).
6. MEDIUM `fixed (engine-audit PR; owner decision: status becomes «removed», everything recorded before — ПУ, ЛХ, protocols — stays)` — removing an already-out player overwrites `exit_reason` with `removed` (`LiveGameEngine.tsx:432`); tournament validators (`tournamentProtocolRoutes.ts:84,126,138,691-702`) then refuse the game, club save loses «killed».
7. MEDIUM-LOW `fixed (engine-audit PR)` — tournament `validateFirstKilled` (`:62-80`) cannot be satisfied when the first-night victim is black.
8. MEDIUM-LOW `fixed (engine-audit PR)` — voting cancelled by a mid-voting removal leaves a `pending` round (`LiveGameEngine.tsx:648-654`, `liveClubSession.ts:55-67,153-158`) that blocks tournament completion (`validateVotes` 555/589).
9. MEDIUM-LOW `fixed (engine-audit PR + ci-points PR)` — club server did not enforce the tournament invariants: free `ci_points`, no first-killed/zero-round/best-move consistency (`clubGameProtocolService.ts`). Now: best-move/first-killed consistency is enforced on completed saves; Ci survives only for the first-killed red player whose own best move names a black player, at most 0.4 when the reds lost and 0.2 when they won, never negative.
10. LOW `fixed (engine-audit PR + ci-points PR): tournament bonus bounded to ±1; club rounding is sign-symmetric` — judge/protocol bonus not bounded or rounded on the tournament server (`tournamentProtocolRoutes.ts:272-278`); club rounding is not sign-symmetric (`clubGameProtocolService.ts:35-39`).
11. LOW `fixed (engine-audit PR)` — undo does not restore `speechExtendedSlot` (`LiveGameEngine.tsx:140-143`).

Checked, no defect: win condition, raise/leave and 7-alive rules, best-move seat limits, foul/removal penalties and PPK winner, starter rotation.

### Notification reliability — re-audit 2026-10-05 (replaces the short list of 2026-10-04)

Read-only sweep by a subagent at `ef4b75e`; traced from code, not reproduced.

1. HIGH `fixed (notification-reliability PR)` — payment-deadline job and promotion/cancel flows queue notifications after the transaction commits; one throw (or a restart) drops the rest and the `payment_deadline_*_done_at` claim is already set (`tournamentEveningService.ts:517-534`, `:262-264`, `:271-272`, `:464`).
2. HIGH `fixed (notification-reliability PR)` — `unroutable` deliveries are never re-routed, not even by a manual re-send once the player linked a channel (`personalNotificationRouterService.ts:117-163`).
3. HIGH `fixed (notification-reliability PR): retried on a clean refusal (429/no token); a 5xx or a network error stays final because the message may already be out` — «вечер отменён» / shortfall notices get one attempt: retry count is forced to MAX before sending (`telegramMessageOutboxService.ts:141-150,166`).
4. MEDIUM-HIGH `fixed (notification-reliability PR): ~2 hours of retries (owner)` — retry window is ~1 minute (6 tries, 2 s base): a short Telegram/VK outage or redeploy permanently fails queued messages (`telegramMessageOutboxService.ts:25-42,166`, `vkMessageOutboxService.ts:23-36,113`).
5. MEDIUM-HIGH `fixed (notification-reliability PR)` — organizer alerts go as HTML without escaping; `<`/`&` in a nickname or title makes Telegram reject them permanently (`organizerNotificationService.ts:72-79`, call sites in `tournamentEveningService.ts:264,272,419,532`, `playerRegistrationService.ts:168`).
6. MEDIUM-HIGH `fixed (notification-reliability PR; owner: the announcement stays, the cancellation is a new message)` — cancelling a tournament does not update/close its Telegram post; the sync plan treats `cancelled` as live (`tournamentsRoutes.ts:345-373`, `botTelegramRoutes.ts:158`, `handlers/crm_tournament_publishing.py:87-106`); per-player notice errors are swallowed and the cancel cannot be repeated.
7. MEDIUM `fixed (notification-reliability PR)` — re-registration after a refund: claim stays `refunded`, `reportTournamentPayment` throws, the 72 h/24 h job demotes the player (`tournamentEveningService.ts:340,245,448,495`).
8. MEDIUM `fixed (notification-reliability PR)` — club result posts: 5 tries in 5 minutes, then `retry` forever and re-scanned every minute for 7 days (`clubResultPostService.ts:17,87-100,173,192,200,402`).
9. MEDIUM `fixed (notification-reliability PR)` — a crash during a club post leaves it in `sending` forever (`clubResultPostService.ts:88,173,192,208,402`).
10. MEDIUM `fixed (notification-reliability PR; owner: duplicate to Telegram)` — a permanently failed VK message never falls back to Telegram (`vkMessageOutboxService.ts:91-119`, `personalNotificationRouterService.ts:129-143`).
11. MEDIUM `fixed (notification-reliability PR): publishing needs an active tournament and an unfinished game; the overlay link stays available beforehand; the stored state still never expires` — live broadcast tournament endpoint does not check tournament/game status; one global slot; state never expires (`liveBroadcastRoutes.ts:88-142`, `liveBroadcastService.ts:276`).
12. MEDIUM `fixed (notification-reliability PR)` — Telegram tournament post prints UTC instead of club time (`handlers/crm_tournament_publishing.py:13`).
13. MEDIUM-LOW `fixed (notification-reliability PR)` — outbox is kicked inside an open transaction, so rows of a later-rolled-back transaction are already sent (`tournamentsRoutes.ts:269-290`, `personalNotificationRouterService.ts:128`).
14. LOW `fixed (notification-reliability PR; owner: remind at registration)` — details-changed / replacement keys can swallow a legitimate notice (A→B→C→B); no payment reminder for players who register after the 72 h mark (`tournamentEveningService.ts:306,496-509`, `tournamentRosterReplacementService.ts:72,207`).

Checked, no defect: Telegram outbox queue (no head-of-line blocking, permanent 4xx stop, in-flight dedupe), personal-notification ledger idempotency and healing, VK `random_id` idempotency, sync/dispatch outboxes, payment-deadline claim (`UPDATE … WHERE col IS NULL`), waitlist promotion (no double path), seat/results message scans, club result claim, broadcast token and payload normalisation.

### Poker bot strength audit (2026-10-05, owner: «боты слабые»)

Scope: `pokerBot.ts` by simulation (self-play statistics, new-vs-old head-to-head, benchmark against fixed styles).

1. HIGH `fixed (poker-bot-strength PR)` — preflop defence too narrow: big blind/button/small blind folded most hands to a 2bb open (`pokerBot.ts` preflop raises==1 branch).
2. HIGH `fixed (poker-bot-strength PR)` — postflop over-aggression: aggression factor ~6.5, ~34% of hands all-in, raise wars (`postflopDecision` raise candidates).
3. MEDIUM `fixed (poker-bot-strength PR)` — multiway fold equity used only the first opponent's profile (`postflopDecision`).
4. MEDIUM `fixed (poker-bot-strength PR)` — opponent ranges ignored what board and betting imply (`estimateEquity`/`opponentRanges`); c-bet too rare (~30%).
5. LOW `open` — river all-ins are still frequent (~14% of hands); not verified against real players.

### Terminology: «Лучшая мафия» (owner, 2026-10-05)

1. LOW `fixed (profiles-audit PR)` — the mafia nomination read «Лучшая мафия» / «Лучший черный игрок» / «ЛУЧШАЯ МАФИЯ» in five places; now «Лучший чёрный» everywhere (awards definitions, nominations list, public results, CRM player card, result pictures); stored automatic trophies are renamed by the next trophy sync. Manually typed award titles are left as the organizer wrote them.

- 2026-10-05 measurements (mirrored deals, `src/scripts/pokerBotCompare.ts`, `src/scripts/pokerBotVsProfile.ts`): the current bot against the bot before the day's work was inside the noise at every table size (heads-up about −25 ± 65, 3-max −12/+47, 4-max +6, 6-max +33 ± 29 bb/100 on 800–1250 deals). A tight double of the owner's play (opens ~18%, bluffs ~17%) wins against both versions only slightly: −36 (3-max) and −49 (6-max) bb/100 for the double against the current bot; heads-up about 0.

### Poker table, round 2 (owner reports, 2026-10-05)

1. HIGH `fixed (games-elo-unification PR)` — people who left the app stayed seated: the backgrounded WebView kept polling the table, which counted as presence (`PlayerPoker.tsx` poll, `touchPokerSeat`).
2. MEDIUM `fixed` — a person with 0 chips was never counted as away (no `sitting_out`) and had no «Отойти» button, so the AFK timer never ran for him (`removeIdlePokerSeats`, busted panel).
3. MEDIUM `fixed` — dealing animation: hole cards keyed by position and sorted high-first, so the second card rebuilt the first and both flew in again (`PlayerPoker.tsx`, now `pokerCards.ts`).
4. MEDIUM `fixed` — the wait before a bot's preflop action: fixed 1.2 s think time plus a 0.9 s poll while it was not the person's turn (`tickPokerLobby`, poll interval).
5. LOW `fixed` — a folded player's own cards did not fade although his seat did.
6. NOTE — kicking a person is limited to the club owner (new server route, checked on the server).

### Elo history vs canonical rebuild (owner bug report, 2026-10-05)

1. HIGH `fixed (elo-guest-seat PR)` — profile pages fail with «Canonical Elo cannot rate club game N: linked player is missing»: `playerEloHistoryService.ts` threw on a guest seat (no `player_id`), `eloRatingService.ts` skips the game. Two copies of the same rule had diverged. Owner decision: a game with a guest seat is rated from the remaining players instead of being skipped; both copies now do that (a full unification into one module is not done).

### Database transactions (owner's known-bug list, 2026-10-05)

1. MEDIUM `fixed (db-transaction-queue PR)` — `db.transaction` was `BEGIN … await … COMMIT` on one shared connection: any two overlapping transactions (weekly evening automation at startup, concurrent requests) failed with «cannot start a transaction within a transaction» (`src/db/index.ts`).
2. MEDIUM `fixed (db-transaction-queue PR)` — three routes opened a transaction by hand with `db.exec('BEGIN TRANSACTION')` and could collide with it (`eveningsRoutesBase.ts`: add participants, bulk update, close evening).
3. LOW `open` — statements of other requests that run while a transaction is open still share the connection (a rollback also undoes them); needs a connection-level queue for all statements, not done.

### Player profiles audit (owner request, 2026-10-05)

Scope: the player-facing profile — `CanonicalPremiumPlayerProfile.tsx` (tabs Обзор/Игры/Роли/Elo/Награды/История клуба/Связи), its overlay in `PlayerCabinetShell.tsx`, `PlayerCareerProfile.tsx` (+ `PlayerGameNumbers.tsx`), settings/privacy (`PlayerProfileSettings.tsx`, `PlayerProfilePrivacySettings.tsx`), `premiumPlayerProfileService.ts` and the profile routes. Read from the code and the API shapes; no live data was opened.

1. HIGH `fixed (profiles-audit PR)` — another player's profile opens as a full-screen overlay over the cabinet with only a «←»; the bottom menu is covered, so there is no way back to the usual sections (`PlayerCabinetShell.tsx`, overlay).
2. HIGH `fixed (profiles-audit PR)` — «Игры» tab prints raw codes (`citizen`/`mafia`, `red`/`black`) and shows neither the game title, number, Elo change nor a link to the game, although the API returns them (`CanonicalPremiumPlayerProfile.tsx`).
3. MEDIUM `fixed (profiles-audit PR)` — «Elo» tab: raw role code, fractional Elo («1003.45», «+12.35») next to an integer Elo in the header, a duplicated «До игры → после» line, no link to the game.
4. MEDIUM `fixed (profiles-audit PR)` — when the player hid his statistics, the overview shows «—» tiles with no explanation and the «Elo»/«Роли» tabs print «Истории Elo пока нет» (a lie: it is hidden, not absent; the 403 text is never shown there).
5. MEDIUM `fixed (profiles-audit PR)` — `/api/player/career/:playerId` ignored the «Игровая статистика» privacy switch (anyone could read another player's games, win rates and roles): the route is removed with the career screen; the profile endpoints already check the switch.
6. MEDIUM `fixed (profiles-audit PR)` — «По 21 играм» (wrong case after a number) and the clumsy hint «за чёрных: 5 из 7 (красным)» in «Игра в цифрах» (`PlayerGameNumbers.tsx`).
7. MEDIUM `fixed (profiles-audit PR)` — privacy settings: a failed load leaves «Загрузка приватности…» for ever; a failed save leaves the switch flipped while the message says it failed (`PlayerProfilePrivacySettings.tsx`).
8. LOW `fixed (profiles-audit PR)` — career screen shows an empty hole when the avatar is missing/broken (the other profile shows an initial); overview «Последние игры» are not clickable.
9. LOW `fixed (profiles-audit PR)` — wording: tab «История клуба» vs section «История в клубе»; «Текущий период» vs «Текущий сезон» (season = rating period since 2026-10-04).
10. LOW `fixed (birth-year PR)` — the birth year 2000 could not be saved (the date picker's default year 2000 meant «no year», `PlayerProfileSettings.tsx`): a fresh pick now keeps 2000; only a date that was already stored without a year keeps showing the placeholder 2000 as «no year».
11. HIGH `fixed (profiles-audit PR; owner: «привести к единому виду»)` — the same statistics (games, wins, win rate, roles, red/black, awards) were shown in three places from different sources: «Игры → Карьера», «Игры → Статистика», «Профиль»; they could disagree. One profile now (PROJECT_STATE 89). «Моя аналитика» repeated the win rate and best role and sat under the overview; moved to «Связи» without the duplicates.
12. MEDIUM `fixed (games-elo-unification PR)` — `PlayerHistoryStatsView.tsx` held unreachable branches (home, club, payments, rating, profile, stats) including a third profile rendition, and «Игры → История → Мои игры» repeated the profile's «Игры» tab; the personal Elo history was shown three times (`PlayerEloJourney`, the profile's Elo tab, the chart in «Моя аналитика»). One place each now (PROJECT_STATE 93); a game got its own address, so the profile's links work.
13. NOTE `wontfix` — «Replay» is the product's name for the game replay in several screens (career, live centre), kept as is.

### Open — parity gaps between modes (not fixed)

- Club evening winners get no trophies (tournament winners do): `fixed (evening-awards PR)` — «Игрок вечера» (by wins) and «MVP вечера» (by vote) are trophies in the showcase.
- Tournament results are not posted to channels: `fixed (tournament-results PR)` — published results go to the rating group and the entry channel.
- Exit-reason and role wording duplicated in several places.
- Two protocol editors (tournament vs club) differ in behaviour.
- Tournament save path has no backoff/rebase like the club one.
- Test sandbox isolation not re-verified end to end.

### Proposals not built (need an owner «да»)

- Game statistics across games (chronology step 3).
- Inline-button Telegram poll for the evening vote.
- Replacing a player of an evening tournament after game 1 (owner: skip for now).
- Timer after restore: stays running (owner did not decide otherwise).

### Analytics audit (owner request, 2026-10-05: «аудит аналитики … по науке, понятно человеку»)

Scope: CRM «Ещё → Отчёты → Аналитика» (`AnalyticsCRM.tsx` and its panels), `GET /api/analytics` (`analyticsRoutes.ts`), `/api/analytics/game-stats`, `/api/analytics/staff`, `uiUsageService`, `presenceService`. Fix plan: `docs/ANALYTICS_REDESIGN_SPEC.md` (implemented in PR #708; final CI and screenshot verification required before merge).

Definitions and numbers
1. HIGH `fixed` ([PR #708](https://github.com/fainta7x/Newmafiabot/pull/708)) — no canonical definition of «member», «visit», «inactive», «retention», «revenue» in `BUSINESS_RULES.md`; the code holds several. «Игроков в базе» is `SELECT p.* FROM players` with no filter (guests and archived included) while the CRM uses `MEMBER_SQL` (`organizerAgendaService.ts`).
2. HIGH `fixed` ([PR #708](https://github.com/fainta7x/Newmafiabot/pull/708)) — three different «visit» rules: attended + evening status `completed|active` (`analyticsRoutes.ts:146`), attended OR seated in a game slot (`playerVisitsService`), attended only (registration totals, `completed` only).
3. HIGH `fixed` ([PR #708](https://github.com/fainta7x/Newmafiabot/pull/708)) — retention 30 d counts cohorts whose 30 days have not passed yet (right-censored), so recent periods look worse than they are; it is also computed by an N+1 loop (one query per new player).
4. MEDIUM `fixed` ([PR #708](https://github.com/fainta7x/Newmafiabot/pull/708)) — inactivity cut-offs differ: 30/60/90 here (cumulative, so a 90-day player is counted in all three), 14/28/30/60 elsewhere (`readyForClubReview`, CRM lists).
5. MEDIUM `fixed` ([PR #708](https://github.com/fainta7x/Newmafiabot/pull/708)) — registrations include declined answers; no-show and cancellation rates divide by all registrations (not by those who could attend); only `completed` evenings count.
6. HIGH `fixed` ([PR #708](https://github.com/fainta7x/Newmafiabot/pull/708)) — money mixes bases: ledger rows filtered by `created_at`, evenings by `starts_at`; «открытый долг» = debt created − debt paid inside the period (not the unpaid balance of the overview). Payments of an old evening made now count into «now».
7. MEDIUM `fixed` ([PR #708](https://github.com/fainta7x/Newmafiabot/pull/708)) — «Воронка личной рассылки»: every percent uses `delivered` as the denominator, including «пришли»; read as a funnel step-to-step it misleads.
8. MEDIUM `fixed` ([PR #708](https://github.com/fainta7x/Newmafiabot/pull/708)) — «Откуда приходят игроки» prints raw `players.source` keys, counts all players, ignores the period.
9. MEDIUM `fixed` ([PR #708](https://github.com/fainta7x/Newmafiabot/pull/708)) — «Путь игрока», «Откуда приходят», «Игроков в базе» ignore the selected period, while the neighbours obey it; nothing tells the user.
10. LOW `fixed` ([PR #708](https://github.com/fainta7x/Newmafiabot/pull/708)) — two rounding rules: `pct()` integer vs `winRatePercent` one decimal; three period systems (`7d/30d/90d/all` hard-coded in three components and three server routes; staff has its own `month/prev_month/season/all`; usage turns «all» into 180 days).
11. LOW `fixed` ([PR #708](https://github.com/fainta7x/Newmafiabot/pull/708)) — API returns unused `refunds`, `expenses`, `avgAttendance`; no metric for evening fill rate or for new players per period.

Performance and robustness
12. HIGH `fixed` ([PR #708](https://github.com/fainta7x/Newmafiabot/pull/708)) — a failed `/api/analytics` request is only `console.error`-ed: the page stays on the spinner for ever, no retry. `GameStatsPanel` hides itself on error silently.
13. MEDIUM `fixed` ([PR #708](https://github.com/fainta7x/Newmafiabot/pull/708)) — every period click remounts the whole page and refetches all panels (whole-page spinner).
14. MEDIUM `fixed` ([PR #708](https://github.com/fainta7x/Newmafiabot/pull/708)) — `GET /api/analytics` loads all players with three correlated subqueries each, plus the cohort N+1 loop; `getUiUsageSummary` loads up to 400000 rows into JS and runs a DELETE on every call; `loadStatGames` reads all games when «Всё».
15. LOW `fixed` ([PR #708](https://github.com/fainta7x/Newmafiabot/pull/708)) — dead prop `onOpenThemeModal`; `OnlineNowPanel` polls every 15 s even when the section is off screen.

Mobile and clarity (DESIGN_SYSTEM: CRM is a work tool, analytics is secondary, targets 44 px)
16. HIGH `fixed` ([PR #708](https://github.com/fainta7x/Newmafiabot/pull/708)) — one endless page of about ten cards (≈2000 px+), no grouping by question, no tabs/collapse, no summary at the top.
17. MEDIUM `fixed` ([PR #708](https://github.com/fainta7x/Newmafiabot/pull/708)) — period buttons are 36 px (`min-h-9`) and scroll away; labels 10–11 px; the funnel is a 7-column grid that does not fit 390 px; cards use 16 px radius vs the documented 24–28 px.
18. MEDIUM `fixed` ([PR #708](https://github.com/fainta7x/Newmafiabot/pull/708)) — jargon without explanation: «нулевой круг», «ПУ/ЛХ», «зах.», «cohort retention»; the same usage data in three views (online now, usage, staff) with different period and online rules.
19. LOW `fixed` ([PR #708](https://github.com/fainta7x/Newmafiabot/pull/708)) — `FEATURE_MAP.md` analytics line is stale («no player ids»); no tests for the main `/api/analytics` numbers, for the components or for the period handling.
20. MEDIUM `fixed` ([PR #708](https://github.com/fainta7x/Newmafiabot/pull/708)) — the first analytics implementation treated every final `declined` row with `registered_at` as a cancellation, although Telegram, VK and the player cabinet fill `registered_at` even for an initial refusal. Cancellation now requires a persisted earlier positive answer (`confirmed_at`), which is no longer erased by a later answer.
21. MEDIUM `fixed` ([PR #708](https://github.com/fainta7x/Newmafiabot/pull/708)) — club game period filtering used the draft `games.created_at`; a recovered/completed protocol could therefore land in the wrong period. Filtering, ordering and the returned date now use `protocol.completed_at`, with the old fields only as a compatibility fallback for legacy protocols.
22. LOW `fixed` — the first mobile evidence captured the help dialog during its 150 ms opening transition, making a correct solid dialog look translucent and unreadable in the artifact. The preview now waits for full opacity before taking the 360/390 px screenshots.

### Poker table flips between screens (owner bug report, 2026-10-05)
1. HIGH `fixed ([PR #709](https://github.com/fainta7x/Newmafiabot/pull/709))` — `PlayerPoker.tsx` asked for the table every 250 ms without waiting for the previous answer and applied every answer as it came: on a slow connection an older answer could arrive after a newer one and put the table back (cards, bets, seats of an earlier moment), then the next answer moved it forward again. Reproduced in `PlayerPokerTable.test.tsx` (slow first answer overwrote the newer one). Now each request has a number, an older answer is dropped, one poll runs at a time (a request hung for over 1.5 s stops holding the line), and the action/join/leave/rebuy answers go through the same check.
2. HIGH `fixed ([PR #709](https://github.com/fainta7x/Newmafiabot/pull/709))` — the red «Нет связи с сервером…» banner sat in the page flow above the table; on a weak connection it appeared and vanished with every failed/successful poll, pushing the whole table down and up (the table is measured from the frame's top, so it also rescaled): the «adaptive trembles / whole layout changes» the owner saw. It is now a floating notice that never moves the table.
3. HIGH `fixed ([PR #709](https://github.com/fainta7x/Newmafiabot/pull/709))` — the table could shrink for good to a narrow canvas with black side bars and an empty strip above the action panel (owner's screenshot): `PlayerPoker.tsx` sized the table from the tallest bottom panel ever seen (`bottomPanelMax`, never reduced), so one tall moment (pre-moves, the «busted» row, a longer finished-hand panel) squeezed it until the screen was reopened. The panel now has one fixed minimum height in every state and the table is sized by the panel as it is now.
4. LOW `fixed ([PR #709](https://github.com/fainta7x/Newmafiabot/pull/709))` — the finished-hand panel showed «Следующая раздача через N с» twice (a second line added in the previous PR next to the existing one); the duplicate is removed.

### Evening route audit (owner request, 2026-10-06: «что лишнее в движении вечера»)
Scope: `eveningRouteService.ts` (stages and steps of «Маршрут вечера»), `EveningRouteView.tsx`.
1. MEDIUM `fixed` — the stage «После вечера» had a single step, «Следующий вечер создан» with a button «Создать следующую пятницу»; a new evening has its own announcement, so the step and then the empty stage were removed (a closed evening ends at «Закрытие»).
2. LOW `fixed` — the step «Вечер создан» in «Подготовка» was always done and told nothing; removed.
3. MEDIUM `fixed` — «Закрытие» repeated what «Вечер идёт» already shows («Все игры завершены» = «Игры вечера», «Явка сверена» = «Отметить пришедших»); both removed, and what still blocks closing is named in the step «Закрыть вечер» («Сначала: нет отметки у N игроков, не завершено игр: N»).
4. LOW `open` — «Анонс в Telegram и ВК» and «Личные приглашения» are two steps of one preparation; kept because they are separate actions with separate results.
5. LOW `open` — the stage «Закрытие» and the CRM tab «Закрытие» are two views of the same checklist; folding the tab into «Состав»/«Оплата» is proposed to the owner (needs his «да»).

### Two tournament screens (owner, 2026-10-06)
1. HIGH `fixed` — tournaments made the old way had a different, stacked screen and no registrations, while new ones had the four-step screen: two interfaces inside one product. Old tournaments were moved to the new format by a one-time, snapshot-protected migration and the old screen was removed (`TournamentLifecycleOverview` deleted; the tournament screen waits for its data with a retry instead of falling back to the old layout).
2. NOTE — judge «Чагин» and organizer «Богданчик» were forced in every tournament of Bogdan on the owner's request (same migration file, own marker, revert function).

### Desktop CRM and player profile audit (2026-10-06)
Scope: organizer work surfaces and canonical player profile; preserve phone layout and existing functions.
1. FIXED — `OrganizerCRM.tsx`, `OrganizerCommandCenter.tsx`: nested 768 px caps leave desktop work screens unnecessarily narrow.
2. FIXED — `OrganizerCRM.tsx`, `telegram-viewport.css`: CRM bottom-navigation padding stops at 640 px although the navigation stays visible until 768 px, allowing covered actions on tablets.
3. FIXED — `CanonicalPremiumPlayerProfile.tsx`: full-width identity/navigation and a narrow single-column games/roles body are disconnected on desktop.
4. FIXED — `MoreCRM.tsx`: work and report groups remain one long narrow stack on desktop; the secondary title repeats the shell heading.
5. KEEP — player-card histories, advanced filters, profile details and rare admin tools already use disclosure controls in current main; preserve these rather than duplicating them.
6. FIXED — `PlayersActivityCRM.tsx`: empty-state instructions point to the removed «Игроки → Роли» route instead of the current player card.
7. FIXED — `player-profile-harness.tsx`: the old preview completeness response has no canonical `completeness` object and only one game/role, so it cannot demonstrate a populated desktop layout.

8. FIXED — organizer preview omitted the viewport stylesheet used by the application; import it so tablet navigation clearance and duplicate-heading checks exercise the real shell. Grid children reset both block margins to avoid inherited vertical-stack gaps.

### Weekly development snapshot audit (2026-10-07)
Scope: paused snapshot branch and production read-only export.
1. FIXED — anonymizedSnapshotService.ts WIP keeps real nicknames/avatars and uses a denylist that misses JSON/free text and new columns.
2. FIXED — export must preserve relational links, reject unreviewed fields, remove freed-page data and never change the source.
3. FIXED — no weekly downloader/workflow, bounded retention or verified metadata exists.
4. FIXED — Codex review #721: tournament_game_best_moves.source omits first_killed/zero_round_voted, rejecting valid tournament exports.
5. FIXED — Codex review #721: slots_json scrubber drops canonical slot_num, breaking reconstructed club seating.

## Desktop workspace follow-up — 2026-10-07
Scope: CRM and canonical player profile after owner reported inconsistent desktop layout.
- FIXED — `src/styles/desktop-workspaces.css`: auto-placement pairs unrelated variable-height sections; expanded profile statistics and More administration leave large empty row space.
- FIXED — `src/components/player/PlayerEloJourney.tsx`: embedded Elo retains 430px width, standalone viewport height and extra bottom padding inside the profile.
- FIXED — `src/components/player/CanonicalPremiumPlayerProfile.tsx`: recent games protocol links and game filters lack consistent action target sizes.
- FIXED — `e2e/tests/desktop-workspaces.spec.mjs`: checks overflow but not expanded sections or action geometry; CRM agenda and player insights fixture endpoints missing.

Desktop verification: PR #722 initial code head `c99eb3a`; CI/CodeQL/Gitleaks/UI preview passed. Fresh revision `61db0d8` verified as merge of that head and `4af308c2`; inspected all profile tabs, expanded statistics, More administration, CRM players/roster/analytics at 1024, 1366×768 and 1440, plus phone regression. Follow-up coverage includes desktop player card/access editor save visibility. Runtime UI not verified.

## CRM home and remaining player cabinet desktop audit — 2026-10-07
Scope: owner reported irregular CRM home cards and absent desktop layouts outside Progress.
- FIXED — `OrganizerCommandCenter.tsx`, `desktop-workspaces.css`: implicit grid combines status, week planning and task queue with unrelated sizes; needs explicit work/planning hierarchy.
- FIXED — `PlayerHomeDashboard.tsx`: 430px cap leaves desktop empty; next evening and secondary information have the same visual priority.
- FIXED — `PlayerEveningsHub.tsx`, `PlayerEventsCalendar.tsx`, `PlayerEveningSummaries.tsx`, `PlayerHistoryStatsView.tsx`: independently capped nested surfaces misalign headings, tabs and content.
- FIXED — `PlayerCommunityHub.tsx`, `PlayerRatingHub.tsx`, directory/connections: narrow container and lists remain phone-only; nested rating adds a separate full-height page.
- FIXED — wallet/settings: compact forms are sensible, but section headers and page spacing differ from the rest of the cabinet.
- FIXED — cabinet preview: incomplete empty route mocks cannot validate populated desktop surfaces, modal actions and section navigation.

Preview verification: initial head `c00f02f` passed CI/CodeQL/Gitleaks. Artifact checksums and revision `34b6b5b` confirmed that exact head plus current base; CRM upcoming/active inspected at 390 and 1440px. Player screenshots were blocked by an incomplete novice fixture (missing `applications` and `can_self_register`); corrected the mock to the real API shape and added music-slot coverage. Fresh complete cabinet screenshots remain a merge gate.

- FIXED — `PlayerWalletHub.tsx`, `PlayerPayments.tsx`: embedded payment screen repeats the wallet debt headline and hides its header/history through brittle DOM-position CSS; use an explicit embedded mode, retaining paid totals, credits and payment actions.
- FIXED — `cabinet-desktop-layout.spec.mjs`: viewport screenshots do not show the bottom of long settings forms; inspect controls after scrolling and neutralize CSS transitions/hover in capture.

Complete cabinet review: head `cc0cf5d` passed all four workflows and 61 browser tests. Verified byte-safe artifacts and synthetic revision `4706824f` parents; inspected all 22 cabinet/CRM captures at 390, 1024, 1366×768 and 1440px. Wallet duplication corrected with explicit full/current/history views; paid totals, credits and free-evening action covered by three unit tests. Final coverage additionally captures home/footer and settings save/music controls after scrolling; final exact-head checks remain mandatory before merge. Runtime UI unverified.

- FIXED — Codex P1 on PR #726: desktop `player-workspace-page` bottom padding of 32px is smaller than fixed navigation; preserve navigation height plus safe inset and a 24px gap. Added a bottom-action bounds assertion after scrolling.

### Club connections audit — 2026-10-07
- FIXED — `PlayerClubConnections.tsx`: club ranking renders only three pairs per side without sample explanation or alternatives, making the section sparse.
- FIXED — `playerPulseRoutes.ts`: pairs with one game vanish entirely; preserve the existing ranked pool (minimum two) and expose first encounters separately.
- FIXED — `PlayerClubConnections.tsx`: personal rival wins have ambiguous wording; explain they are the viewer’s team wins, not individual duels.
- FIXED — relationships API/UI: no last-event meetings, although completed snapshots already hold canonical event identities.

Focused verification: six service/UI tests, typecheck, lint, production and isolated-preview builds; initial exact-head CI/CodeQL/Gitleaks/UI preview passed, fresh club modes/recent/personal screenshots inspected at 390/1024/1366/1440. Final evidence explicitly scrolls the first-game card and checks last personal action above the footer; exact final-head CI remains the release gate.

- FIXED — Codex PR #728 P1, `playerPulseRoutes.ts` / `clubRelationshipsService.ts`: new club lists bypass «Игровые связи» visibility; filter hidden participants before aggregating every relationships list, allowing the viewer to see his own connections. This endpoint keeps its existing player-only authentication.

Privacy verification: eight tests across service/UI and real authenticated in-memory API; hidden pairs are excluded from best/most-played/first-game/recent/personal lists, own hidden viewer retains access, changed visibility takes effect on the next request.

- FIXED — evidence capture only, `cabinet-desktop-layout.spec.mjs`: native `scrollIntoViewIfNeeded` considers the fixed footer-covered first-game button visible. Center the target explicitly and assert its bounds between header/footer before capturing; product layout is unchanged.

### Club connection stories audit — 2026-10-07
- FIXED — `clubRelationshipsService.ts` / `PlayerClubConnections.tsx`: existing expansion is mostly more rows in the same pair ranking, rather than distinct Mafia-specific club relationship patterns requested by the owner.
- FIXED — new aggregation: complete black trios must be validated against the original roster before privacy filtering; otherwise hidden/invalid seats could invent a trio.
- FIXED — new summaries: results must not imply causation, friendships, sheriff protection or personal duels; count distinct source/event identities and display sample sizes.

- FIXED — fresh preview, `ClubConnectionStories.tsx`: three team categories in a two-column desktop grid leave an unnecessary half-row gap; use three columns for teams and two for opposition, preserving single-column mobile order.

- FIXED — Codex PR #729 P2, `clubGameAnalyticsService.ts`: sanitization drops profile-less guests/unknown roles before new stories can reject incomplete rosters; preserve an unresolved-seat marker for the new aggregation, retaining existing analytics behavior.

Verification: raw club/tournament omission-marker regression, sanitized-snapshot exclusion and real authenticated API guest/privacy tests pass; existing pair analytics remains available for identified participants.

### Independent Dissonance poker audit — 2026-10-07
Scope: current bot/learning/equity, hand export, chip sources and simulation validity; no production mutation.
- FIXED (#734), HIGH — `pokerBot.ts:rankKey`: variable-length hand ranks are folded into base-15 numbers without padding; a high card can sort above a set, corrupting the board-strength range filter. Reproduced on Qc 7d 2s: AT high card key 751607, 77 set key 11882, while canonical comparison correctly favors the set.
- FIXED (#734), MEDIUM — `pokerBot.ts:observePokerHand` / `preflopRaises` / `opponentRanges`: postflop all-in calls count as aggression; current-hand helper classifies every positive preflop all-in as a raise even though learned counters distinguish calls. Requires legal-hand reproduction and bounded correction, not arbitrary range tuning.
- DESIGN OBSERVATION — `pokerLobbyService.ts:addPokerBot`: each newly added bot injects 1000 play chips, with no global bankroll cap; a large accumulated human bankroll is possible without a payout/duplication bug.
- LIMITATION — `pokerBotBenchmark.ts` and `pokerBotCompare.ts` call the engine/bot directly without `observePokerHand`; their committed entry points do not test persistent opponent learning.
- DATA LIMITATION — `/__developer-read/poker/hands` keeps showdown cards only, caps at 300, truncates bot identities and omits bot decision reasons/equity; it cannot fully replay folded-card decisions. Fresh authenticated export unavailable in this session.

### Poker audit follow-up — 2026-10-07
Owner authorized bot improvements and access verification. Rank key padding and shared incremental-commitment all-in classification implemented; pending regression verification. Sampling fallback remains open and requires separate measured redesign. Existing credentials are documented in Claude/Amvera but absent here; no access bypass or secret committed.

Verification: rank ordering and short all-in call defects fixed with legal-action regressions; five audit regression tests including seeded learning benchmark. Reconciled #732 without reverting training/token behavior. Narrow-range sampler remains OPEN; fresh history unavailable due shared-file synchronization failure despite existing Amvera credential.

### Poker range-sampling follow-up — 2026-10-07
Scope: fresh protected history read and independent stress measurements after #734. OPEN: estimateEquity accepts out-of-range hands after retry exhaustion; measure contamination and narrow-range handling before modifying. Production reads only, no balance/data changes.

FIXED, pending CI — range sampling now enumerates legal support and removes retry-budget contamination; exact board reference replaces the noisy 70-hand sample. Impossible inferred supports use the closest legal combination set and remain heuristic. Benchmark streams isolate cards and each actor; learned baseline policies have their own observer/memory. Protected /poker/results request reaches the app but returns HTTP 502; no fresh player data obtained.

### 2026-10-07 — Dissonance protected-history retry
- Scope: retry the real-player poker export against current production; no bot changes.
- OPEN / runtime access: protected poker results returns HTTP 502; direct hands export for Диссонанс (limit 300) times out after 25 seconds. No fresh hands received. Current runtime observations and follow-up are owned by PROJECT_STATE.md.
- No new player-specific bot defect established. Existing code findings and synthetic evidence remain in POKER_DISSONANCE_AUDIT.md and POKER_BOT_SAMPLING_FOLLOWUP.md.

### 2026-10-07 evening — Dissonance live export recovered
- Scope: retry and analyze 250 real hands; all three protected poker reads succeed. Evidence: POKER_DISSONANCE_LIVE_AUDIT.md.
- OPEN: pokerBot.ts / preflopDecision all-in branch uses full hand.pot, counting contributions beyond the caller’s eligible layer. Deterministic 7s2d probe changes fold to call solely when the shover stack grows 1,000 → 24,220.
- OPEN: same branch evaluates [shoveRange] only and ignores other callers’ main-pot equity. Safe repair needs contribution layers and multiway equity, not arbitrary range tightening.
- Historical net +21,240 over 250 hands; not evidence of cheating or the current token wallet. No code/deploy/data changes in this diagnostic pass.

### 2026-10-08 — owner-authorized eligible-pot bot repair
- FIXED in implementation: pokerBot.ts call thresholds/EV no longer include inaccessible opposing excess. Main and side pots use their own eligible opponent subsets, including preflop all-in callers.
- FIXED in implementation: cheap-call fallback cannot override a rejected showdown call; postflop bet EV caps callers’ contributions and never gives all-in seats fold equity.
- Verified existing adaptation rather than adding player-specific rules: pure-bluff check against a learned caller; retained bluff against a learned folder; legitimate calls against frequent shoves preserved.
- Focused tests include actual engine side-pot payout agreement. Exact-head CI remains the merge gate; runtime and a new post-fix hand sample remain unverified.

### 2026-10-08 — Тренажёр судьи: нулевая ночь и нулевой круг

Scope: desktop screenshot, mission coach, first voting, seat marking, backward navigation.

- FIXED in this workstream — JudgeConductCoach.tsx / EveningLiveGameModal.tsx: prompts allowed incorrect real-engine actions and only warned afterwards; strict per-snapshot input gate now limits selectable controls in zero-night/zero-day, and highlights permitted targets. Non-training games are unchanged.
- FIXED in this workstream — liveGameEveningBugfixes.css: fixed-size voting HUD hid the Next/Finalize buttons under overflow:hidden; HUD now scrolls internally to keep actions reachable.
- FIXED in this workstream — CenterPanel.tsx / LiveGameEngine.tsx: collecting stage did not return to pre-voting speeches; restore complete prior day-speech snapshot.
- FIXED in this workstream — SeatCard.tsx / liveGameEveningBugfixes.css: nominated candidates were represented by a visually distracting nomination quick action; a strong full-card outline now signals candidates.

### 2026-10-08 — Navigation audit: player cabinet → Mafia School

Scope: player bottom navigation, Progress profile tabs, School catalog, Telegram Back, public/deep links, phone journey.

- HIGH fixed in this workstream: learning was hidden among eight horizontal profile tabs. Owner rejected an additional main-menu tab. Instead group the eight profile views into five visible destinations inside «Прогресс»: Обзор / Карьера (Игры, Роли, Elo) / Награды (Достижения, История) / Связи / Обучение. Preserve profile deep links.
- HIGH fixed in this workstream: App.tsx and PublicGuide.tsx both registered Telegram WebApp Back for /guide; competing handlers could replace the app route instead of navigating within lessons. Give /guide exclusive ownership of its back handler, including a definite exit on School home.
- MEDIUM fixed in this workstream: guide home had no clear return and nested pages only showed an arrow. Offer «Вернуться в Прогресс» on learning home, a labelled «Прогресс» exit on deep pages and the existing four-tab bottom bar inside guide opened from Progress; public guide stays accessible without sign-in.
- MEDIUM fixed in this workstream: duplicative learning listings obscured a clear path. Keep the learning entry in «Прогресс» as a categorized hub (Уроки, Тренажёры, Правила) linking into one canonical guide catalog, with a featured judge trainer.
- LOW fixed in this workstream: App.navigatePath compared pathname against paths containing a query, causing incorrect route detection. Normalize location handling; preserve guide source across internal lesson navigation and retain browser back/forward.
- HIGH fixed in this workstream: selecting the currently active nested profile tab cleared previously fetched data but did not re-run its query, leaving an empty game list. `CanonicalPremiumPlayerProfile.switchTab` now no-ops on an already active tab unless closing settings; covered by unit and mobile browser flows.
- Owner correction during review: keep «Обучение» inside «Прогресс», not a new top-level «Школа». Status: pending exact-head CI and human mobile review; public learning access must remain usable without a linked player.

### 2026-10-08 — Judge training: repeated night checks and copied death protocols

- **Fixed in this workstream:** `src/lib/judgeConductTraining.ts` — `checkTarget` always points Don at the live Sheriff and Sheriff at the first black player, so subsequent nights repeat the same targets instead of teaching varied checks.
- **Fixed in this workstream:** `src/lib/judgeTrainingProtocols.ts`, `src/components/crm/EveningDeathProtocolOverlay.tsx` — every killed player receives the identical hard-coded five-mark color protocol; instructions, interaction guard, and confirmation all assume those marks, ignoring player/night context.
- **Scope:** training-only scripts and training-only death-protocol overlay. Keep engine, real referee controls and production protocol unchanged. Acceptance: distinct eligible night checks; reproducible 1–4 color marks with optional Sheriff for each killed player/night; no target/task drift on refresh; focused unit and browser coverage.

### 2026-10-08 — Guided judge training desktop visibility audit

- **Reported:** PC version was visually unusable despite working mobile flow. The coach was limited to a ~152px fixed badge with a full-screen task modal; desktop table had no dedicated lesson space. Short 1366×768 viewport could crop bottom events.
- **Fix in PR #751:** dedicated right rail at ≥1280px, reserved training-only table region, height constraint for short laptops, no real game layout changes. Added full desktop Playwright journey/screenshots at 1366×768 and 1600×900; preserve prior mobile coverage.
- **Verification:** CI/mobile/desktop result belongs to exact PR head; Amvera rollout separate.

### 2026-10-08 — Trophy cabinet assets and event navigation

- **Observed:** all tournament wins reused one silver SVG cup; award details had only descriptive text and no path back to the source tournament/evening (`TrophyCabinet.tsx`). A first- and second-edition Bogdan trophy looked identical.
- **Fixed in this workstream:** `TournamentCupAsset.tsx` draws different sculpted cup families with deterministic tournament-based engraving. `trophyCabinetModel.ts` exposes real `tournament_id` or a recognized automatic club-evening `source_key`; no event route is invented from a free-form name.
- **Fixed in this workstream:** `TrophyCabinet.tsx` offers «Открыть турнир и итоги» using the existing `PlayerTournamentView`, returning to the selected exhibit; automatic evening trophies link to their canonical evening route. Awards without a verifiable relation show no button.
- **Acceptance:** 390px fixture shows different Bogdan edition silhouettes, click through verified tourney results and Back to the same cabinet; Jest/Vitest validates distinct IDs, honest links, unowned trophies and safe unknown sources. Do not mutate production database or award assignments. Exact-head CI + visual check before merging.
