# Domain model — one concept, one definition

Owner request, 2026-10-22: every element of the app follows the same rules and scenarios. There are no duplicates, and each entity is defined once, correctly, together with its behaviour.

This file owns one thing: **which module is the single definition of each club concept**. Game rules themselves live in [`BUSINESS_RULES.md`](BUSINESS_RULES.md). Subsystem topology lives in [`ARCHITECTURE.md`](ARCHITECTURE.md). The findings and their progress live in [`AUDIT_LOG.md`](AUDIT_LOG.md) (2026-10-22 · Domain model audit).

## Rules for code

1. A concept is defined in its canonical module. Every other file imports it and never writes its own copy: no local `normalizeRole`, `normalizeWinner`, `roleLabel`, price constant, status label map, `formatMoney` or `plural`.
2. Translations (Russian words, legacy spellings, engine names) happen only at the boundary: input parsing or display. Stored values and code use the canonical keys.
3. The Python bot shares the database but cannot import TypeScript. Where the bot needs a rule, it reads the value from the API, or the duplicated constant is pinned by a test on both sides.
4. When two copies disagree, the owner decides which rule is right before they are merged ([`AGENTS.md`](../AGENTS.md) §3a). The decision is recorded in `BUSINESS_RULES.md`.

## Concept map

The status column says whether the concept is **one** (a single definition), **dup** (copies with the same rule, safe to merge) or **rule?** (copies with different rules, which need an owner decision).

| Concept | Canonical module (target) | Status |
|---|---|---|
| Role (citizen, sheriff, mafia, don) | `src/shared/gameRoles.ts` `normalizeGameRole` | **one** (2026-10-22). A colour is never a role; only `tournamentRoleValidation` keeps the documented colour compatibility for historic assignment input |
| Team and winner (red, black) | `src/shared/gameRoles.ts` `gameTeamOfRole`, `normalizeWinnerTeam` | **one** (2026-10-22); `clubGameTeams.ts` removed |
| Engine role/team state | canonical `GameRole` / `GameTeam`; `setupRoles.ts` parses inputs, `engineStateModel.ts` / `liveSessionStorage.ts` normalize legacy recovery | runtime/current and Undo snapshots use canonical keys; Russian labels remain UI/result/broadcast boundaries; invalid/conflicting recovery roles are not guessed (#1018 merged; runtime verification separate) |
| Exit type and removal reason | `src/shared/` game discipline constants | dup: the 5 exit values are listed 3 times, removal reasons 4 times |
| Fouls, technical fouls, PPK, Ci, bonus | one protocol rules module for club and tournament | rule?: the club and tournament validators differ |
| Best move (ЛХ) points | `server/services/bestMovePoints.ts` | **one** (2026-10-23): both sources count for Elo and tokens (`clubBestMovePointsForParticipant`) |
| Protocol (draft → completed) | one protocol pipeline | structural: club JSON in `games.protocol_text` versus the tournament tables |
| Game event log | `src/shared/liveGameEvents.ts` | producer captures native protocol evidence at each persisted transition (`liveEngineJournal.ts`), consumers copy it; legacy recovery keeps polling until an observed role correction adopts its evidence. `role_corrected` commands project complete CRM roles onto current/Undo state. Target remains full engine event replay and seat/identity correction events |
| A «game» for statistics | `server/services/completedClubGame.ts` (`isCompletedClubGame`, `isCompletedClubGamePayload`) (+ tournament twin) | **one reader** for the club kind + `completed` rule (2026-10-24: 11 copies moved; `completedClubGameSingleOwner.test.ts`). Still different on purpose or by decision: Elo, rating periods and token settlement also require `version 1` (Elo is audited separately), the public live list counts a game with a decided winner as finished (`publicLiveRoutes`), the betting reads SQL columns. Whether a **draft with a winner** may count anywhere needs the owner |
| Win rate | `src/shared/stats.ts` `winRatePercent` | **one** (2026-10-24): the last two inline copies (`PlayerGoMafiaLink`, `playerConnectionAnalyticsService`) use it |
| Achievements | `playerAchievementsService.ts` | structural: a second list lives in `playerProgressionRoutes.ts` |
| Evening status and transitions | `src/lib/eveningStatus.ts` (`isOpenEvening`, `openEveningSql`) | **one** for «open» (2026-10-24): 23 copies of «published or active and not settled» now ask the owner module; `openEveningSingleOwner.test.ts` pins the 12 files that look at the status only, each with its reason |
| Response (RSVP) | `src/lib/eveningDomain.ts`, `eveningResponse.ts` | dup: the rule is decided («Думаю» is not «Идут», owner 2026-10-23) and the Telegram roster follows it; Python still has 3 label sets |
| Attendance, guest | `src/lib/eveningDomain.ts` | dup: «guest» means three different things |
| Price, debt, paid | `eveningPriceSettingsService.ts`, `lib/eveningPrices.ts`, evening debt service | owner rule: updated tariffs apply immediately to all unclosed evenings; closed prices stay historical (#1022). Consolidating debt projections remains open |
| Capacity, «недобор» | `eveningShortfallService.ts` `eveningMinimumPlayers` (8 novice, 10 otherwise) | **one** in TypeScript (checked 2026-10-24: no other hard-coded thresholds in `src/server`, `src/lib`); the Python bot was fixed earlier (PROJECT_STATE) |
| Player display name | to create: one display-name helper | decided (owner 2026-10-23): club nickname first; standings, nominations, awards and the broadcast follow it |
| Outgoing message queue | to create: one retry policy | dup: 4 retry policies, 8 status sets |
| Publication of a post (per channel) | to create: one publish-once module | dup: 2 designs; one can double-post after a timeout |
| Post text (Telegram vs VK) | `postTemplateService.ts` for editable ordinary VK evening text; VK format-specific renderer and `handlers/telegram_evening_copy.py` for their own texts | owner rule (#1022): each post keeps its own wording; only prices come from shared settings. Do not unify Telegram/VK copy |
| UI: avatar, role badge, money, date, plural, loading | `ui/PlayerAvatar`, `ui/GameRole`, `lib/formatRubleAmount`, `lib/playerGameDate`, `lib/russianPlural`, `ui/AsyncState` | money and plural: **one** (2026-10-22, `formatRubles`, `russianPlural`); avatar, date, loading, status labels: dup |
