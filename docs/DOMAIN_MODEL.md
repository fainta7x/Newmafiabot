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
| Engine vocabulary («Мирный», «Красные») | the engine is translated once by `setupRoles.ts` / `roleToProtocol`, target: the engine uses canonical keys | engine names are read by `normalizeGameRole`; the two `roleToProtocol` copies are removed |
| Exit type and removal reason | `src/shared/` game discipline constants | dup: the 5 exit values are listed 3 times, removal reasons 4 times |
| Fouls, technical fouls, PPK, Ci, bonus | one protocol rules module for club and tournament | rule?: the club and tournament validators differ |
| Best move (ЛХ) points | `server/services/bestMovePoints.ts` | rule?: tokens count only the first-killed source, Elo counts any source |
| Protocol (draft → completed) | one protocol pipeline | structural: club JSON in `games.protocol_text` versus the tournament tables |
| Game event log | `src/shared/liveGameEvents.ts` | one; target: the engine and protocols are built from it |
| A «game» for statistics | `server/services/completedClubGame.ts` (+ tournament twin) | rule?: drafts and planned games are counted in some places |
| Win rate | `src/shared/stats.ts` | dup: three integer copies |
| Achievements | `playerAchievementsService.ts` | structural: a second list lives in `playerProgressionRoutes.ts` |
| Evening status and transitions | to create: `src/lib/eveningStatus.ts` | rule?: four meanings of an «open» evening |
| Response (RSVP) | `src/lib/eveningDomain.ts`, `eveningResponse.ts` | dup and rule?: «going» is counted 5 ways; Python has 3 label sets |
| Attendance, guest | `src/lib/eveningDomain.ts` | dup: «guest» means three different things |
| Price, debt, paid | to create: one pricing and debt module | rule?: defaults 0/100/400/500; debt over attended players vs registered |
| Capacity, «недобор» | to create: one threshold module | rule?: 8/10 vs 9/11 vs per-game 11/4; the bot hard-codes 10 |
| Player display name | to create: one display-name helper | rule?: the order of nickname vs tournament name differs |
| Outgoing message queue | to create: one retry policy | dup: 4 retry policies, 8 status sets |
| Publication of a post (per channel) | to create: one publish-once module | dup: 2 designs; one can double-post after a timeout |
| Post text (Telegram vs VK) | `postTemplateService.ts` | rule?: Telegram ignores the editable template, and the price lines differ |
| UI: avatar, role badge, money, date, plural, loading | `ui/PlayerAvatar`, `ui/GameRole`, `lib/formatRubleAmount`, `lib/playerGameDate`, `lib/russianPlural`, `ui/AsyncState` | money and plural: **one** (2026-10-22, `formatRubles`, `russianPlural`); avatar, date, loading, status labels: dup |
