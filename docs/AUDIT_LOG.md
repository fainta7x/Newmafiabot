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

### Open — engine / protocol correctness

The detailed list «B1–B7» of the first pass was produced in a session whose context was compacted and its item text was **not saved**; it is lost. It is being re-audited from the code (see the entry below once written). Do not rely on the old labels.

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
