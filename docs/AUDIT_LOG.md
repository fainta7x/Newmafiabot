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
9. MEDIUM-LOW `partly fixed (engine-audit PR): best-move/first-killed consistency enforced on completed club saves; free `ci_points` still open` — club server does not enforce tournament invariants: free `ci_points`, no first-killed/zero-round/best-move consistency (`clubGameProtocolService.ts:119,143-145`).
10. LOW `partly fixed (engine-audit PR): tournament bonus bounded to ±1; rounding symmetry still open` — judge/protocol bonus not bounded or rounded on the tournament server (`tournamentProtocolRoutes.ts:272-278`); club rounding is not sign-symmetric (`clubGameProtocolService.ts:35-39`).
11. LOW `fixed (engine-audit PR)` — undo does not restore `speechExtendedSlot` (`LiveGameEngine.tsx:140-143`).

Checked, no defect: win condition, raise/leave and 7-alive rules, best-move seat limits, foul/removal penalties and PPK winner, starter rotation.

### Open — notification reliability (not fixed)

- Channel outbox: failed Telegram/VK deliveries are not retried with backoff.
- Unroutable recipients are not re-routed when a channel becomes available.
- Re-registration after a refund is not handled consistently.
- Deadline jobs (registration/payment deadlines) have edge-case bugs.
- Promotion-from-waitlist notifications are not keyed idempotently.
- Stale messages: broadcast/seat messages can describe an outdated state.

### Open — parity gaps between modes (not fixed)

- Club evening winners get no trophies (tournament winners do).
- Telegram tournament post prints UTC instead of club time (`handlers/crm_tournament_publishing.py`).
- Tournament results are not posted to channels.
- Exit-reason and role wording duplicated in several places.
- Two protocol editors (tournament vs club) differ in behaviour.
- Tournament save path has no backoff/rebase like the club one.
- Test sandbox isolation not re-verified end to end.
- Broadcast: stale state and no check of tournament status `active`.

### Proposals not built (need an owner «да»)

- Game statistics across games (chronology step 3).
- Inline-button Telegram poll for the evening vote.
- Replacing a player of an evening tournament after game 1 (owner: skip for now).
- Timer after restore: stays running (owner did not decide otherwise).
