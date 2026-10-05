# Audit log

Owner of: findings of code/behaviour audits (what was found, what is fixed, what is still open). Current queue and deploy state stay in `docs/PROJECT_STATE.md`; this file is the evidence behind the queue, so an audit never lives only in chat.

Rules:

- Every audit (own review, subagent sweep, parity check) is written here **in the same session it is done**, before fixing starts: date, scope, each finding with file and a one-line defect.
- A finding is marked `open`, `fixed (PR/commit)` or `wontfix (reason)`. Do not delete fixed entries; change their status.
- A finding that only exists in a summary or chat does not count as recorded.

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
9. MEDIUM-LOW `fixed (engine-audit PR + ci-points PR): best-move/first-killed consistency enforced on completed club saves; Ci kept only for the first-killed red player, capped at 0.4, never negative`ci_points` still open` — club server does not enforce tournament invariants: free `ci_points`, no first-killed/zero-round/best-move consistency (`clubGameProtocolService.ts:119,143-145`).
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

### Open — parity gaps between modes (not fixed)

- Club evening winners get no trophies (tournament winners do).
- Tournament results are not posted to channels.
- Exit-reason and role wording duplicated in several places.
- Two protocol editors (tournament vs club) differ in behaviour.
- Tournament save path has no backoff/rebase like the club one.
- Test sandbox isolation not re-verified end to end.

### Proposals not built (need an owner «да»)

- Game statistics across games (chronology step 3).
- Inline-button Telegram poll for the evening vote.
- Replacing a player of an evening tournament after game 1 (owner: skip for now).
- Timer after restore: stays running (owner did not decide otherwise).
