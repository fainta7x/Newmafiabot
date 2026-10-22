# Audit log

### 2026-10-18 — hidden or covered controls in the Live Game (owner request; tool `e2e/tools/live-game-hidden-controls.mjs`)

Scope: every phase of the engine (zero night, speeches idle/active/done, voting announcement/collecting/zero round, round result tie/single, revote speeches, table decision, voting farewell, night intro/shooting/Don/Sheriff/morning/best move/farewell/death protocol) at 390×844 and 1366×768; each button/select/input is tested for display:none, zero size, opacity 0, off screen, clipping and being covered.
- **Fixed — «Отменить последний голос» covered on a laptop** (all desktop sizes): the sticky action bar sat over the counters row because the order caption and the hint stack made the voting block taller than the centre panel. `liveGameEveningBugfixes.css` (≥768 px hides the caption and the hint); regression in `e2e/tests/live-game-compact-layout.spec.mjs` (fails without the fix).
- **Fixed earlier today:** «Вскрытие» (toolbar hidden), «Попил» (covered by the action bar), header selector «Игрок» removed (owner: never used).
- **Follow-up (owner, 2026-10-18): the dead judge toolbar and the player-list mode are removed** (`LiveGameJudgeToolbar`, `LiveGamePlayerList`, the `viewMode` state and the three CSS rules that hid the toolbar). Everything it held lives elsewhere: tap / long press / keys open the player sheet, «+30с за 2 фола» is in the centre panel, «Вскрытие» in the player sheet, undo is the steps' «Назад» and Ctrl/Cmd+Z, the roles switch is in the game window header. The same trap had already caught «+30с» on 2026-10-03 (PROJECT_STATE item 59). Still intentional: phone «+Ф» on cards (moved to the sheet), transparent «Выставить #N» chips between speeches.
- **Not a defect:** «Журнал», «Telegram» sit below the fold at 1366×768 but the shell scrolls; the top-right «Текущее состояние игры» button was flagged only because it is a fixed element.
- **Fixed (2026-10-18):** after a reload during the death protocol the window used to open over the unrestored engine. A resumed game window (`liveGameResume`) now makes the engine take its saved game by itself, without the «Восстановить» question (a window opened by hand still asks).
- Not covered: the tournament engine modal (same engine, own shell), 8–9 player tables, the winner confirmation overlay.

### 2026-10-18 — owner reports: protocol window missing at the evening, «Вскрытие» not in the game (fixed in code, not deployed)

- **Death-protocol window stopped opening** (`EveningDeathProtocolOverlay.tsx` reads `mafia_live_session` from `localStorage`). Root cause found: #974 (2026-10-16) stores replay frames of the OBS presentation in `mafia_live_broadcast_frames:<game>` (up to 360 frames ≈ 2.4 KB each ≈ 0.85 M characters per game) and nothing ever removed them; after a few games of one evening the browser storage was full, `writeLiveSession` swallowed the quota error and the window (and recovery) kept reading a stale session. The engine→window transition itself works (new test `liveGameDeathProtocolStep`). Fixed: `src/lib/liveStorageBudget.ts` (frames give way to the live session; frames removed after the save and of other games on opening; frames kept in memory instead of re-parsing ≈1 MB on every publish tick), used by the engine session, the club recorder and the death protocol store. Status: fixed in code, not verified on a real evening.
- **«Вскрытие» unreachable in the game**: its button lived in the judge toolbar, which `liveGameDesktopParity.css` and the phone layout hide (`display:none`) on every screen, so the owner never saw it (since #858, 2026-10-12). Fixed: the record is now in the player panel (tap or long press on the player): «Вскрылся шерифом», then one tap on a number in the «красным» / «чёрным» rows; hotkey V (overview), 6 (for a seat). Any player may reveal (the black side too). The broadcast graphics already show revealed players and announced checks (checked on the preview fixture); the abbreviations «кр» / «ч» on the card are still terse — open.
- **Wording**: the window after the first killed player's death was titled «Протокол ЛХ»; owner: it is «Лучший ход» (ЛХ). Renamed; «Протокол убитого» stays for the colour protocol after the farewell speech.
- Judge toolbar items hidden on every screen: «Показать роли» is in the modal header, undo is the footer «Назад», +30 s is in the centre panel; nothing else is lost (reveal was the one).

### 2026-10-17 — Live engine feature audit after the ChatGPT period (owner report: functions missing at the evening)

Scope: documented Live Game features (FEATURE_MAP / BUSINESS_RULES) checked against `main` 5de3f32: mounts, tests, typecheck, deployed bundle, 390 px browser run.
- Code audit: no feature removed; all live components mounted; ~12 old live CSS files unmounted since 2026-08-18 (intentional, not a regression). Typecheck clean; 282 live tests pass. (wontfix)
- «Попил» (zero round): button present but at 390 px the sticky «Назад / Следующий» bar covered it (`CenterPanel.tsx`, `liveGameEveningBugfixes.css`). Fixed: one row «← Попил Следующий →». Shown only for a full table of 10 alive seats 1–10 by design (`quickSplitAssignments`); a table of 8–9 has no quick split — open, needs the owner's scheme.
- Fouls outside the day speeches: `liveGameTelegram.css` hides the on-card «+Ф» on phones, and in voting a card tap casts a vote, so the only path was a 30 px selector in the HUD header. Fixed: long press (0.55 s) on any seat opens the player action sheet (fouls, removal, PPK) in every started phase (`SeatCard.tsx`).
- «Протокол убитого» window not shown at the last evening: not reproduced (engine + bridge integration passes; mount depends on `.evening-live-engine-shell` and the 250 ms `mafia_live_session` poll). Open, waiting for the owner's details.
- Old browser suite `e2e/tests/live-game.spec.mjs`: 4 of 5 fail at the setup step («Начать раздачу ролей» no longer exists); stale fixture, open.

### 2026-10-16 — #949 final mobile gate (open, before correction)

Head7e41f819: required CI/CodeQL/Gitleaks passed, UI86/88 passed. Both compact-cabinet cases show the unified evening sheet at479px against the established450px limit. Actual360px screenshot confirms the newly included facts disclosure plus repeated16px section gaps consume the extra space. Tighten only sheet padding/gaps by32px; preserve all content, shared role art, font sizes and44px controls. Keep the450px assertion. Also capture the full recap content by growing the screenshot viewport after mobile interaction/geometry checks; current fullPage evidence is clipped by Telegram's scroll root.

### 2026-10-16 — PR951 late-game picker in group (fixed)

Production symptom: clicking «Приду позже» on a shared announcement posted personal game-choice buttons into the group. handlers/crm_evening_response.py now sends that picker to the clicking user in private, preserving private-chat behavior and explaining when Start is required. Reviewed three transport-isolated regressions; original Python CI passed. Merge preserves the clock-frozen test from950 rather than substituting a future date. Original container failure is upstream ECR429; inherit950 CI-only configurable base fix. No real message sent during verification.



### 2026-10-16 — owner spreadsheet block2 (implemented, CI/mobile pending; recorded before changes)

- Row10: Telegram slot totals call the assigned judge a player; arrival/response lists repeat them among players. Owner is telegram_evening_copy + staff identity on telegram-plan + slot projection. Show one named host separately, exclude that identity from player lists/counts, keep gathering total unchanged.
- Row11: PlayerGameDetail repeats metadata counters and independent containers; full chronology only shows aggregates despite recorded vote events. Build one score-sheet composition, preserve expandable full player facts, expose recorded voter→target and personal evidence-based accuracy. Missing historic votes stay unavailable, never inferred from counts. Don label inherits white despite purple registry icon.
- Row12: PR951 private late-picker fix passes all source checks; container blocked by ECR429, audit record missing. Finish existing PR with950 CI fix and required audit; no new replacement PR.
- Row13: PlayerEveningSummaries splits result and highlights into different cards; combine as one evening result sheet, retain game links/awards/empty/error behavior.
- Row14: production read-only performance snapshot09:13UTC confirms8–10s periodic event-loop stalls, /player/me3113ms and profile summary1966ms. Found repeated full-history SQL/JSON work in loadStatGames, used during bootstrap achievements/profile reads: add relevant-input versioned/in-flight cache, verify unrelated token writes preserve it and corrected protocols/cancelled evenings invalidate it. Defer CRM/OBS/replay route code. Actual production build static JS drops2,971,164→1,980,298bytes (gzip721,296→513,081;29%less compressed). Runtime8–10s stalls require post-deploy measurement; these local results are not proof they disappeared.
- Turnaround: earlier43min mixed oldPR completion, repeated broadCI, fixture regressions, browser download and registry failures. Connected local tests precede a coherent CI submission; use external wait for independent requested work, not polling.

### 2026-10-16 — #950 minimal-schema service compatibility (fixed)

Full CI fails in eveningRoutePostsPending, novicePromoAnnouncement, organizerEveningSlots and weeklyEveningAutomation: loadEveningPeople queries evening_staff_assignments before the optional club-operations schema exists. The existing eveningJudgeId reader already handles absent/older staff schema without creating or migrating it. Reuse that owner, then load the player only for a real assigned ID. Verified: all five affected service/assigned-judge suites pass (20 tests) unchanged; no new schema migration is introduced.

### 2026-10-16 — #950 review: assigned judge identity

Review PRRT_kwDOTau29M6tIOO_ correctly identifies that a separately assigned judge may not have an RSVP row. Preserve owner's11/9 total while explicitly counting the assigned judge once, with player-ID deduplication. Keep raw registration/shortfall player counts separate; expose gathering_count in weekly summaries and add only a nonregistered assigned judge to each slot's gathering list. A judge who already answered thinking/declined is not silently converted to going. Regression:8/10 signups plus separate judge assembled; judge already among signups no duplicate; raw counters and responses unchanged.

### 2026-10-16 — #950 container registry blocker

Second candidate: all five TS shards, web checks/build, Python tests passed. Container job116892647392 still fails before source build with public ECR HTTP429 Data limit exceeded. Cause is registry access from hosted runner. Add configurable official Node base image; default remains ECR for Amvera, CI explicitly selects docker.io/library/node:24-bookworm-slim. Both build stages use the same configured image; runtime startup verification remains mandatory.

### 2026-10-16 — #950 first CI diagnosis (before follow-up fix)

Web checks + four shards passed. Fifth shard exposed an over-broad readiness normalization resetting an explicitly configured one-place novice reservation to 9; preserve custom capacities and migrate only the legacy default11→9. UI preview 84/86 passed: new comparison selector «Иду» also matched «Не иду»/«Приду позже»; use exact accessible name, no product workaround. Python has an independent calendar-dependent fixture: its 16 October event is now «сегодня»; freeze the test clock and cover both date/today branches. Container failed before building source: public ECR HTTP429 Data limit exceeded; no Dockerfile/mirror change.

## 2026-10-16 — owner spreadsheet / approved teaching cards (open)

Source: Google Sheet `1pxtdwQrYfuFrK-ogWK9DFt50HMS4beYfK88lQHNbw_g`, tab Баг-трекер, rows 2–8, read 2026-10-16. Scope is seven requested CRM corrections plus saving the two final approved teaching images/copy; no production data edits or messaging.

- Row 2, `WeekEventsPanel.tsx`: Today rows omit registration totals; show actual coming people and shortage, guests included. Acceptance: same totals in rows/cards.
- Row 3, `eveningRouteService.ts`: valid timing always has status info, so a complete preparation remains 6/7. Acceptance: valid date is done, invalid date attention.
- Row 4, `WeekEventsPanel.tsx` / `EveningsList.tsx`: chronological sorting ignores owner's priority regular evenings → ratings/tournaments → other. Acceptance: priority first, date within group.
- Row 5, `eveningRouteService.ts` / `eveningRecruitmentService.ts`: route answers count only evening_participants, recruitment drops guests/whole-evening signups. Acceptance: guest plus companions counted once, declined/thinking excluded from coming.
- Row 6, `eveningSlotPlanningService.ts`: novice gathering inherits 11 instead of 9 people. Acceptance: 10 players + judge = 11 regular, 8 + judge = 9 novice; preserve game-seat and money rules.
- Row 7, `EveningGameRegistrationDashboard.tsx`: «Нужен ответ» overlaps «Нет ответа» without explaining subset. Acceptance: response filters are disjoint; delivery tracked separately.
- Row 8, same component: five inconsistent inline buttons give no clear current/destination state. Acceptance: compact labelled response picker, selected status and Cancel, 44px targets; same response writer.
- Teaching copy: card selection by finger number; thumbs-up fist on table; no general discussion; Don hunts/kills or plays Sheriff. Final card1 = exec-79fca779, card2 = exec-ae6f3551. Omission of best move/penalties is only for these beginner cards, not removal of game mechanics.

Status: all seven findings have implementation and focused regressions in this workstream. First focused batch: 33 tests; follow-up route/shortfall/response batch: 26 tests; smoke: 19 tests. TypeScript, changed-file ESLint, isolated preview build and release data-safety audit passed locally. Mobile screenshots/required Actions and merge are pending. Baseline preview components are frozen under e2e/fixtures at bdc59bfe solely for same-fixture before/after capture. Local browser installation returned a truncated archive; no local visual approval claimed. Existing automatic cancellation playing-seat minimum remains unchanged; gathering thresholds include the judge.

### #949 second narrow-screen diagnosis — 2026-10-16

After fixing inherited line boxes, 390px passes the entire interaction spec. At360 the roster ends722px: inspected fresh screenshot from run38876107284 and found the red team header wraps «баллы / Elo» onto a second line because of winner mark/gaps; player rows are now44px. New cause is the team header, not row height. Reduce header gaps and use «баллы/Elo»; keep names, winner, units, 44px targets and unchanged713px acceptance.

## 2026-10-16 — #949 mobile acceptance follow-up

UI preview 38746228226: 82/84 passed; game overview roster ended at 835px rather than 713px. Inspected exact-head failure screenshot (SHA256 artifact 9f87018f…). Confirmed product issue: collapsed player rows expand to about 64px because stacked inline role/name lines inherit body line boxes. Fix scoped to explicit 44px summary with two 16px flex lines and controlled leading, no lost disclosure content. Acceptance remains roster bottom <=713 at 360/390, all summary targets >=44; no relaxed assertions.

## 2026-10-15 — reconcile and finish open PRs

- OPEN #949, `PlayerGameDetail.tsx`: a two-column phone roster keeps the old five-column row contents, so role/name/score compete for ~156px; 40px summaries miss the 44px target. Compact the row itself, keep full identity/exit/marks in its disclosure and verify child bounds at 360/390px.
- OPEN #949: key moments are truncated behind hover-only titles; disclose full wrapping facts on touch. Main overview should show result and both team rosters, with history available on demand. Update stale test labels without removing value/action coverage.
- OPEN #945, `PremiumProfileShowcase.tsx`: failed showcase GET has no retry; section changes do not invalidate the light pinned response. Port only this functional remainder into #949. Zero-value stats/filter reset from #945 and Elo retry/protocol links from #946 already exist in main; their older graphic layouts are superseded.
- REVIEWED #940/#942: functional loading/retry changes are already in main; old rating presentation is superseded. Close both. #941 owns valid art direction but needs canonical DESIGN_SYSTEM/PROJECT_STATE ownership. Preserve #891's later approved concept in those owners/BUSINESS_RULES before archiving its rejected wardrobe prototype; do not merge the prototype runtime.

## 2026-10-15 — restore compact game graphics after owner review

- IMPLEMENTED, exact-head browser/CI pending — role presentation had several owners: `tournamentRoleValidation.ts` and `playerGameRoleLabels.ts` duplicate names; cabinet pages add local dictionaries; the table, broadcast and the new `RoleMark` choose icons/colours independently. The final search also found duplicate name maps in club result images/posts, the premium-profile service, GoMafia rows and betting CRM; these now read the same shared labels. Establish one shared role registry and reusable UI, retain existing validation exports as compatibility adapters, and migrate the actual player/table/broadcast consumers without changing role assignment or visibility.

- IMPLEMENTED, exact-head browser/CI pending — owner screenshots show that #947 overcorrected toward text-only surfaces in `PlayerEveningSummaries`, `ClubConnectionStories`, game-history rows and `PlayerProfileStatsHero`. Preserve the grouped page composition while restoring factual team comparisons, linked role/identity graphics and a single overall win-rate visual. Reuse the real Live Game role icons; no giant posters, invented results or isolated chart per metric. Acceptance: unchanged values/actions and actual 360/390px before/after evidence.

## 2026-10-15 — before/after screenshot delivery

- FIXED IN TEST, fresh browser evidence pending — `e2e/tests/desktop-workspaces.spec.mjs`: the role-tab screenshot can run before the role response renders. Final #947 evidence at 390/700/1024/1366px contains only an empty role-list border, whereas 1440px contains all four fixture roles. The no-loading-text check may pass before the effect starts, and iterating an empty row array passes vacuously. Now require all four role rows (or all three game rows) from the existing fixture before checking geometry and taking a screenshot. No product layout change.


## 2026-10-15 · Cabinet information density (owner correction)

**Reproduction:** at 390px, open Evenings → My games, Connections or a past evening. A game poster reserves 230px; a known pair repeats a 172px diagram and 116px win-rate orbit; an evening shows separate score panels, VS artwork, a duplicate score bar and another orbit. Expected: scan results and reach the protocol without decorative scrolling. Owner: mounted presentation, not APIs/calculations.

**Scope:** review all mounted cabinet pages by route/component. Latest owner direction supersedes the graphics-first rollout; see `PLAYER_CABINET_VISUAL_DESIGN_CONTRACT.md`. Keep awards artwork, learning interactions, poker gameplay, finance and game rules.

Findings before implementation:
- **fixed (implementation)** `PlayerHomeDashboard.tsx`: latest-game card repeats the career summary; related information should share a group.
- **fixed (implementation)** `PlayerHistoryStatsView.tsx`: 230px posters and arbitrary binary-result bar heights obscure dates, roles and protocol access.
- **fixed (implementation)** `PlayerEveningSummaries.tsx`: team score and personal totals fragmented across repeated artwork; protocol buttons are 128px posters.
- **fixed (implementation)** `ClubConnectionStories.tsx`, `PlayerClubConnections.tsx`: two/three known people do not need a network canvas; percentages repeated as standalone circles inside nested cards.
- **fixed (implementation)** `PlayerCommunityHub.tsx`: unrelated poker promotional banner precedes every community task and grows to 104px on desktop.
- **fixed (implementation)** `PlayerProfileStatsHero.tsx`, `PlayerProfileCareerSections.tsx`, `PlayerGameNumbers.tsx`: inset cards/orbits/bars per statistic create unnecessary surfaces; zero streaks incorrectly become dashes.
- **fixed (implementation)** `CanonicalPremiumPlayerProfile.tsx`: repeated learning/connections shortcuts compete with tabs; role posters and recent-game cards need grouping.
- **fixed (implementation)** `PlayerGameDetail.tsx`, `PlayerVisualScenes.tsx`: full table repeats roster before story; every night gets a 155px landscape; ballots repeat counts as total, segment, percentage and dots.

**Acceptance:** retain all real results, role/seat labels, profile/game links, privacy gates, filters and denominators. Inspect 360/390px screenshots, full-row actions >=44px, overflow and Back. Keep useful optional seating map, one ballot comparison, Elo trend and team/role comparisons. No server/DB mutation.

**First CI result (853234d):** web/build, container, Python, CodeQL/Gitleaks and four test shards passed. Shard 1 exposed two obsolete `PlayerCareerVisualHierarchy` assertions requiring the now-removed graphic roles. Updated them to verify team percentages, true denominators, voting counts and unavailable empty-team rate; preserved every factual assertion. Mobile preview still running; no claim of visual approval.

**6695e8d evidence review:** all non-browser CI passed; 82/84 browser checks passed. Both failures were a new test selector matching the seating disclosure label without its arrow, not a broken app action. The screenshots independently exposed pre-existing min-content roster overflow (long exit/identity labels push points outside the phone) and a completed-profile card consuming about 100px. Fix the actual grid bounds, target the actual summary, and hide finished reminders; keep incomplete profile guidance compact. Keep child-geometry checks so document-level overflow hiding cannot conceal clipping.

**Follow-up source finding:** optional seating-map buttons inherited a 13% height (about 34px inside a 360px page) and overlapped the bottom legend. Give seats 44px minimum targets, reserve the legend outside the map and verify all ten real profile actions after disclosure. Status: fixed in implementation, browser evidence pending. Removed repeated eligible-voter text from the timeline header.

**Integrated existing UX fixes:** retained filter options while ratings reload, removed stale rows during loading/error and added retry in indicator/role tables (functional scope of #940). Elo retains its chart, gains retry and real protocol access with 44px controls. No participation thresholds or calculations changed.

**Local validation:** TypeScript, full ESLint, release data-safety audit, 42 rendered React checks and 19 smoke checks passed; isolated preview build passed. These are local results; exact-head GitHub CI and mobile screenshots are still required. Existing tests for removed orbits/posters now assert the actual labelled values and real navigation. Added a four-role history fixture and 360/390px whole-page density/action checks.

## 2026-10-14 · Owner-approved holistic player cabinet audit and implementation plan

**Approved scope / design contract** (implementation required, not just mockups): Audit calculation sources, denominators, completeness and explanatory copy for player voting (red/black, Don/Sheriff, critical days, all eligible voting phases and exclusions), checks, reveals, night shots, exits, nominations, best move, form, records and seasons. Compare profile, club analytics and other views against one canonical definition; preserve uncertain/missing journal coverage explicitly rather than inventing values. Audit the latest #924 change against persisted voting protocols and avoid confusing count of games with count of ballots. Keep federation GoMafia career separate.

**Player cabinet UX direction**: stop stacking indistinguishable full-width text rectangles/tables. Favor compact scannable visual composition: differentiated cards, role illustrations/icons, accessible win-rate bars, Elo/form mini-graphs, timeline and match summaries, avatar-safe pairings, contextual explanations and intentional responsive grids. Align evening/result match representation in different sections; do not duplicate disconnected visual identities.

**Screen-by-screen prioritized backlog**:
1. Overview / Progress: desktop category controls must not stretch absurdly; compact 2-column desktop layout and short actionable summary; use charts/visual hierarchy, not tall homogeneous stacks; spotlight meaningful seasonal achievements and records; remove isolated bright-white invitation buttons.
2. Games, evenings, match results: compact graphical match cards, role/team signal, result, delta, date and direct drilldown. Visually unify the activity match list and evening result list; eliminate raw table-like presentation.
3. Indicators and roles: unified **career / current rating season / last 10 completed games** scope, explicit historical season options; distinguish **rating period** from **calendar/club season (e.g. autumn)** and label metrics unambiguously; graph role split, win rates, actions and completeness; make filters native and understandable.
4. Community: preserve working place/rank and player list; possibly demote long directory, raise seasonal ranking.
5. Connections: consistent avatar placeholders, balanced pairs and role distinctions, explain relationship criteria; avoid glaring white invite controls.
6. Activity/form: explain calculation, denominator and time window; consistent match cards and seasonal context; visual progress.
7. Archive/season/Hall of Fame: make current-season records and Hall of Fame discoverable, support historical records without burying key highlights.
8. External sporting career: keep separate federation data, protect unknowns and avoid oversized single blocks.
**Explicit exclusions**: do not redesign awards or learning/training yet. Do not remove pagination, availability/privacy gates, or overwrite data. All changes must pass targeted and full test/build/security checks before merge.

**Implementation strategy**: ship small independent PRs with working screens + tests; phase 1 handles game/role card hierarchy, descriptive filters and desktop density, then subsequent stages audit analytic definitions and unify evening/activity/season/connection screens. This log is the authoritative tracker; mark completed items with PR numbers and do not claim the entire plan is finished until separately verified.

## 2026-10-14 · Player profiles: full-history indicators and GoMafia size split (owner correction)

Owner requests removing arbitrary last-6/last-10 voting/other stat windows from overall measures, preserving the actual rating scope and game counting. Windowed indicators remain valid only when explicitly labeled as recent trends; backend sources and eligibility must be audited independently before changing calculations. Do not globally remove API safety limits, pagination or genuine ranking constraints.

GoMafia source currently stores all/federation year statistics and tournament appearance place without confirmed participant counts, so the previous average place mixed incomparable tournament sizes. First scoped implementation: record only source-reported positive integer tournament.usersCount (if present); distinguish >10, exactly 10, <10 and unknown; show group-specific games, win rate, and places, without assigning missing-size tournaments to either category. Existing all-time federation Elo and role statistics remain labeled aggregate and are not represented as group-specific. UI uses compact responsive cards instead of a standalone narrow score column. Validate data availability via real provider fixtures before claiming full historical coverage. Source-related assumptions and all unconfirmed tournaments remain visible, not silently discarded. No club ranking/Elo or awards changes.

## 2026-10-14 · Screen 8: CRM «Игроки → Рейтинг» cross-season stale results

**Mounted route:** `OrganizerCRM → PlayersHubCRM → RatingPeriodsCRM`. When switching `selectedId` between rating seasons A and B, `loadSelected(periodId)` starts three concurrent GETs (evenings, games and standings) with no request-ID or abort guard. A slow A response can arrive after B and overwrite all three projections, showing A's standings and override controls under B's title/ID. Loading B leaves A's old values visible in the meantime. Collapsing the rating section also allows in-flight GETs to refill cleared state.

**Intended narrow fix:** invalidate obsolete detail requests on every season selection/collapse/unmount, publish a response or error only for the active request and clear prior season projections at the start of a new selection. On a manual evening/game override, refresh details only if the season has not changed while the PUT was in progress. Retain server rules, actual override payloads and form fields, and all existing ranking equations.

**Evidence/acceptance:** React regression with out-of-order A/B GET completions; B must remain the sole displayed standings/season details; collapse while loading must not resurrect old data. Empty/error retry is a separate UX issue. Deletion uses `window.confirm` and 36px buttons and the create-season form precedes current standings; assess later after phone screenshots, do not bundle visual redesign into this race fix. No production data read or mutated.


## 2026-10-14 · Player Cabinet «Сообщество → Активность → Форма» — actionable and readable club form

**Mounted path:** PlayerCommunityHub(activity=form) → PlayerClubActivity; GET /api/player/pulse returns highlights, current power ranking, viewer ID, per-player games/wins/win rate/streak/rank/score/movement, optional explanation. Current layout is a compressed quasi-table (rank | tiny avatar/name | wins/games | raw score + arrow). Its rows and highlight profiles are **not clickable**, despite canonical player IDs. The owner may be outside the first five and *invisible* before expanding the entire list. The movement label NEW is English, formula is low-contrast text shown only when all rows expanded, and error has no in-place retry.

**Desired hierarchy:** retain five-row preview, full ranked order and exact original numbers. Each player becomes one >=76px touchable card with rank/avatar/name, wins out of games, percent/streak, explicit form score and movement. Keep own standing visible as a separate contextual card **only when outside preview**, without duplication after expanding. Highlights open canonical profiles; technical formula moves into an optional «Как считается форма» disclosure. Error/retry are truthful and guarded against stale results, genuine empty remains distinct.

**Scope:** Only PlayerClubActivity.tsx, focused React tests, and audit/project-state docs. No change to /api/player/pulse, ranking calculations, payouts, consent/privacy or Elo. UI preview at 360/390px before merge. Connections are separate PR #919.


## 2026-10-14 · Player Cabinet «Сообщество → Связи» — pair identity and touch targets

**Mounted owner:** `PlayerCabinetShell → PlayerCommunityHub → PlayerClubConnections`, with `ClubConnectionStories` for story segments and `DuoRow` for red/black club duo lists. Pairs already contain two canonical IDs, avatars, names, games, wins and win rate. In `DuoRow`, two separate **32px avatar buttons** repeat two **32px name controls**; on a 360px phone this creates four cramped competing actions that all open the same two profiles. The stats `4 игры вместе · 3 победы · 75%` form one dense line and obscure the meaning of the percentage. The `GET /api/player/relationships` failure shows a dead-end error with no retry.

**Owner-approved treatment:** preserve entire pairs/stories, red-vs-black grouping, selection «По результатам / Самые сыгранные», single-game evidence disclosure, the six story categories, genuine stats and canonical profile routes. Make each person **one** distinct comfortably tappable (>=44px) identity card with avatar/name, name/profile accessible label, and a separate short 3-metric summary `игр вместе / побед / побед` in a restrained dark-surface pair card; no invented rankings, avatars, new API, or fake score. Keep normal club accent colors subtle. Add `Повторить` for GET failure without navigating away, and distinguish real no-pairs states. Regression covers switching lists, separate profile actions, content and error recovery. Keep other Community tabs out of this PR.

**Not in scope:** rule thresholds, backend relationship computation, profile privacy, league tournaments, monetization, ClubConnectionStories information architecture, and the player activity feed (next screen).


## 2026-10-14 · Player Cabinet «Сообщество → Игроки клуба» — player identity and native profile cards

**Mounted source:** `PlayerCommunityHub → PlayerClubDirectory` for the Community «Игроки» tab; `GET /api/player/players` supplies the player's nickname, avatar, game_level, Elo and canonical ID, and `openCanonicalPlayerProfile(item.id)` opens details. Present UI uses generic `Card/Badge` and one continuous bordered, divided list with densely compressed `avatar / nickname / level badge / raw Elo` rows. It looks like a CRM directory instead of the club's player space; level can be a more legible secondary caption, while Elo needs an explicit label and a profile-destination affordance. Network errors show an `AsyncState` with no in-place retry; successful search with no matches and actually empty club data have the same generic caption.

**Expected design:** preserve all players and searchable nicknames and the canonical profile navigation. Replace tabular dividers with individual 76px+ dark 2LA Noire player cards, readable avatar/name and level, an unobtrusive Elo stat and an arrow; self card uses same layout with a subtle accent and a plain «Мой профиль» context. Search remains immediately accessible. Differentiate empty club vs no search matches vs loading vs failed GET, offer `Повторить` without losing query. No new membership data, sorting policy or server writers. 360/390px preview and focused tests for card click, search, empty/error/retry.


## 2026-10-14 · Player Cabinet «Сообщество → Рейтинг → Elo» — useful mobile ranking, not a compressed table

**Owner approval:** improve the *existing* Player Cabinet screens for native visual comprehension, comfort and a unified 2LA Noire card hierarchy, not only fix errors. Avoid repeating generic row-table layouts; keep original sources, facts, profile navigation and gameplay semantics. This is a presentation improvement, not a new ranking feature.

**Mounted path:** `PlayerCabinetShell → PlayerCommunityHub → PlayerRatingHub → PlayerRatingTable`. `GET /api/rating` provides players with rank/place, name, avatar and Elo. Current design renders every person as a compact uniform 48px pseudo-table row (`place | avatar | nickname | raw Elo`) including the leaders, while own standing appears in an unrelated slim banner. The numeric column has no explanation per row; a long list is visually monotonous, with no distinction between the top 3 and other standings. An API error lacks an in-place retry.

**Desired visual hierarchy:** own position shown as a recognizable compact identity panel; the top three are **distinctive but restrained** feature cards grounded in ranked `place`, with avatar/name, place, Elo and clear profile destination, while everybody else remains in a comfortable vertically stacked *player card list*, not a grid or data table. Accent palette restricted to existing amber/silver/bronze and dark-surface design system; no neon/glow/podium gamification, invented scores or artificial new ranks. Keep current `data-testid=rating-self-card` and `rating-self-row` contracts and exact profile opening function. Shorten labels, make ≥44px mobile touch targets, render truthful loading/empty/error and retry states. All ranked players must remain visible, including ties/absent top ranks.

**Boundaries:** change only `src/components/player/PlayerRatingTable.tsx`, focused React tests and design/queue documentation. No Elo calculation, database, server API, wallet, cosmetics, avatar generator or account changes. Visual inspection at 360/390px in PR preview required before declaring complete.


## 2026-10-14 · Player Cabinet, screen 4: «Вечера → Мои игры» club-archive error survives recovery

**Mounted path:** `PlayerCabinetShell → PlayerEveningsHub(games) → PlayerHistoryStatsView`. The player's own games load from canonical PlayerMe and work independently. The secondary disclosure «Все игры клуба» invokes `GET /api/player/games/all` only when expanded. The effect sets `allGamesError` after a failed request, but never clears it before another attempt or after success; the render branch prioritizes `allGamesError` over `allGames`. A transient outage can therefore leave the archive showing the old error after the next successful GET. The error panel contains **no retry control**.

**Expected:** when opening the club archive or pressing `Повторить`, reset the previous error and stale archive state; preserve the main `Мои игры` and selected-game protocol, and show the real empty state only on a successful empty result. Guard against old responses arriving after collapse/unmount or retry. Existing archive read endpoint and all game/protocol/Replay navigation stay unchanged.

**Acceptance:** rendered regression: first GET rejects, error with accessible retry; second GET succeeds, archived game appears, old error disappears; success-empty remains empty. No writes of game data, profile, token or bankroll. CI and 390px preview before merge. Independent from screen 2 (#913) and screen 3 (#914); keep separate PR.


## 2026-10-14 · Player Cabinet, screen 3: «Вечера → Прошедшие» dead-end after GET failure

**Mounted path:** `PlayerCabinetShell → PlayerEveningsHub (recaps) → PlayerEveningSummaries(embedded=true)`. `GET /api/player/evening-summaries` failure sets `error`; the returned full-screen error panel offers only `onBack` when supplied, but the mounted embedded caller provides **no `onBack`**, leaving the player with an error message and no in-section retry. Switching tabs away and back is the only implicit recovery. A successful zero-summaries response correctly renders «Итогов пока нет» and must stay distinct from request failure.

**Expected:** render a clearly labelled min-44px `Повторить` action in both embedded and standalone error states; refetch the same GET and, on success, restore the selected evening/results without leaving the tab or altering URLs. Preserve optional back action if present. Use a request generation to prevent older responses from obscuring newer retries; keep all scores, awards, game links and backend schemas intact.

**Verification:** rendered React tests for HTTP failure→success and genuine empty state in embedded mode; CI plus 390px preview required. Other player work in separate PR #913 covers the `Скоро` calendar, do not blend component changes.


## 2026-10-14 · Player Cabinet, screen 2: «Вечера → Скоро» stale calendar month and retry

**Mounted source:** `PlayerCabinetShell → PlayerEveningsHub → PlayerEventsCalendar`, `src/components/player/PlayerEventsCalendar.tsx`. Month switch changes `monthKey` and invokes `load()`, but no cleanup, request ID or abort guard exists. A slow previous-month `GET /api/player/calendar?month=...` can complete after the latest GET and **replace current-month `events`, `noviceState` or the error flag**. The month title and list then disagree; the calendar's filters/nearest/highlight operate on false data. A network/API failure renders an error notice without an actionable retry; changing month is the only incidental retry.

**Acceptance (read-only):** Ignore stale successes/errors/fallback onboarding fetches after switching months and after unmount; list, nearest card, filters and error state must reflect only the latest selected month. A visible `Повторить` loads the current month in-place while preserving the list/calendar selector. Keep deep link and onboarding writer behavior untouched; no change to event types, availability, slot capacity or RSVP rules. Rendered tests must resolve month B before A and verify B remains, and exercise failed GET→retry.

**Scope:** `PlayerEventsCalendar.tsx` and focused React tests only, 360/390px UI preview before merge; no production changes claimed. First Player Home screen's separate PR #912 owns `PlayerHomeDashboard.tsx` and priority queue docs; rebase over it after merge without losing the Player Cabinet focus.


## 2026-10-14 · Player Cabinet, screen 1: «Главная» next-evening request can misreport failure as no events

**Priority change:** Organizer CRM audit moves to the parked queue in `docs/PROJECT_STATE.md` at owner's request; the Player Cabinet is the active screen-by-screen usability/quality program. Keep CRM fixes already merged and PR #910 (unmerged/red CI) recorded rather than silently discarded.

**Real mounted path:** `PlayerCabinetShell → PlayerHomeDashboard`, with the `player-home-next` card and `onOpenEvents(nextEvening.id)` link. On mount `GET /api/player/evenings` feeds the next-evening card. State `evenings === null` displays «Загрузка…». If GET returns non-2xx, the hook returns without updating `evenings`: this card shows «Загрузка…» **forever**. If `fetch` throws (offline/network), code sets `evenings=[]`, producing «Ближайших игровых вечеров пока нет» although no valid result arrived. On a successful empty array, the true empty state must remain unchanged.

**Expected/acceptance:** Keep an explicit `loading|ready|error` state for this read. On failure show a factual «Не удалось загрузить вечера» with a 44px+ «Повторить» action; retry the same endpoint without leaving the home screen. On successful empty response keep the original empty copy; successful nonempty response keeps exact existing next-evening order and navigation. Ensure only the latest request can update the card (avoid a late old response overriding a retry); no new API or registration/RSVP writes.

**Boundary:** only `src/components/player/PlayerHomeDashboard.tsx` and targeted rendered tests for this card. No redesign before 390px preview. Player/organizer separation remains in `docs/PROJECT_STATE.md`.


## 2026-10-14 · Screen 7: CRM player card hides pending task when next evening exists

**Mounted evidence:** `OrganizerCRM → PlayersHubCRM → PlayersActivityCRM → PlayersCRM`, `src/components/crm/PlayersCRM.tsx` quick context directly before contact/task/communication actions. The component derives both `bookingEvening` (from the player's next available booking) and `nextTask` (from the player-detail response), but renders them using an exclusive `bookingEvening && booking ? ... : nextTask ? ... : null` conditional. When both facts exist, the visible card **silently hides the actual pending follow-up task**, even though it appears among the player's deeper task/history records.

**Expected behavior:** expose *both* the next evening and closest open task in the top operational context when both are present, without expanding the history or changing the booking/priority calculation. When only one exists, preserve its current label/link; when neither exists, no empty card. Keep compact hierarchy and ≥44px click target for the event link only if converted into a large action (not in this scope).

**Fix owner:** `PlayersCRM.tsx` display condition only, plus rendered React tests for both/single/empty cases and action destination. No API, profile, task, RSVP, payment or event lifecycle writes changed. Production phone/runtime remain separate verification.


## 2026-10-14 · Screen 6: CRM «Игроки → Карточка → История» truncates the timeline

**Reproduction (source-confirmed):** `OrganizerCRM → PlayersHubCRM → PlayersActivityCRM → PlayersCRM` displays a timeline assembled from activities, evening history, tasks and club/tournament games. Its disclosure label shows `unifiedTimeline.length`, but it always renders `unifiedTimeline.slice(0, 10)` with **no way to reach older entries**. Example: a player with 26 historical events sees a count of 26 but only 10 entries when expanded. This is a presentation loss, not an API limitation.

**Expected:** The first 10 stay collapsed by default and easy to skim on mobile. When expanded, provide an obvious `Показать ещё` interaction, append older events ten at a time until all fetched entries are reachable, and show progress (shown/total). Reset expanded count for each new card/opening, so another player's history does not inherit an unnecessarily long view. Keep the full list collapsed by default in the work card, with no new API request or local-history mutation.

**Implementation owner:** only `src/components/crm/PlayersCRM.tsx` and its rendered tests. The existing timeline ordering/content, business statuses, games, profile writes and finances must remain untouched. Mobile touch target >=44px. Tests must check 0/<=10, 26 records across increments, exhaustion, and reset on player switch.

**Verification:** focused React regression + ordinary CI and UI preview on PR head; no production player data inspected.


## 2026-10-14 · Screen 5: organizer CRM player work card — stale request and nested overlays

**Mounted path:** `OrganizerCRM → PlayersHubCRM → PlayersActivityCRM → PlayersCRM`; although the legacy roster inside `PlayersCRM` is hidden in this mount, `PlayersCRM` is the active owner of the **player work-card MobileSheet** and its nested actions.

**P1 finding — stale detail fetch:** `loadPlayerDetails(id)` updates `playerDetails` regardless of whether the card has since closed, another player ID was selected or a newer refresh completed. An older response can replace a newer player's nickname, contact information and actionable profile state; reopening/switching a player in a slow network is a factual mismatch, not just cosmetic. The list request already has a sequence guard; this detail request does not.

**P1 finding — sheet state leaks across profiles:** `handleCloseCard()` cleared several edit/task/menu sheets, but omitted `showPublicProfile`, `showTokensSheet` and `confirmDeleteAvatar`. Their open flags survive close, and the next successful `playerDetails` update can reopen a previous nested overlay for another player. Scope includes resetting on change of selected player, not only root close.

**Fix boundary:** invalidate obsolete detail requests on new load or card close and never publish their result/error; reset all nested-card action flags when card closes or switches player. Retain existing create/edit/write APIs and layout, including intentionally nested MobileSheets. Keep financial and avatar mutation logic unchanged.

**Acceptance:** rendered React regression for A → B out-of-order requests (only B is shown), close/reopen with an old successful response (no ghost card), and nested overlay/confirmation flags reset on the next player. CI and mobile preview required for merge; production-runtime and actual phone verification not claimed.


## 2026-10-14 · Screen 4: CRM «Игроки → База» profile-filter fallback

**Confirmed mounted behaviour:** `OrganizerCRM → PlayersHubCRM → PlayersActivityCRM` is the actual list, not the older standalone `PlayersCRM` list UI. `PlayersActivityCRM.loadProfileSummary()` used one `Promise.all()` for optional birthdays and essential profile completeness, swallowed all exceptions/HTTP failures, and left `profileMap={}` with no load/error state. Any active «Незаполненные / Без аватара / Без дня рождения / Нет контактов» filter then hid every person and rendered «Здесь пока никого», while the header claimed «0 человек». A failed birthdays request could also stop processing otherwise valid profile summary data.

**Narrow fix:** keep a separate `loading|ready|error` state for profile completeness, handle the two GET responses independently, and when the profile filter's essential data is unavailable show truthful verification/loading or an actionable retry/reset state (not a fake empty database). Existing list filters, counts, segment semantics, player creation and profile writes are unchanged. Ordinary list/API failure with zero rows likewise no longer renders an additional contradictory «Здесь пока никого» panel.

**Evidence:** rendered React regressions `src/tests/PlayersActivityProfileFilterErrors.test.tsx` cover failed summary → retry → restored filtered person, and failed optional birthdays with valid profile completeness. CI/phone runtime pending; no production player records read/changed.


## 2026-10-14 · Screen 3: CRM «Ещё» scroll state and Back routing

**Evidence:** mounted `OrganizerCRM.tsx` passes `onScreenChange` to `MoreCRM`; its callback calls `moveWindowScroll(0)` for **both** entering and leaving a nested screen. `openSecondaryTab` enters `tasks`/`analytics` at top, then the ordinary Back control calls `switchPrimaryTab('more')`, also resetting to top. Browser Back changes `routePathname` without invoking `onScreenChange`, so a callback-only fix cannot restore position.

**Focused fix:** preserve `window.scrollY` only when leaving the main More menu to a nested screen, «Дела» or «Аналитика», then restore on actual route change back to `/admin/more`. One-shot restoration prevents unrelated primary-tab switches from reusing stale menu scroll. Entering an inner tool still starts at top. Preserve existing URLs, browser history and all tools; no app data/API changes.

**Regression:** rendered shell test `src/tests/OrganizerMoreScrollReturn.test.tsx` simulates nested screen, both secondary tabs, browser Back and unrelated primary navigation; CI and 390px screenshots pending. No production phone or runtime access used.



## 2026-10-14 · Screen audit: organizer CRM «Ещё» menu (navigation and hierarchy)

**Mounted owner:** `src/components/crm/MoreCRM.tsx` within `src/components/OrganizerCRM.tsx`; routing in `organizerRouting.ts`. Source reviewed against `docs/DESIGN_SYSTEM.md` (mobile CRM, actions first, rare controls secondary). No production screenshots or phone runtime checked during source audit.

- **P1 — publication tools mixed with conducting actions (confirmed in source):** «Каждый день» simultaneously held «Дела», «Музыкальная база», «Что нового», «Ответы бота» and «Публикации и каналы». Separate «Проведение и дела» and «Сообщения и публикации» with existing IDs/handlers preserved; no new API or content writer.
- **P1 — novice guide hidden in maintenance (confirmed):** `guide` was under the collapsed «Служебное» despite being an ordinary player/novice support action. Move the existing `/guide` action into «Игроки и обучение»; rename from «Ссылка-памятка» to «Памятка для новичка» since the button opens the page rather than copying a link. Preserve the existing public page and URL.
- **P2 — essential descriptions always cut after one line (confirmed):** `MenuRow` had `line-clamp-1`, hiding meaning of longer entries at mobile width. Allow at most two lines with a 64px minimum hit area, preserving hierarchy. Mobile screenshot review remains required.
- **P2 — maintenance via direct deep link returns collapsed (confirmed by state initialization):** `adminOpen=false` even when the initial `activeScreen` is an admin-only deep link. Initialize disclosure open for those screens so Back exposes the section the organizer arrived from.
- **P2 — noisy semantic colors and eager imports (deferred):** `menuTone` gives unrelated menu categories sky, green, amber and violet tones without status meaning, and many nested screens are statically imported. Evaluate neutral icon language and lazy-loading separately with bundle measurements and real 390px screenshots; not bundled into a classification change.
- **P2 — secondary subpage / scrolling (deferred):** `OrganizerCRM` forces scroll to top on submenu entry and exit. Returning from a low menu item risks losing place; needs a focused mounted-shell mobile navigation test and preservation of Back history before altering the parent.
- **Out of scope:** payment/Robokassa, skin editor, VIP, loot boxes and monetization. Existing related destinations are retained with no behavioural edits.

**Checks:** new rendered menu navigation regression in `src/tests/MoreCRMNavigationUX.test.tsx`; full PR CI and UI preview for the exact SHA pending. This is a menu-structure pass, not a claim of live/mobile approval.


## 2026-10-12 · Game page in the player app (owner: «ужасная страница, непонятная, не красивая, не информативная») — FIXED (rework)

Before: `PlayerGameDetail.tsx` was a flat stack — «Итог игры» (winner + loose chips), «Как проходила игра» (votings and nights as separate lists, outcomes as raw words such as «eliminated»/«night»), «Игроки и баллы» (ten tall cards with every score part, fouls and Elo notes open at once). The viewer's own result was only a «вы» mark inside the list. After: result hero, «Ваша игра», «Главное в игре», rosters by team with collapsed details, one ordered story of the game with vote bars and plain results, judge's note. Checked at 360/390 px in a browser (no horizontal overflow, rows ≥ 44 px, screenshot reviewed). Not changed: data, API, scoring. Open: the replay screen and the Telegram result posts are separate surfaces and were not touched.

## 2026-10-12 · Rankings by figure (owner request, built) — design notes and limits

`metricRatingService.ts` reads the finished-game snapshots (`loadCompletedGameSnapshots`, cached by input version), a per-game highlights map (first killed / best move / zero round, parsed once and cached for up to a minute because not every protocol table is watched by the version triggers) and the cached Elo timeline. Scope = rating season (`rating_periods`) × evening format, the same as the profile statistics. Elo = sum of `totalDelta` of the games in scope (novice evenings produce no Elo event, so they add nothing). Privacy: a player with `game_statistics=false` is excluded from everyone else's list. Ties share a place (1, 2, 2, 4); percentage rankings need 5 games (3 for red/black). Update same day: the «Меткость» rankings (votes, nominations, sheriff and don checks, best move) are in, computed from the move chronology with a per-game memo. Night shots: `nightShots.ts` reads `night_step` (shooting/morning), `shot_target` and night `exit` events; attribution is to every black player at the table because the shot is a team decision. Known limits: the whole tournament history counts under the format «Турнир»; rows are capped at 30 plus the viewer's own row.

## 2026-10-12 · Owner question: why «Анонс ещё не отправлен» and why so many people in the Answers list (FIXED: wording)

Owner report (CRM «Ответы», player «Богданчик», «Нет ответа», «Анонс ещё не отправлен»). Traced: `EveningGameRegistrationDashboard.tsx:deliveryLabel` shows it for an eligible player with no `first_sent_at` and a delivery status other than `failed`. The list is `eveningAnnouncementTrackingService.ts:audience` = every player with a Telegram ID who is `contact_status=normal`, not paused (`do_not_invite_until`), allowed by game level and by evening format (other-city guests only for rating/tournament), plus anyone already tracked or registered — not only people who signed up. The first personal DM goes out only from the bot after the announcement is published/active (`botAnnouncementRoutes.ts:requireOpenEvening`), so before that everybody correctly reads «ещё не отправлен». **The exact reason for one player on the live evening needs production data and was NOT inspected.** Fix (status: fixed, wording only): a one-paragraph explainer under the counters says who is in the list and why the announcement is not sent. Owner answered: the announcement had simply not gone out yet (it goes at 19:00 MSK today). Follow-up (same PR): while the weekly announcement is not yet due, the explainer and each unsent row say «Анонс отправится сегодня в 19:00 МСК» (`weeklyAnnouncementDueMs`, the same moment the automation enqueues the announcement job that makes the bot post and send the personal DMs).

## 2026-10-12 · UX pass 2D — ONE organizer answers worklist, and honest Today navigation

**Owner-reported actual symptom:** on «Сегодня → Ответы» the app opens the evening/route instead of its answers. Separate per-player lists existed on mounted `EveningParticipantsView`: `EveningGameRegistrationDashboard` (quick replies / game slots) and `EveningPersonalInvites` (same players, Telegram contact); delivery failures live in the `announcement-overview` response, surfaced elsewhere. Owner asked for *one* understandable player list with all existing information and operations.

**Verified root for link:** `CRMOverview.navigateEveningSection` directly pushes `history.pushState` + dispatches `popstate`, bypassing the mounted `OrganizerCRM.navigateAdmin`/controlled pathname state. Where `onNavigate` is supplied by the app shell, browser popstate is not the authoritative router event. The same helper is still used for independent agenda paths, intentionally outside this fix.

**In this branch:**
- `CRMOverview` accepts the real `onOpenEveningSection` callback; `OrganizerCRM` sets the active evening ID, `activeTab='evenings'`, active section and navigates to its canonical `/admin/evenings/:id/participants` URL. The command-center delivery-failure action also points to that worklist. No API or data write change.
- `EveningParticipantsView` now mounts only ONE per-evening player list: existing `EveningGameRegistrationDashboard`, enriched by its **already fetched** `announcement-overview` data. Each row presents **current answer + delivery status/error + Telegram chat + inline answer editing + exact game slots**. Search by nickname and filters «Нужен ответ / Нет ответа / Не доставлено / Не отправлено / Думают / Идут / Не будут / Все». Status controls collapse by default to reduce mobile scrolling. One player ID, one row.
- Removes the mounted redundant `EveningPersonalInvites` card/list. `EveningInviteAudienceManager` stays below an explicit disclosure **only as global club-wide eligibility preferences**; it is not a competing RSVP worklist and its underlying global contact-status controls are unchanged.
- Existing participant PATCH/POST and slot PUT, actual announcement tracking, delivery/retry, manual Telegram chat URLs and wallet/game rules unchanged. A delivery-overview fetch error is explicitly indicated rather than masquerading as «Вне рассылки».
- Rendered React regressions cover merged rows, delivery errors, unsent, search, single fetching and saving the quick RSVP; route callback regressions cover Today unanswered and delivery-error paths.

**Out of scope:** unmounted legacy `EveningAnnouncementPanel` is not a second active UI; keep it untouched. Don't rewrite announcement/retry worker or club-wide mailing preferences. Mobile CSS/screenshots + CI must pass before merging; main merge is not deployed/runtime confirmed.


## 2026-10-12 · First-application action returns to onboarding (FIX CODED; PR #847)

On mounted `PlayerEventSlotDetail.tsx`, the `first_application_required` recovery CTA «К первой заявке» previously called generic `onBack`, returning to the calendar without locating the application. The existing application form lives in `PlayerEventsCalendar.tsx`. PR #847 adds a dedicated callback to close the event and focus/scroll the existing onboarding block with a React regression test. No changes to enrollment/RSVP API or identity. CI/merge/deploy and mobile runtime verification pending.
## 2026-10-12 · CI regression: premature unified Answers test in main (FIXED in PR #849)

A test file `src/tests/EveningUnifiedAnswers.test.tsx` was accidentally written to `main` before its implementation from PR #845 was merged. The test asserted unified response/delivery rows unavailable in the mounted main CRM component, causing four failures in CI shard 2/3 for unrelated PRs (#847/#848). Fix: remove the premature suite from main only; preserve the corrected complete suite on #845 and restore it with its actual feature. No production code or shipped behavior is removed. Verification: PR #849 CI and merge still required.

## 2026-10-12 · UX audit pass 2C — CRM «Добавить игрока» is an unreachable working path

**[mounted-path finding, fix in this PR]** `OrganizerCRM.tsx:handleOpenEveningAdd` already stores the `eveningIntent='add'` instruction, but `CRMOverview.tsx` currently fails to forward its `onOpenEveningAdd` prop to `OrganizerCommandCenter.tsx` (the prop does not exist there). Thus Today's nearest evening has no one-tap addition even though `EveningActiveRosterView.tsx` already has an add-player/guest picker. Additionally, the parent helper sets the address to `/admin/evenings/:id/participants`, but `EveningWorkspace.tsx` interprets `initialAddOpen=true` as **management → roster**, making visible pane and URL disagree.

- **[planned scoped correction]** Expose the existing action as a secondary `Добавить игрока` one-tap shortcut in today's current/upcoming evening context (not an artificial urgent blocker); propagate the optional callback via `CRMOverview`, align its existing `handleOpenEveningAdd` URL/section with `management` and let the already implemented roster picker open by `initialAddOpen`.
- **[acceptance evidence]** Rendered command-center click passes the exact target evening ID to the provided callback; the intermediate CRMOverview prop is forwarded; the organizer's add route uses `/admin/evenings/:id/management` and the existing picker. The shortcut is absent if no snapshot/callback.
- **[preserve]** No new registration backend or guest flow, state/identity/reward/payment writes, date/price changes or game logic; no new actor access for limited event hosts. Keep status/attention tiles and their priority unchanged.
- **[review focus]** Small CTA minimum 44 px on mobile; a green Playwright/UI preview is technical evidence, not Amvera runtime verification. The same audit also noted event-host roster player links have a deliberately no-op callback; this is **not** a safe invitation to grant host-level access to organizer player cards and remains a permission-specific follow-up.

## 2026-10-12 · Player profile statistics audit (owner: «статистика берётся из разных мест и странные данные за разные периоды»)

Scope: read-only, from the code (`premiumPlayerProfileRoutes.ts` → `premiumPlayerProfileService.ts` (PPS), `playerProfileService.ts`, `lib/gameStatistics.ts`, `gameStatisticsService.ts`, `clubGameAnalyticsService.ts`, UI `CanonicalPremiumPlayerProfile.tsx`, `PlayerProfileCareerSections.tsx`, `PlayerGameNumbers.tsx`). Nothing is fixed yet.

**Sources.** Five: `/summary` (tiles, whole «Подробная статистика», last games, pinned awards), `/games` (with period/role/team/result filters), `/roles` (no period at all), `/elo?range=all` (hard-coded; for the own profile the Elo tab is a different component and endpoint, `/api/player/elo-journey`), and `game_stats` («Игра в цифрах») inside the summary.

**Confusions a player notices (most confusing first; all open)**
1. «Подробная статистика» (collapsed) mixes all-time numbers (streaks, red/black, ПУ/ЛХ, «Игра в цифрах») with the «Текущий сезон» block, and no heading except «Текущий сезон» names a period. It is the most interesting block and it is hidden.
2. The tile «Победы» shows a percent, not wins; the count of wins is not on the overview.
3. The tile «В сезоне» shows a bare «#N»: the season place is ranked by number of wins (then win rate, games), not by Elo, so it disagrees with the Elo rating table.
4. «Season» is defined three ways: the overview uses the RATING period containing today («Вне сезона» between periods); the «Игры» tab button uses `active_periods[0]` of `/api/player/rating-periods` (not filtered by type, and with no active period it silently loads ALL games); the Elo API's `range=season` means «last 120 days». The period buttons live only on «Игры»; «Роли» and «Elo» ignore them.
5. Game counts disagree: tile «Игры» (completed with a winner, club + tournaments, all formats), «По N играм с журналом ходов», the sum of role counts (includes `unknown`), Elo history (NOVICE evenings excluded) — none is explained.
6. «ПУ» appears twice with different bases (counter over all games incl. drafts; «Первым убитым … из N игр за красных» over red games with a log).
7. The exclusion rules of «Игра в цифрах» (zero circle, re-votes, sheriff counts as red) are one level deeper in a nested `<details>`.
8. «Последние игры» shows 3 rows with no scope text and no link to «Игры»; tournament games are mixed into every figure with no label «клуб + турниры».
9. Different date fields decide «the same game is in the season»: evening `starts_at` (profile list) vs `created_at/completed_at` (season place table, `loadCompletedGameSnapshots`) vs `protocol.completed_at` (`loadStatGames`), so the season's «N побед из M» and the place can disagree at the edges.
10. The «completed game» rule exists in at least four places with small differences (`isCompleted` in PPS, `buildPlayerProfileStats`, `loadStatGames`, `loadCompletedGameSnapshots`); win rate is recomputed in six places.

**Proposal (nothing built; for the owner's «да»)**: one period selector at the top of «Обзор»/«Карьера» (Всё время / Сезон «…» / Диапазон) applied to all stats, with a visible scope line («Сезон … · клубные и турнирные игры · только завершённые»); four tiles with plain labels (Игры, Победы + %, Elo + место, Сезон + место по победам); move streaks, red/black, the season block and ПУ/ЛХ/нулевой круг out of the collapsed block; keep only «Игра в цифрах» there with «по N играм с журналом ходов (из M)»; fold the red/black and per-role win rates into «Роли»; show the count and win rate of the filtered list on «Игры»; on the server one «completed games of player P in [from,to)» function (one date field, one completed rule) used by summary/games/roles/elo/stats, returning the scope in each response; decide whether Elo-related counts exclude NOVICE games or the screen says so.

**Follow-up 2026-10-12 (owner said «да»: seasons and all time, and a split by game/evening format) — FIXED in the overview + «Подробная статистика» (branch `claude/busy-euler-bogxha`):** `GET /api/player/profiles/:id/summary?period=<season key|all>&format=<NOVICE|CASUAL|RATING|TOURNAMENT|all>`; every game now carries `evening_format` (tournament games = TOURNAMENT); one scope applies to the tiles, streaks, red/black, strongest role, ПУ/ЛХ/нулевой круг, «Игра в цифрах» and «Последние игры»; the response lists the seasons and formats the player actually has games in, with counts. Status per item above: 1 fixed (#855, open by default); 2 fixed (the scope line says «N побед из M», the tile is «Винрейт»); 3 fixed (tile «Место в сезоне» and the note says it is by wins); 4 partly (overview uses the rating-period seasons with an explicit selector; the «Игры» tab button still has its own definition — open); 5 partly (one finished-game rule inside the scoped block; the role-tab and Elo-history bases are untouched — open); 6 fixed in the block (ПУ/ЛХ/нулевой круг now counted over the same finished games, drafts excluded; this changes the old default numbers slightly where a draft protocol existed); 7, 8, 9, 10 open (the «Игры», «Роли» and «Elo» tabs are NOT yet scoped by the new selector; the season place table still uses its own date field). Elo stays the current rating and is not scoped.

## 2026-10-12 · UX audit pass 2A — personal game navigation and real results

**Scope before change:** `PlayerEveningsHub.tsx` mounts `PlayerHistoryStatsView.tsx` for its visible «Мои игры» tab, but that view fetches **every** club game from `GET /api/player/games/all` and labels the list «Все игры клуба»; personal results already exist in authenticated `PlayerMeResponse.games.all` and elsewhere in the deeper `CanonicalPremiumPlayerProfile` career tab. `PlayerHomeDashboard.tsx` displays the authenticated most recent game ID but its «Последняя игра» card calls `onOpenGames()` without that ID.

- **[confirmed UX failure; implementation in this branch]** «Мои игры» shows strangers' games as primary content. Make authenticated `data.games.all` the default and provide a compact, meaningful personal summary (wins/losses strip, game role, seat and game result), without changing API or player stats.
- **[keep existing feature]** Keep the original all-club archive reachable on the same screen under clearly labelled expandable «Все игры клуба», with existing GET and game-detail link behavior.
- **[confirmed navigation failure; implementation in this branch]** «Последняя игра» must use `latestGame.id` with the established `/player/games/:key` address. Browser and Telegram Back must still return to the games tab.
- **[compatibility]** `PlayerHistoryStatsView` must preserve old deep links (club/tournament), game detail and Replay; no new API writes. Authenticated personal list is not to be confused with the public archive. No Live Game layout, reward, rating, finance, Telegram, VK or database changes.
- **[verification]** Focused React tests for own-only list, old archive, deep links, Home latest-game click; CI/UI preview for mobile. Deployed screenshot and actual Amvera navigation are separate verification.

**Wider UX programme approved by owner 2026-10-12:** audit useful navigation, logic, visual clarity and motivation in mounted Player, CRM, Judge, Poker and Wallet areas; fix safe verified defects by impact, one PR per coherent area. Do not add new modules/features or polish unused components, and preserve Claude's concurrent code.

## 2026-10-12 · UX audit pass 2B — CRM unanswered card must open participant answers

**[confirmed on mounted navigation]** `OrganizerCommandCenter.tsx` «Нет ответа» builds its count from `snapshot.attention.communication` with status `unanswered`, yet navigates to `eveningSection='overview'`. `EveningWorkspace.tsx` explicitly labels `participants` as «Ответы» and mounts `EveningParticipantsView.tsx` with the RSVP dashboard and the expandable personal-contact list. This is an actual wrong-destination action, not a request for a new screen.

- **[in this PR]** Retarget only the «Нет ответа» tile to `participants`, preserving event ID and CRM routing. No changes to counts, contact eligibility, auto reminders, events, messaging or forms.
- **[regression]** Assert by rendering the mounted command-center snapshot that a click on «Нет ответа» sends `onOpenEveningSection('current','participants')`, not `overview`. Preserve payment navigation regression separately.
- **[follow-up]** The delivery-error list currently opens route overview on purpose to inspect communications. Do not conflate failed deliveries and unanswered RSVP or automatically expand contact sections from unrelated tiles.
- **[deployment]** PR/code/CI and Amvera screenshot are different states. Keep current mobile two-column action layout unchanged.

## 2026-10-12 · Participant P5 — Telegram ↔ CRM canonical RSVP end-to-end contract

**[diagnostic integration test coded, CI/merge pending]** The same evening participant is changed via the authenticated Telegram quick-response endpoint (`botRoutes.ts`) and the authorized organizer's participant PATCH endpoint (`participantRoutes.ts`). Both ultimately use `eveningParticipantState.ts`; exact game commitments use `eveningSlotPlanningService.ts`.

- **[guard added]** `src/tests/eveningCrossChannelRsvpContract.integration.test.ts` tests actual HTTP handlers with in-memory project SQLite: Telegram `going → going → late → thinking → going → declined` must mirror `response_status` and `registration_status`, select/clear exactly the correct slots, avoid duplicate organizer alerts on repeat or going→late, and queue self-service sign-up/cancellation alerts only on intended transitions.
- **[guard added]** Telegram sign-up → organizer correction to declined must clear game slots **without** generating a fake *player-originated* cancellation alert; after rejoining and organizer factual attendance mark, the bot must reject further changes with `attendance_locked`, leaving persisted response and selected slots intact.
- **[guard added]** The actual Player Cabinet `PUT /api/player/evenings/:eveningId/slots` may adjust exact games between Telegram and organizer edits; the same canonical participant ID and mirrored responses must survive all three channels without duplicate rows.
- **[audit-only]** The Telegram route currently saves a temporary coarse `going/declined` when it calls `replacePlayerSlotSelection`, then saves `late/thinking/declined` separately. This is a potential duplicate-write/race risk, but changing its transaction, outbox, rewards or synchronization scope without contract tests could break real RSVP behavior; no code change is included in this test-only slice.
- **[follow-up]** After CI evidence, decide whether a narrowly scoped single-write RSVP+slots operation is justified; independently audit the player-cabinet PUT and VK entrypoint against the same contract. Preserve auto-shortfall, financial pricing, notifications and attendance rewards unless proven by an integration test.

**No production code, schema, data, payments, UI or bot action changed.** Independent from Claude's screen/navigation and generic GET work. P1–P4 previously delivered separate read projections, SQL diagnostics and contact-status vocabulary; distinguish test evidence from runtime verification.

## 2026-10-12 · Participant P6 — VK self-RSVP attendance lock

**[implemented and verified]** PR #836 passed CI, CodeQL, Gitleaks and UI preview; squash-merged as `11fdf1c` on 2026-10-12. **Source discrepancy previously found:** The Telegram quick response route rejects edits after actual attendance or no-show has been marked (`attendance_status !== 'pending'`, HTTP 409). The VK poll reconciliation already protects attended rows, but the separate **self-service VK join form** (`vkJoinRegistrationService.ts:saveVkJoinResponse`) currently fetches an existing participant then calls the canonical response writer **without checking attendance**, so a post-check-in VK reply can overwrite a factual player's planned answer while Telegram correctly refuses.

- **Canonical owner:** add a pure `isParticipantResponseLockedAfterAttendance` predicate to existing `eveningParticipantState.ts` and let the unchanged Telegram guard call it; invoke the same predicate from the VK join service before its update. This prevents a new second, locally coded response-lock rule.
- **Preservation:** Telegram still returns its exact current 409 + `attendance_locked` code; VK should return status 409 and the same Russian human-readable message. Organizer PATCH keeps the right to correct a checked-in participant's response. VK poll's existing independent guard remains unchanged.
- **Targeted proof:** in-memory SQLite, actual `saveVkJoinResponse` with pending going/late/declined allowed, then factual attendance/no-show through the canonical writer, verifying VK updates reject and participant response/registration/attendance remain unmodified. Pure helper also tested on null/pending/no-show.
- **Out of scope:** no schema, DB migration, payment recalculation, rewards rewrite, announcements, Telegram/VK publication sync, organizer override, UI/layout, player IDs or settled-game behavior changes. Not a real-production incident claim; source behavior audit + test guard only.
- **Coordination:** independent of GPT P5 cross-channel read/write regression tests (#835) and Claude screen work; merge only green checks from current main.

## 2026-10-12 · Bug hunt: the organizer of the evening was charged on a regular evening

Scope: owner report — on the evening of 9 October the organizer played 4 games on a regular (CASUAL) evening and an accrual appeared although he had gifted himself the evening; the owner expects the organizer never to be charged. Traced through `isRegularFeeFreeByStaffRule` and its callers (`reconcileRegularEveningPayments`, the CRM label in `eveningStaffRoutes.ts`, `closedEveningPaymentService.ts`).
- **[fixed in PR, not yet merged/deployed/verified]** `src/server/services/eveningPaymentPricingService.ts`: the 2026-10-06 rule exempted only the club owner (the assigned organizer only for evenings before that date), so the assigned organizer was charged 100 ₽ per played game. Now the club owner and the organizer assigned to the evening are fee-free on regular evenings with no date limit; the judge and everybody else pay. Tests: `crmPay003R2FeeExemptions.test.ts`.
- **[open, to verify after the deploy]** The previously accrued debt of the 9 October evening is corrected only when the evening is recalculated (opening its payments or closing): an ordinary ledger adjustment, history not rewritten. Other organizers charged since 2026-10-06 change the same way.
- **[open, not investigated]** Why the manual «Подарить вечер» of the owner did not remove the accrual (possibly the gift was set on a closed evening after the debt entry); not reproduced because production data is not available here.

## 2026-10-12 · Player entity P4 — contact-status compatibility read (scoped)

**Scope audited before any code change:** `src/lib/playerUtils.ts:getCanInviteStatus`, `src/server/routes/playersRoutes.ts` list/detail/invite guard, `src/server/services/eveningAnnouncementTrackingService.ts` outreach selector, `playerTokensRoutes.ts` player-create writer, and `playerInvitationEligibilityService.ts` SQL identity/eligibility reads.

- **[fixed in P4 branch; CI/merge pending]** Four client/CRM read-and-guard points independently resolved status as `contact_status || (lifecycle_status === 'blocked' ? 'blocked' : lifecycle_status === 'paused' ? 'paused' : 'normal')`: `playerUtils.ts` and three `playersRoutes.ts` uses. Introduced pure `deriveContactStatus` in `src/lib/playerUtils.ts`; `getCanInviteStatus` and exactly three CRM call sites now use it, retaining old truthy `contact_status` priority and unknown-string behavior.
- **[open, same expression but sensitive use]** `eveningAnnouncementTrackingService.ts` has an identical expression wrapped in `String()`, but controls personal delivery. Keep this untouched this slice; no notification delivery changes under a cosmetic entity refactor.
- **[do not change]** `playerTokensRoutes.ts` writes new-player `contact_status` during creation. `playerInvitationEligibilityService.ts` SQL `COALESCE(contact_status,lifecycle_status,'normal')` is *not* equivalent for arbitrary legacy lifecycle values and affects invitation eligibility. These require separate proof.
- **[safety]** Preserve `getCanInviteStatus` `do_not_invite_until` handling, stop-attending semantics, blocked/paused invitation protection and the calculated engagement stage. No API schema, field names, SQL, payment, player IDs, notifications, UI rendering or live-game behaviour changes.
- **[tests added, CI pending]** `src/tests/playerContactStatusReadContract.test.ts` preserves original-vs-helper output across a 72-case matrix (eight contact values × nine legacy values), plus unchanged paused/blocked and date-limited invite decisions. This is *read interpretation only*, not a second persistence model.

## 2026-10-12 · Participant P3 — opt-in aggregate-only RSVP drift inspector

**[coded in branch `audit/evening-rsvp-readonly-aggregate`, CI/merge/deploy not yet verified]** Adds `src/scripts/auditEveningRsvpDrift.ts`, not mounted by the app. Requires an explicitly supplied local/host-side DB file path; opens SQLite via `better-sqlite3` with `readonly: true`, `fileMustExist: true`, and `query_only = ON`. It does **not** use application DB connection, schema ensures, bootstrap, checkpoint restore, migrations, API or cron.

- Reads only aggregate groups of stored RSVP, legacy registration, arrival, attendance and evening lifecycle. It never SELECTs, serializes or prints participant/player IDs, names, phone numbers or event identifiers. Returns only count buckets (current positive, bot count, organizer agenda count, canonical expected, pending shortfall count, analytics registration and mismatched cases), split into open/completed/other evening scopes.
- `src/tests/eveningRsvpAuditAggregate.test.ts` asserts the numeric count matrix, no identifiers in output, no changes to on-disk file bytes after an explicit read-only inspection and a failure on a missing file.
- **[NOT done]** No operational execution against the Amvera production database and therefore **no claim** that the synthetic conflicts exist live. Running the script requires separate authorized file access/CLI tooling, which is not available from this repository-only connector. A real production read (if permitted) should be performed by an authorized operator using the runbook, only counts reported, and no player records copied.
- **[next, high-risk]** Decide intended semantics for organizer outreach vs current RSVP only after the real count census and approval; analyze automatic shortfall/cancellation, financial pricing, Telegram/VK notifications, and legacy migrations individually. Do not “fix” them by replacing unrelated SQL predicates with one global `isActive` filter.
- **[coordination]** Claude's independent #818–823 code, docs and audit work remains untouched.

## 2026-10-12 · Participant P3 — opt-in aggregate-only RSVP drift inspector

**[coded in branch `audit/evening-rsvp-readonly-aggregate`, CI/merge/deploy not yet verified]** Adds `src/scripts/auditEveningRsvpDrift.ts`, not mounted by the app. Requires an explicitly supplied local/host-side DB file path; opens SQLite via `better-sqlite3` with `readonly: true`, `fileMustExist: true`, and `query_only = ON`. It does **not** use application DB connection, schema ensures, bootstrap, checkpoint restore, migrations, API or cron.

- Reads only aggregate groups of stored RSVP, legacy registration, arrival, attendance and evening lifecycle. It never SELECTs, serializes or prints participant/player IDs, names, phone numbers or event identifiers. Returns only count buckets (current positive, bot count, organizer agenda count, canonical expected, pending shortfall count, analytics registration and mismatched cases), split into open/completed/other evening scopes.
- `src/tests/eveningRsvpAuditAggregate.test.ts` asserts the numeric count matrix, no identifiers in output, no changes to on-disk file bytes after an explicit read-only inspection and a failure on a missing file.
- **[NOT done]** No operational execution against the Amvera production database and therefore **no claim** that the synthetic conflicts exist live. Running the script requires separate authorized file access/CLI tooling, which is not available from this repository-only connector. A real production read (if permitted) should be performed by an authorized operator using the runbook, only counts reported, and no player records copied.
- **[next, high-risk]** Decide intended semantics for organizer outreach vs current RSVP only after the real count census and approval; analyze automatic shortfall/cancellation, financial pricing, Telegram/VK notifications, and legacy migrations individually. Do not “fix” them by replacing unrelated SQL predicates with one global `isActive` filter.
- **[coordination]** Claude's independent #818–823 code, docs and audit work remains untouched.

## 2026-10-12 · Screens-and-paths audit (owner request): usefulness of each page and where each button leads

Scope of pass 1: the main flows of the Organizer CRM and the Player app, read-only. **NOT yet audited (pass 2, still open):** Player — Poker, Wallet (Оплата / Магазин / Ставки / История), Settings, «Ведение» (conduct) and their sub-screens; CRM — the «Ещё» subscreens (Данные, Ставки, Оплата и поддержка/Commerce, Telegram, Развитие, Обучение, Уровни и роли, Музыкальная база, Система, Оформление), tournament panels, EveningGamesView tap-by-tap, TasksCRM, the profile/Players detail card; legacy `EveningOverviewView` / `EveningParticipantsWorkboard` are not mounted (confirmed by imports). Ratings are 1–5 for how useful and interesting the page is. Nothing below is fixed yet unless marked.

**Organizer CRM — the owner's «Оплата» bug (FIXED in fix-order step 1, CI/merge/deploy to verify)**
- Step 1 done: `payments` is now an evening section (`/admin/evenings/:id/payments`, shown under «Вечер»); the Сегодня tile «Не оплачено», the previous-evening debts arrow, the agenda «К оплатам» and the route step «Оплаты» open it directly; `EveningPaymentsPanel` shows two blocks «Не оплатили» (first) and «Оплатили» with counts and sums plus «Без оплаты», while a search or the chip filters keep one flat list. Still open from the list below: the «Закрытие» tiles do not work before closing.
- Root cause: the evening router has no `payments` destination. `EveningSection` (`crm/EveningWorkspace.tsx:10`) and `EVENING_SECTIONS` (`crm/organizerRouting.ts:24`) list only overview/participants/games/management/tables/closeout; `payments` exists only as a local sub-pane of `EveningManagementView`, and `initialPane` is passed only for `tables` / `closeout` (`EveningWorkspace.tsx:88`). Every payment entry point therefore lands on «Состав» or «Маршрут».
- Wrong entry points: «Не оплачено · этот вечер» tile (`OrganizerCommandCenter.tsx:274` → `management`); «Долги с прошлого вечера» arrow (`:396` → evening `overview`, i.e. «Маршрут»); agenda «Долги за вечер» → «К оплатам» (`server/services/clubOrderService.ts:322` → `management`); route step «Оплаты» (`server/services/eveningRouteService.ts:224` → `closeout`, which only lists debtors). The «Собрано ›» / «Долги ›» tiles of «Закрытие» do open the payments pane with a filter, but only after the evening is closed, and the pane is local state (no URL, a reload returns to «Закрытие»).
- Fix points: add `payments` to the section types (client and `RouteTarget` on the server), pass `initialPane` for it, show «Вечер» as active, retarget the four entry points, optionally a filter in the path.
- `EveningPaymentsPanel` today: one flat list with chips «Все / Оплатили / Не оплатили» and search; fields for a split exist (`payment_status`, `amount_due`, `amount_paid`, waived/free flags). Two columns do not fit a 390 px phone well (10–11 px text): propose two stacked blocks or two tabs «Не оплатили (N · сумма)» / «Оплатили (N · сумма)» with a «Освобождены» footer.
- Other CRM navigation defects (open): tile «Нет ответа» opens «Маршрут» instead of «Ответы»; `onOpenEveningAdd` is never forwarded to the command center (dead add flow); the dead branch in the «Идёт сейчас» card; `MORE_SCREENS` still lists a stub `tournaments` screen; `onOpenPlayerCard` is a no-op for event hosts; the player card's return context restores the evening section but not the «Вечер» sub-pane; «Закрытие»/«Оплата» are invisible on the evening tab bar (they hide inside «Вечер»); `ARCHITECTURE.md` §7–8 still mention the legacy panels.
- CRM ratings: Маршрут 5, Закрытие 4.5, Сегодня 4, Дела 4, Игроки 4, Игры 4, Аналитика 4, Состав 4, События 3.5, Ответы 3.5, Оплата 3, Ещё 3 (plain menu), На этой неделе 3, TasksCRM 2 (duplicates «Дела»).

**Player app (open)**
- «Вечера → Мои игры» (`PlayerEveningsHub.tsx:59` → `PlayerHistoryStatsView`) is the flat list of ALL club games (`/api/player/games/all`), not the player's own games; the personal list is two levels deep in «Прогресс → Карьера → Игры». Home «Мои игры» (`PlayerHomeDashboard.tsx:289`) and «Последняя игра» (`:294`) both open that club list; «Последняя игра» does not open the game although its key is available.
- `PlayerEventSlotDetail.tsx:222` «needsFirstApplication» button calls `onBack` (opens the calendar, not the application) — to check. The first-application flow is duplicated on Home and in the calendar. «Обучение» has three entry points; the profile «Карьера» top tab opens «Игры»; «Игра в цифрах» is hidden in a collapsed «Подробная статистика»; the replay link in the club-game detail is a plain `<a href>` (full page load, `club:` keys only), while the live-evening center (`PlayerLiveCenter.tsx` :249, :256, :263) navigates to `/player/replay/...` in-app, so Replay has two different link styles and two entry points; the «Моя динамика Elo» button is hidden inside «Сообщество → Рейтинг».
- Games history is plain text (rating 1 for the club archive, 3 for personal game cards and the game detail). Richer screens already exist: «Прошедшие» 4, Replay 4, Elo journey (SVG curve) 5, awards showcase 5.
- Data already loaded and unused as graphics: per-game role/seat/result for a win-loss strip and seat heatmap, `roleCounts` (role donut), red/black split, streaks, season place, «Игра в цифрах», Elo events (curve per role/team, biggest rise/fall), evening summaries (Elo delta per evening), winner/format/judge on every archive row (colour-coded red/black rows).
- Player ratings: Elo journey 5, awards 5, «Прошедшие» 4, Replay 4, Home 3, calendar 3, rating 3, directory 3, connections 3, game detail 3, Мои игры 1, settings 2.

## 2026-10-12 · Participant entity P2 — cross-surface RSVP SQL contract matrix

**Status: contract tests merged to main in #827 (2026-10-12, commit `176cafa`), all four checks green; no production data read.** After participant read-model PR #822 merged (commit `8c0ff5e`), this audit scopes the *next* cause of disagreement: several mounted server reads have different interpretations of one persisted RSVP. No production data were accessed or changed.

- **[verified source difference; behavior not changed]** `src/server/services/organizerAgendaService.ts:absenceItems` treats `response_status IN (going,late)` **OR** `registration_status IN (going,late,registered,confirmed)` as an upcoming positive registration. An explicit `response_status='declined'` or `'unanswered'` combined with stale `registration_status='registered'` is therefore still considered positive **by this query**, although `getEveningResponse()` maps it to declined/unanswered. This can alter who is omitted from return-to-club outreach, but real production prevalence remains unmeasured.
- **[verified source difference; behavior not changed]** `src/server/routes/botRoutes.ts:/evenings/open` counts only raw `response_status IN (going,late)`. `src/server/services/eveningShortfallService.ts` also counts only that canonical pair when deciding which pending participants require attendance reconciliation before a potentially cancelling action. Legacy `registration_status='confirmed'` or waitlist+late can be interpreted positively by the canonical compatibility adapter but not these SQL reads. **Do not modify auto-cancellation until historical-row prevalence and safety tests are known.**
- **[verified metric distinction; behavior not changed]** `clubAnalyticsService.ts` `totalRegistrations` additionally includes factually `attended` or `no_show`, and excludes explicit `declined`; that metric is not inherently equivalent to bot audience, planned RSVP or pending closeout obligations. Different metric intent must be clarified before any consolidation.
- **[implemented, diagnostic tests only]** `src/tests/eveningRsvpCrossSurfaceContracts.test.ts` seeds nine synthetic participants in the project's real in-memory SQLite schema: canonical going/late, explicit unanswered+stale registered, declined+stale registered, two legacy-positive pairs, an arrived walk-in, no-show and thinking. It verifies canonical `getEveningResponse`, organizer working roster, closeout pending obligation, game-seat eligibility and SQL policy **snapshots** for agenda, bot, shortfall and analytics. SQL clauses are copied from source into the test, rather than refactoring source SQL: this is a recorded divergence to investigate, NOT an assertion that all query scopes should match.
- **[next, approval and evidence needed]** Read-only aggregate check of real *persisted* legacy/current RSVP combinations on Amvera, with no player names or IDs and no writes; compare only affected evenings and determine whether values are genuinely stale. Then choose explicit per-context policies, update integration tests against the *actual* callers, and refactor one server reader per PR; review player/organizer notifications and cancellation separately from analytics. No SQL normalization, ledgers, fees, avatars, database migrations, outbox, game state or UI changes in this PR.
- **[parallel work]** Claude's shared date/role/server team and `getJson` helpers from #818–820 are intentionally left untouched. The participant entity P1 #822 is already merged; no duplicate PR or branch edits.

## 2026-10-12 · Participant entity P1 — CRM read projections (owner-approved architecture programme)

**Status: coded in `refactor/participant-entity-projections-rebased`; PR CI/merge/runtime pending.** Replacement for green-but-conflicted #817, rebuilt from newer `main` containing Claude's architecture PRs #818–820. This work does **not** replace or repeat those helpers.

**Owner chain:** persisted `evening_participants` -> `src/server/services/eveningParticipantState.ts` (writes, response/attendance normalization, reward reconciliation) -> `src/lib/eveningResponse.ts` and `eveningDomain.ts` (reading legacy/current facts) -> multiple CRM projections. Game-slot selection uses `eveningSlotPlanningService.ts`, while format-specific fees are separate. Do not introduce a second persistence owner.

- **[implemented; verify in PR]** `EveningActiveRosterView.tsx` duplicated the organizer working-roster predicate: excludes `no_show`, includes `attended`, and otherwise admits RSVP `going`, `late` or manually-added `unanswered`. Shared read-only `isInOrganizerWorkingRoster` now owns the exact old interpretation.
- **[implemented; verify in PR]** `EveningCloseoutPanel.tsx` duplicated the canonical positive RSVP check. It now uses existing `isAttendingResponse` and new `needsEveningCloseoutAttendance` (strictly pending + positive response), preserving the existing derived closeout groups and behavior.
- **[tests]** `eveningParticipantView.test.ts`: all five RSVP statuses × pending/arrived/no-show, legacy confirmed/waitlist/cancelled, deliberate `unanswered` with stale `registration_status='registered'`, and walk-in semantics. Explicitly distinguishes working-roster membership from game-seat eligibility.
- **[critical separation]** An unanswered manual participant can appear in CRM but is not necessarily eligible for automatic seating. A walk-in can be factually present without ever giving a positive RSVP. Being expected for payment is format-dependent and separate from both. Do not collapse these checks into one `isActive` boolean.
- **[open; audit and tests before modifying]** `eveningSlotPlanningService.ts`, `eveningPaymentScope.ts`, analytics, judge assignment, bot notifications and other routes have different legacy RSVP fallbacks. Claude's 2026-10-12 architecture audit describes the drift. Avoid broad server, payment or bot changes until per-surface contracts and persisted legacy rows are verified.
- **[coordination]** GPT scope: CRM participant read selectors + ownership docs only. Claude already owns shared date/plural/role helpers, `clubGameTeams.ts`, and `requestJson.ts`. Never edit another agent's branch or overwrite a newer documentation snapshot.

**Non-goals:** no DB/schema/ID, player records, server writes, ledger, reward, slot mutations, CSS/JSX, Live Game or notification logic. Merge only on green required CI for exact SHA; Amvera verification separate.

## 2026-10-12 · Architecture audit round 2: entities, labels/formats, data loading (three read-only sweeps)

Scope: grep-based sweeps of `src/components`, `src/lib`, `src/server`, and the Python bot (mounted-ness was checked by import chains only for the display helpers). Nothing below was changed unless marked fixed. Programme and queue: `docs/PROJECT_STATE.md`.

**Display helpers (label / format duplicates)**
- **[fixed, phase 4]** Identical Moscow date helper in `PlayerGameCard.tsx` and `PlayerProfileContentBase.tsx` → `formatPlayerGameDate`. Identical Moscow date-time helper in `PlayerPayments.tsx` and `PlayerJudging.tsx` → new `formatPlayerGameDateTime` (same file). Plural copies in `StaffWorkStats.tsx` and `PlayerActivityCard.tsx` → `russianPlural`. Role-label leftovers in `EveningGameProtocolModal.tsx` («Не выбрана») and `PlayerStoriesPanel.tsx` («—») → `getPlayerGameRoleLabel` with the same fallbacks. `architectureSharedHelpersEquivalence.test.ts` keeps the old implementations and proves equal output (dates, counts 0–500, roles).
- **[open, safe, next]** `TasksCRM.tsx` (`fmtDue`, «Без срока» for null and invalid), `PlayerTokenLedgerCard.tsx` and `PlayerRatingPeriods.tsx` (no null branch; an empty string differs) can reuse the date helper only with a fallback argument; `PlayerEconomy.tsx` `formatDateTime` (empty string differs). `lib/guideCatalog.ts` `pluralRu` is a second plural owner. Role dictionaries still separate: `BettingAdminCRM.tsx`, `PlayerEconomy.tsx` (unknown → «Мирный», keep), `LiveBroadcastOverlay.tsx`, `lib/tournamentRoleValidation.ts`, `PlayerRatingPeriods.tsx` (alias normaliser, a superset: do not replace).
- **[do not unify, intentional]** Evening format labels (`eveningFormat.ts` vs `EveningTablesView`, `RatingPeriodsCRM` «Для отдыха» vs «Клубный», `OrganizerEventsCalendar`); attendance/response wording of `PlayerEveningWorkspace` vs `JudgeGameLauncher` (player vs judge voice); payment status wording (evening vs tournament, organizer vs player voice); tournament lifecycle wording (CRM vs player); money: `PlayerPayments` truncates, `OrganizerCommandCenter` allows negatives, token formatters have no «₽». About 110 `Europe/Moscow` formatters differ in format and fallback by design.
- **[not a target]** Unmounted legacy: `EveningOverviewView.tsx`, `PlayerProgressionPanel.tsx`, `EveningParticipantsWorkboard.tsx`.

**Entities and duplicated rules (the real risks; document only until the owner decides)**
- **[open, behaviour risk]** «Expected / going» is computed differently by layer. Canonical `eveningDomain.ts` / `getEveningResponse` folds legacy `registration_status` into the response; `clubAnalyticsService`, `organizerAgendaService`, `playerJudgingRoutes`, `eveningStaffRoutes` also OR in `registration_status`, while `noviceService`, `eveningSlotPlanningService`, `eveningShortfallService`, `botRoutes` and the bot's `organizer_notifications.py` use `response_status` only. Old rows are counted in some views and not in others. Unifying would change counts, reminders and judge assignment for old data: needs the owner's decision and a data check first.
- **[fixed, slice B]** The byte-identical team-by-role and winner-label copies (`eloRatingService`, `playerEloHistoryService`, `tournamentGameTokenSettlementService`, `clubGameTokenSettlementService`, `ratingPeriodStandingsService`) now use `services/clubGameTeams.ts`; `clubGameTeamsGolden.test.ts` pins old vs shared output. The other copies below stay separate until the owner decides on alias differences.
- **[open, behaviour risk]** Role/team normalisers are re-implemented 10+ times with different alias lists (`clubGameProtocolService`, `playerProfileService`, `playerAchievementsService`, `bettingPoolService`, `clubGameAnalyticsService`, `ciHelper`; team mappers in Elo, Elo history and both token settlements are identical). Unusual spellings («красный» vs «red», «ё») could score differently in Elo, profile stats and betting. Safe first step: golden tests that pin every copy, then merge only the byte-identical Elo/token team mappers.
- **[open]** `bettingPoolService` infers the winner by substring match on `winner_team`, while `clubResultData` / `clubGameProtocolService` accept only exactly red/black.
- **[open, documented]** The «open evening» filter (`status IN ('published','active') AND settled_at IS NULL`) is copy-pasted in about 15 services/routes with variants (`publicLiveRoutes` uses `('published','draft')`, `playerInvitationEligibilityService` a −6 h window). Attended counting differs in what else it requires (`status='completed'`, `settled_at`). A shared SQL constant only where the text is identical is a safe candidate.
- **[open, safe]** `contact_status` fallback from `lifecycle_status` is computed in five places (`playerUtils.ts`, `eveningAnnouncementTrackingService`, `playersRoutes` ×3, `playerTokensRoutes`); `deriveContactStatus` already exists. `api.ts` documents that `lifecycle_status` in lists is computed while `stored_lifecycle_status` is the raw value (same name, two meanings).
- **[open, safe]** Client types re-declared locally: `Player` (`types.ts` vs `api.ts` vs CRM panels), `EveningParticipant`, `Game`, `TokenEntry` vs `TokenLedgerEntry`. Poker and mafia tournaments are two unrelated `Tournament` shapes.
- **[open, high risk]** The Python bot keeps its own RSVP sets and its own `users.tokens` writes (`database.py`, `jetoni.py`); whether they can drift from the Node ledger is not confirmed. Payment scope and `payment_status` checks are inline in several services.

**Data loading and errors**
- **[open]** 249 hand-written `fetch(` calls in 122 component files: 164 identical `.json().catch(() => ({}))`, 144 `if (!response.ok) throw new Error(body.error || '…')`, about 67 `setError(x?.message || '…')` and 52 hand-rolled cancellation flags (4 use `AbortController`). Two shared clients exist (`api.ts` `request`, `clubGamesApi.ts` `request`) with different error shapes; `AsyncState` is presentational only. No cache or invalidation: the same endpoint (`/api/player/payments`, `/novice`, `/me`) is fetched by several screens and a write on one is not seen by the others until remount; silent `ok ? json : null` GETs show «no data» on failure; polling has no in-flight guard in most places.
- **[fixed, slice C start]** `src/lib/requestJson.ts` (`getJson`, same error semantics as `clubGamesApi`, per-call Russian fallback text) added with tests; migrated: the two GETs in `PlayerHistoryStatsView`.
- **[fixed, slice C2]** All identical `fetch → json().catch → if (!ok) throw new Error(body.error || '…')` read-only GETs in `src/components/player/*` now use `getJson` (14 files; mechanical, texts unchanged). Kept on plain `fetch` on purpose: the 4-second betting poll in `PlayerEconomy` (`/api/player/bets`) and `TournamentLiveGameModal` (live game), per the polling/live-game exclusion below. **[open]** The same pattern in CRM components (`EveningPaymentsPanel`, `EveningRouteView`, `EveningStaffCard`, `LearningActivityCRM`, `NoviceDevelopmentCRM`, `SystemStatusCard`, ...) and the silent `ok ? json : null` reads (`PlayerHomeDashboard`) need a quiet variant first.
- **[do not migrate without race tests]** Writes in the payment/closeout panels, wallet, economy purchase and bets, robokassa, custom-event create + invitations, start-time editor; all polling and live-game code; `credentials: 'same-origin'` sites keep their option.

## 2026-10-11 · Architecture unification phase 3 — game record presentation

Scope: confirmed mounted consumer analysis of `PlayerGameDetail.tsx`, `PlayerHistoryStatsView.tsx` and `EveningGamesView.tsx`; distinguish display-only commonality from protocol/game-rule ownership. All observations read from current `main` after phase 2 (#814).

- **[fixed in phase-3 branch; verification pending]** `PlayerGameDetail.tsx` duplicated all four Mafia role labels already centralized in `src/lib/playerGameRoleLabels.ts`, but has a distinct missing/unknown fallback `Роль не указана`. Reuse shared known-role dictionary and preserve this fallback exactly.
- **[fixed in phase-3 branch; verification pending]** `EveningGamesView.tsx` duplicated the same four known-role labels inline inside the organizer game-result seat list, with fallback `—`. It is not the live-game engine: only the text expression, with the same fallback, should change; do not touch seat geometry, role counts, protocol state or controls.
- **[fixed in phase-3 branch; verification pending]** `PlayerGameDetail.tsx` and `PlayerHistoryStatsView.tsx` independently implemented exactly the same `formatDate` formatter (Moscow timezone, day 2-digit, abbreviated month, full year, null → `Дата не указана`, invalid date → raw input). One small pure function can own this invariant; keep both existing component layouts unchanged.
- **[fixed in phase-3 branch; verification pending]** `PlayerGameDetail.tsx` and `PlayerHistoryStatsView.tsx` had identical red/black winner labels but intentionally different null labels (`Результат не указан` vs `Результат`). Common `getPlayerGameWinnerLabel()` supplies only known winners; wrappers retain their different null fallbacks exactly; test covers both.
- **[not a target]** `EveningParticipantsWorkboard.tsx` has duplicate `money`/plural helpers, but architecture docs mark it unmounted legacy; do not refactor for the sake of churn without tracing a live import. `PlayerEveningSummaries.tsx` has a local image-URL avatar with hide-on-error semantics; `ui/PlayerAvatar.tsx` is a player-ID loading/caching component, not a drop-in replacement.
- **[higher-risk, audit only]** `EveningCloseoutPanel.tsx` and `EveningPaymentsPanel.tsx` call distinct endpoints with different write/optimistic refresh behaviour. Do not replace their fetch/write flows with one common hook without authorization and integration/race tests.

Acceptance: no CSS/server/API/database/ledger/schema/game state changes; no changes to JSX structure or seat geometry; exact output for four roles, both winner teams, missing/unknown fallbacks and null/invalid/valid dates; focused unit tests + CI and UI preview; separate merge/deploy verification.

## 2026-10-11 · Architecture unification / reusable logic (owner-approved, phase 1)

Scope: first focused read-only pass over `docs/ARCHITECTURE.md`, `docs/DESIGN_SYSTEM.md`, `docs/FEATURE_MAP.md`, `src/lib/eveningResponse.ts`, `src/lib/eveningDomain.ts`, and selected Player/CRM entrypoints. This is **not** a completed repository-wide audit. Keep deeper findings in this log before changing their owners. The programme and ordered queue live **only** in `docs/PROJECT_STATE.md`.

- **[fixed and merged in #810; deploy unverified]** `PlayerHomeDashboard.tsx`, `PlayerEveningSummaries.tsx`, `PlayerReplayScreen.tsx`: the four Mafia role labels were independently implemented three times with deliberately different fallbacks (null / raw role / dash). Moved the common role vocabulary to `src/lib/playerGameRoleLabels.ts`, retained each caller's prior fallback, and added `src/tests/playerGameRoleLabels.test.ts`. No JSX, styles, server routes, DB or migration changes.
- **[fixed and merged (phase 2); deploy unverified]** `EveningActiveRosterView.tsx`: local `responseLabel()` independently translated all five RSVP statuses even though canonical `getEveningResponse()` already handles current/legacy persistence. The CRM intentionally differs in two labels («Не буду» / «Нет ответа» vs canonical «Не иду» / «Не ответил»). Added `EVENING_ROSTER_RESPONSE_LABELS` as a shallow override in `eveningResponse.ts`; the roster and inactive-player label reuse it without markup or wording changes. Added `eveningRosterResponseLabels.test.ts` for five states and key legacy fallbacks. No attendance filtering, payments, RSVP writes, server routes or DB touched.
- **[fixed and merged (phase 2); deploy unverified]** `EveningPaymentsPanel.tsx` and `EveningCloseoutPanel.tsx`: identical `money(value)` presentation-only expression moved to `src/lib/formatRubleAmount.ts` (aliased to the old local name to leave JSX untouched). `formatRubleAmount.test.ts` covers zero, thousands, rounding, negatives and NaN. No pricing, payment arithmetic, ledger or DB changes.
- **[intentional distinction, do not bulk unify]** `EveningActiveRosterView.tsx` includes manual unanswered participants in the organizer's working roster, whereas `eveningDomain.ts`'s `isEveningGameRosterEligible` only admits expected or arrived participants; these have different purposes. `eveningPaymentScope.ts` also has format-dependent scope; it is NOT equivalent to either roster and must not be replaced by a generic `isActive` check.
- **[audit candidate, no change]** `PlayerHomeDashboard.tsx` and `EveningsList.tsx`: independent Moscow date/display formatting. Audit all usages and format requirements before any shared helper; different contexts may rightly use different precision.
- **[audit candidate, no change]** `PlayerEventsCalendar.tsx` and `PlayerHistoryStatsView.tsx`: independent `fetch` + response/error parsing. Inventory endpoints, caching and permission boundaries before considering common query/error handling. Do **not** introduce a global cache without invalidation design.
- **[already centralized / do not rebuild]** `src/lib/eveningDomain.ts`, `src/lib/eveningResponse.ts`: canonical RSVP and attendance normalization. Existing services already own pricing/ledger/slots; proposed cleanups must reuse those owners rather than copy business rules.
- **[high-risk boundary, no change]** `LiveGameEngine.tsx` + its split models and CRM/live-game CSS: investigate responsibilities and test seams only after low-risk stages; never casually extract seat markup or change state persistence/timer/vote rules.

Acceptance for this phase: changed screens produce the same Russian labels for known roles and the same prior fallbacks for unknown values; no visual or data-layer modifications. Focused tests + TypeScript + required PR CI should gate merge; browser visual proof is needed for any later JSX/CSS change. Production DB/player identities must never be reset, bootstrapped from a checkpoint, or mutated as part of this programme.
## 2026-10-11 · Poker bots «thinking» time (server stalls, owner report)

- [fixed] `pokerHandRank` ranked every five of seven cards (21 combinations, arrays and sorts) and was about half of a bot's decision time; the equity estimate also filtered the whole range with a Set lookup on every simulated run. Now one pass over the cards (`handRank` in `pokerEngine.ts`, proven equal to the old `slowPokerHandRank` on 120,000 random hands) and a flat flag array in `estimateEquity`; the estimate is identical for the same random numbers (150 seeded scenarios compared with the old code) and about 3 times faster (68 → 17–23 ms per call here).
- [open] Not proven to be the only cause of the multi-second stalls on the server; if they come back, `/api/health/performance` after the stall tells where the time went (`docs/RUNBOOK.md`). The bots still think on the main thread; moving them to a worker thread stays an option.

## 2026-10-11 · «Ведение» / тестовая игра / обучение судьи (owner request: one clear scheme)

Scope: every way to conduct a real game, a test game, or practise as a judge; who can open each. Method: read-only sweep of `src/components/player`, `src/components/crm`, `src/components/public`, `src/lib/guideCatalog.ts`, test-environment routes, docs. Scheme agreed with the owner 2026-10-11 («Обучение» = practice; the cabinet «Ведение» = real conducting; CRM = the organizer's side of the same games). Step 1 built (see below); the learning statistics are step 2.

- [fixed, step 1] One button «Ведение» (`PlayerQuickAccessBar.tsx`, shown when `judge_level !== 'none'`, `PlayerCabinetShell.tsx:72`) opens `PlayerConductCenter`, which mixes four things: a real club game (`JudgeGameLauncher` → `EveningLiveGameModal`), a test game (`JudgeTestGameModal`, sandbox in localStorage), the judge's assignments (`PlayerJudging`, club and tournament games) and music (`JudgeMusicPlaylist`).
- [open] The same engine is reachable from the CRM (`EveningGamesView` «Провести игру в движке», `TournamentDetailViewBase` «Вести игру (движок)») and from the player cabinet; nothing is wrong with that, but the entries are named differently.
- [fixed, step 1] `JudgeTestGameModal` has two modes behind two doors: «Тестовая игра» (cabinet «Ведение», no hints, not saved) and «Учебная партия» (`/guide?tab=judge-conduct`, `JudgeConductTraining`, with the coach hints). The first is not reachable from «Обучение», the second only through a link to the public guide; the result of neither was recorded (no progress, exam or achievement).
- [fixed, step 2] The reasoning school kept its progress only in the player's browser and the judge trainer recorded nothing; finished tries are now saved on the server and shown in the CRM (see PROJECT_STATE).
- Step 1 result: the guide page `/guide?tab=judge-conduct` (reached from «Обучение») offers both the guided training game and the free test game; the cabinet «Ведение» keeps the real club game, the judge's assignments and music, and links to «Обучение» for practice; the header «Ведение» button is shown to judges with a mark and to organizers.
- [fixed, step 1] An organizer or club owner with `judge_level = none` does not see the «Ведение» button (can open it only by URL), although the screen lets them into the test game and music; a new trainee judge sees the launcher but not the music.
- [open] The word «тест» means three different things: the test game, the CRM «[TEST] Тестовый режим» for developers, and the password-protected test copy of the app.
- [fixed, step 1] `PlayerLearningBlock.tsx` promises «практика ведения клуба» but links to one public guide page.

## 2026-10-10 · App-wide wording audit (owner request: no rule-book language, plain words)

Scope: ~420 long Russian sentences across `src/components` (player 108, public 63, CRM 227, live game 16) plus player-facing server texts (`playerInsightsRoutes`, `playerPulseRoutes`, `playerStoriesRoutes`, `playerReplayRoutes`, `playerPaymentRoutes`). Read the player and public sets in full, the CRM set by keyword.

- [fixed] 28 rule-book / developer-speak phrases rewritten in plain words: game-number footnotes, payments («Интерфейс и назначения платежей уже разделены…»), Elo journey, achievement paths, progression, replay disclaimer, invite suggestions, award suggestion, privacy note, betting hints, live-center and evening hidden-roles lines (unified «Роли и проверки откроются после игры.»), judging mode note, onboarding, public join, server insights («п.п.», «Выраженная ролевая разница»), pulse/stories/replay/payment captions, and CRM texts («Серверный адаптер публикации готов», «Никакой курс автоматически не придуман», «через журнал жетонов», «канонические статистические критерии»).
- [fixed 2026-10-10, owner: «avoid ты/вы where possible»] Mixed address form (onboarding, events calendar, judge screens, guides, VK sign-in errors used «вы»; profile, live center, trainers used «ты», some with gender-bound past tense like «ты записан»). ~180 phrases in `src/components/player` and `public` rewritten impersonal / first-person (statuses now mirror the answer buttons: «Иду», «Приду позже», «Пока думаю», «Не иду»). Rule recorded in `docs/DESIGN_SYSTEM.md` («Wording and voice»). Not touched: organizer CRM and OBS setup pages (operator-facing), the Telegram bot texts (still «ты» in places) — sweep next if wanted.
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

## 2026-10-09 · Robokassa deployment-state reconciliation

- Scope: document review of the verified provider-test milestone and owner-supplied SMZ screenshots; no runtime or production-data changes.
- [fixed in PR] `docs/PROJECT_STATE.md`: canonical Live deployment field still limited live code to September PRs, contradicting the verified PR #760 test flow. Replace it with scoped evidence and mark the September handoff historical; retain unverified live settlement/receipt limits.
- Validation: exact committed documentation diff; provider success is owner-reported, SMZ activation/partner authorization are visible in supplied screenshots, and health/configuration checks were separately observed.

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

## 2026-10-11 · Poker freezes of 5–10 s and slow database loading (owner report)

Scope: the poker request path (`pokerRoutes.ts`, `pokerPersistenceService.ts`, the bots), the shared SQLite connection (`src/db/index.ts`), and the caches of the player analytics (`clubGameAnalyticsService.ts`, `playerEloHistoryService.ts`). There is no access to the production server or logs from here, so every number below is measured on a synthetic database (400 club games of ~30 KB, 10 bots tables) and proves a mechanism, not the production time.

1. HIGH `fixed (this change)` — the cache of the completed-game snapshots is useless while anybody plays poker. `loadCompletedGameSnapshots` is read by a dozen player-cabinet screens (pulse, stories, insights, progression, connections, evening summary, notifications, scouting, public live) and parses the protocol of every club game; its cache key was `sqliteReadVersion` = `total_changes()` of the one shared connection, so every write to ANY table (a poker save after each action, token ledger, chat, a notification row) dropped it. Measured: a cold or invalidated read costs 60–120 ms for 400 games, a cached one 0 ms, and one unrelated write is enough to invalidate. The parse is synchronous, so it stalls everything else, poker included. Fix: the cache is keyed by a version counter that database triggers raise only when the real inputs change (games, evening title/date, tournament games/seats/participants, player nicknames); a poker or wallet write leaves it alone.
2. MEDIUM `open` — the bots think inside the polling request. Measured with 10 bot tables: p95 205 ms, event-loop stall up to ~500 ms, poker code takes ~30% of one CPU; with 25 tables the requests wait over a second. Every poker request of every table also waits in one queue (`withPersistedPokerRuntime`) and in the single database transaction queue. Not a 5–10 s freeze by itself on this hardware, but it adds up on a weaker server; moving the Monte Carlo into a worker thread is a larger change and is proposed, not built.
3. MEDIUM `fixed (this change)` — nothing on the server measured slow requests, event-loop stalls or long database transactions, so a freeze left no trace. Added: an event-loop and slow-request watchdog (warning in the log on a stall, aggregates for the last five minutes at `GET /api/health/performance`; requests are named by the matched route template only, because a URL can carry a secret token (claim, confirmation, broadcast links) that cannot be recognised by its shape; a request no route matched is recorded without its path), and slow-transaction timing in the database wrapper.
4. NOTE — `loadPlayerEloHistory` (the 2026-10-06 culprit) is fine on this mechanism: after an unrelated write it only recomputes a fingerprint (7 ms for 12 MB of protocols) and replays when games really changed. Its first call after a restart still replays everything, so the first request after each deploy can be slow.
5. NOTE — the cause of the owner's 5–10 s is NOT proven. If it continues after this change is deployed, `GET /api/health/performance` (right after a freeze) shows whether the event loop stalled, which requests were slow and which transaction held the queue.

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

### 2026-10-10 — Mafia shooting himself on night 1 had no ЛХ step

- **Reported (owner):** when the mafia killed one of its own on the first night, the game skipped the best-move (ЛХ) step, which revealed the victim as black.
- **Defect:** `canRegisterFirstKilled` (`src/lib/liveVoting.ts`) accepted red roles only, so the engine did not register a black first killed; both save paths (`validateFirstKilled` in `tournamentProtocolRoutes.ts`, club canonicalization) also rejected it.
- **Fixed:** any first-night victim now goes through ЛХ and may skip it. Black best moves are dropped at save (`blackBestMoves.ts`) so no score, Elo or token calculation pays them; Ci stays red-only. Status: fixed.

### 2026-10-10 — Betting with a single bettor, and a short bet window

- **Reported (player via owner):** a lone bettor lost 50 on a lost bet but got 0 net on a won bet; the bet window (90 seconds) was too short.
- **Defect:** `settleBetPool` (`bettingPoolService.ts`) paid a winner pool with no opposing stakes at coefficient 1 (stake back only) while the lost side burned its stake.
- **Fixed:** a pool with stakes on one side only is refunded in full whichever team wins; window is `BETTING_WINDOW_MS` = 8 minutes. Status: fixed.
- **Follow-up (review):** already-settled one-sided pools were skipped by the same-winner early return; the one-sided check now runs first, so the startup reconcile also returns stakes burned by the old rule (payout reversed, stake refunded). Status: fixed.

### 2026-10-09 — Wallet «Ставки» tab: navigation by DOM click, and betting blocked by the economy request

- **Scope:** the player wallet (`PlayerEconomyPanel.tsx`, `PlayerEconomy.tsx`), found while checking the betting flow.
- **Finding 1 (fixed in #770):** `PlayerEconomyPanel.tsx` switched the tab by finding a hidden child button by its label and clicking it from a layout effect (`querySelectorAll('button')` + `click()`); it broke whenever a label changed and could fire twice. The panel now passes the chosen `view` to `PlayerEconomy`, which treats it as the scope.
- **Finding 2 (fixed in #770):** the «Загрузка кошелька…» gate waited for `/api/player/economy` even on the bets tab, so a failing economy request hid betting. The bets scope no longer waits for it; `role_snapshot` is read with a default and the bets tab prefers the betting balance.
- **Test:** `src/tests/walletBettingNavigation.test.tsx` (economy request fails, bets still shown). Status: fixed, needs a deploy and a phone check. Not covered: the standalone `PlayerEconomy` without the panel keeps its own scope.

### 2026-10-11 — «Школа игрового мышления»: аудит покрытия и план обучения

- **Scope:** coverage of the five existing chapters of the reasoning school (`src/lib/mafiaReasoningCourse.ts` and the guide components) against the original goal of teaching analysis during a game; the method, levels and plan are in `docs/REASONING_CURRICULUM.md`. This is a methodology audit, not a code defect list; nothing in the live engine, scores or awards changes.
- **Findings** (original gaps identified in `docs/REASONING_CURRICULUM.md`, «Где существенные пробелы»; the owner has since approved and the first two implementations were merged in #792 and #794; remaining items require separate scoping and player validation):
  1. Fact vs interpretation: no work across several days or with an incomplete protocol.
  2. Red/black motives: no calibration of «how much did the version get stronger».
  3. Gain and team price: no mechanical comparison of alternatives, the missed win and next-round threats. *Partly addressed by the vote tree (#794).*
  4. Triples and counter-examples: no independent building of a triple without a ready answer list. *Partly addressed by the «Проверка мышления» self-check (#794).*
  5. Sheriff / false sheriff: originally missing information discipline (who learned a colour from where, compatibility of checks). *Scenario practice added in #792; more variety and validation remain.*
  6. Reading behaviour and emotions: weak; no «lie detector by gestures» by design.
  7. Fast decision and speech: almost absent (timing, the most useful question, a short argument). *Practised by «Речь и реакция» and «Следующий ход» (#792).*
  8. Measuring the real skill: *self-check without choices added in #794*, but it is not a validated exam; still needs delayed unseen control situations and review of real games.
- Mutable state (what is merged or deployed) is in `docs/PROJECT_STATE.md`, not here.

### 2026-10-11 — Open pull request sweep (stuck work of the previous assistant)

- **Scope:** every open pull request at the time (#795, #791, #770, #764, #762, #755, #712, #660), checked against current `main` before finishing or closing.
- **#764 — closed:** superseded by #765/#766 already on `main`. **#660 — closed:** the score it added was already on `main`; its remaining labels relied on a `startsWith` heuristic. Both left a comment with the reason.
- **#791, #770, #762, #755 — finished and merged:** each lacked the `AUDIT_LOG` entry or the deployment-evidence caveat the review asked for, and #770, #755 conflicted with newer `main` in the docs (resolved by keeping both sides, no history rewrite). #770 also fixes the wallet «Ставки» tab (navigation by hidden-button click; wallet gate waiting for the economy request).
- **#795 — merged** (poker tournaments in the player calendar, own work).
- **#712 (Dependabot, 16 minor bumps) — open:** its CI is from 2026-10-06 on an old base; a rebase was requested and it is merged only after a fresh green run.
- Status: fixed except #712 (open, waiting for the rebase).

### 2026-10-11 — «Школа игрового мышления»: аудит логики, механики и формулировок вопросов

- **Scope:** all five topics of the course (`mafiaReasoningCourse.ts`, `mafiaReasoningExtraCases.ts`: 42 cases, 84 steps, 57 single and 27 multiple-choice), the five practices (`mafiaReasoningLabs.ts`), the vote tree (`mafiaReasoningDecisionTree.ts`), the self-check (`mafiaReasoningDiagnostic.ts`) and `docs/REASONING_CURRICULUM.md`, checked against `docs/BUSINESS_RULES.md` (voting model, parity win, night order, wording) and `docs/DESIGN_SYSTEM.md` (voice). The arithmetic of every `VOTE_PLANS` and `TREE_SCENARIOS` entry was recomputed by hand: all outcomes are correct.
- **Logic errors (fixed in this change):**
  1. `new-info`: the 2-point answer states a cause («изменил мнение из-за проверки») that the facts did not give, only a sequence («после этого»). The facts now say that №4 named the check as the reason.
  2. Eight single-choice options scored 1 although they are wrong claims, one of them rewarding the very habit the school fights (`eyes`: keep «первое впечатление»). Also `votes` (a version offered as a record of what happened), `turn`, `new-info`, `save`, `two-options`, `sacrifice`, `counterexample`. All are now 0.
  3. `recon-speech-vs-vote`: the feedback of the first wrong answer talked about a sheriff (copy-paste error) and the third option duplicated the second. Both fixed.
  4. Four cases (`vote-history`, `favorite-team`, `recon-changed-vote`, diagnostic `protection-vs-inference`) said «после игры выяснилось» for one colour while the other roles stayed «неизвестны»; after a game every role is open. They now say that the game is over and only that colour is shown for the review.
  5. `forecast`: «хотя мог безопасно проголосовать против красного» did not fit a version where №7 himself is red; the second candidate (a red player) is now named.
  6. `trusted`: two of the three «plausible» plans were the same vote (saving №4 = voting №6); the third now is a different plan. `team-divide`: «допустить вывод напарника» was not an alternative (with two black candidates a split of the votes costs the team one of them) and is reworded. `two-options`: «раскрыл №8» stated as a fact.
  7. `motive-night`: the wrong option «Убирать только тех, кто называет чёрного №7 красным» is garbled (the opposite of the case).
- **Wording (fixed):** «убрали / убрать / убрал» for a night kill and «вывод / вывести / выведут / на выводе» for being voted out contradict the approved wording («убит», «заголосован»); imperatives («Прочитай», «Выбери», «Отметь», «Выберите тему») on a public screen contradict the voice rules in `DESIGN_SYSTEM.md`.
- **Design weaknesses (open, proposed to the owner, nothing built):**
  1. Test-wiseness: 41% of wrong options contain a certainty word («точно», «всегда», «никогда», «обязан»…) against 2% of right ones; 25 of 27 multiple-choice steps are fully solved by ticking everything except the one option with such a word. A reader who ignores the facts and avoids certainty words passes 16–24% of sessions overall and 47–58% in «Читать действия» (random guessing: 0.5%); measured by simulation on the real bank.
  2. Practice «Критический голос» (`voteCaseFromPlan`): of three answers in step 1 two are absurd («сразу заголосуют обоих», «роль станет доказанно красной»), so the count never has to be done.
  3. The labs forbid a candidate voting for himself (`calculateVoteResult`), and every scripted plan has a black candidate voting for the other candidate. **wontfix (owner, 2026-10-11):** in a critical round a black candidate would not vote for himself anyway, so the question has no practical meaning; the scripts stay.
  4. The course trains caution («ничего нельзя утверждать») far more than commitment (choose a lead, speak, vote under time); the second is only two lab cases.
- Status: logic errors and wording fixed; weakness 3 wontfix; weaknesses 1 and 2 **fixed 2026-10-11** (owner-approved rebalance): wrong answers are now plausible slips without certainty words (a few keep them, a few right answers now carry them), 11 multiple-choice steps got a second wrong option, and in «Критический голос» every answer of step 1 is a real tally (the own hand left out, the hand counted for the first candidate). Measured by the same simulation on the real bank: blind tactics pass 0–3.5% of sessions (random: 0.4%); the «avoid certainty words» tactic scores 23% of the maximum instead of 57–62%; a regression test guards the balance. Weakness 4 **fixed 2026-10-11**: new practice «Решить и высказаться» (six cases, two steps each; best answer commits on a checkable basis, a passive one scores 1, a reckless or mechanically wrong one 0). Assumption to confirm with the owner: the cases rely on the voting rule that an unspent hand goes to the last candidate and that abstaining is impossible (the same rule `mafiaReasoningDecisionTree.ts` already uses).

## GoMafia career completion — 2026-10-12
- WONTFIX CodeQL CSRF warning in `goMafiaRoutes.integration.test.ts`: isolated in-memory Supertest harness, not deployed server middleware; cookie parser exists to test signed player sessions. No production security checks are removed or analysis exclusions added.
- FIXED review `goMafiaRoutes.ts`: link metadata bypasses game_statistics privacy; apply the career visibility guard to both reads.
- FIXED review `goMafiaFederationSync.ts`: fifth initial import is dropped at capacity; preserve pending jobs and wake them when a slot is released.
- FIXED `goMafiaCareerSource.ts`: tournament game tables also publish individual points; enrich unique ID/game/seat/role matches, verified 164 scores live.
- FIXED `gomafia-career-preview.spec.mjs`: identical signed scores occur in multiple rows; scope the score assertion to the first row.
- OPEN runtime release verification: production health is ok, but runtime reports bot/Telegram fail on build 9d743183; PR #852 is not deployed. No production mutation in this workstream.
- FIXED `goMafiaPublicStatsService.ts` (replaced by `goMafiaCareerSource.ts`): HTML labels discard public Next.js ID-linked history and statistics filters; acceptance: Chagin all 13 appearances / 164 games, complete pagination.
- FIXED `goMafiaRoutes.ts`: manual nickname-row import and duplicate request refresh path; replace with shared verified-ID automatic sync.
- FIXED `PlayerGoMafiaLink.tsx`: stale career state on player changes and no yearly timeline; acceptance at 360/390px.
- FIXED upstream #855 `achievement-paths-preview.spec.mjs`: unconditional click folded an already-open statistics panel; latest main checks actual open state. Reverify focused preview.

### 2026-10-12 — Реплей игры не загружается (сообщение владельца)

- **Scope:** `GET /api/player/games/:gameKey/replay` (`playerReplayRoutes.ts`) and `PlayerReplayScreen.tsx`; entry points «Replay игры ›» (`PlayerHistoryStatsView`), `PlayerLiveCenter`.
- **Observable failure:** owner: «ни один реплей игры не могу загрузить нормально». Exact on-screen text and which account opened it are not yet known.
- **Candidate causes (from code, not yet confirmed):** (1) 403 «доступен только её участникам и ведущему» for a viewer who did not sit at the table or judge (no admin/owner exception); (2) 409 «доступен после завершения игры» when the saved protocol is not `kind=club_evening_protocol` with `protocol.status=completed`; (3) 401 for a non-player session; (4) timeline is built only from `protocol.rounds` shapes, so a live-engine game with only `events` yields a nearly empty replay.
- **Finding confirmed (fixed in the PR with the reveal statistics):** `playerReplayRoutes.ts` built the timeline only from `protocol.rounds` / `voting_rounds`; a game saved by the Live Game engine keeps `protocol.events` instead, so its replay held nothing but the final line «Игра завершена». The route now folds `protocol.events` circle by circle (nominations, reveals, votings, shots, exits, best move) via `buildGameAnalysis`; covered by `playerReplayRoute.test.ts` (also checks a participant and the judge get 200, a stranger 403, no session 401).
- Status: the empty-timeline defect is fixed; the owner's exact on-screen text (if the screen showed an error rather than a near-empty replay) is still unknown — if the problem persists after deploy, ask for the message and the account.

### 2026-10-12 — Бот не стартовал после PR #860 («/prs перестал работать»)

- **Observable failure:** after the compact `/prs` change (#860) `/prs` stopped answering and `/api/health/runtime` showed `bot: fail`, `telegram: fail` on every later build.
- **Cause (confirmed by `import main` locally):** the rewrite of `overview()` in `github_pr_notifications.py` cut the end of the file, so `prs_command` and `github_pr_notification_task` were gone; `main.py` imports the latter, the whole Python bot crashed at start. CI did not catch it: «Python bot syntax» only compiles files and the unit tests import the module, not `main.py`.
- **Fix:** the tail was restored; a regression test now asserts the names `main.py` imports exist. Status: fixed in the PR after this entry; confirm on the next deploy that `/api/health/runtime` is 200 and `/prs` answers. Open: make the CI bot check import `main.py` (not only compile it).

### 2026-10-12 — GoMafia: своя привязка осталась «ожидает», организатору ничего не пришло

- **Scope:** `goMafiaRoutes.ts` (`PUT /gomafia/me`, `bind`), `clubOrderService.ts` («Порядок в клубе»), `organizerNotificationService.ts`, CRM player card `PlayerGoMafiaLink`.
- **Owner's report:** he linked his own profile as a test; it did not become linked; the request «goes to the organizer» although he IS the organizer; no notification arrived and he does not know where in the CRM such requests are seen.
- **Findings:**
  1. `bind()` makes every self-link `pending`, even when the person who presses is an organizer (`req.userRole === 'ORGANIZER'`): an organizer cannot confirm himself without a second manual step. — fixed (the organizer's own link is confirmed at once)
  2. A new `pending` request notifies nobody: no `enqueueOrganizerNotification`, so nothing in Telegram. — fixed
  3. A pending request is not shown anywhere in the CRM (not in «Порядок в клубе», not in a list of requests): the only way to see it is to open that exact player's card. — fixed (item «Запрос на привязку GoMafia» in «Порядок в клубе»)
  4. Process cause (for the architecture audit): a new «request that needs the organizer» was built without the two things every such flow in this app has (an organizer notification and an item in the organizer's to-do list); there is no shared checklist or helper that forces them. — rule written in `ARCHITECTURE.md`; a shared helper is still open
- **Plan:** an organizer's own link is confirmed at once; a pending request enqueues the existing organizer Telegram notification and appears in «Порядок в клубе» («Запрос на привязку GoMafia»); a regression test; add the rule «every request that waits for an organizer needs a notification and a to-do item» to `docs/ARCHITECTURE.md`.

### 2026-10-12 — Игрок «Денди»: в записи на вечер сам собой ставится «Не иду»

- **Scope:** every writer of `evening_participants.response_status`: `setParticipantResponse` callers (`botRoutes.ts` quick RSVP, `playerSelfCoreRoutes.ts`, `participantRoutes.ts`, VK poll sync `vkEveningIntegrationService.ts`, `vkJoinRegistrationService.ts`), `replacePlayerSlotSelection` (`eveningSlotPlanningService.ts`), `organizerEveningSlotSelectionService.ts`, the Mini App `PlayerEventSlotDetail.tsx`.
- **Owner's report:** the player Денди complains that her registration is «automatically» set to «Не иду / не приду» again and again. Exact evening, channel (Telegram buttons / Mini App / VK) and time are not known yet; production data was not touched.
- **Code facts found (no timer or job sets «Не иду» for someone who did not answer):**
  1. `replacePlayerSlotSelection` turns **any empty list of games into «Не иду»**, and creates the participant row if there is none. Callers that can send an empty list: the Mini App «Отменить запись / Очистить выбор» + Save, the VK mini-app route (`vkJoinStateRouter.ts`), and the Telegram quick RSVP for «Пока думаю» / «Не буду» (intended). So «clearing the games» and «declining» are the same action — a probable source of surprise.
  2. A VK poll vote «Не иду» is applied as her answer and can come back on the next VK sync when her app answer equals the last applied VK status (`canVkVoteOverride`).
  3. There is **no history** of who or what changed the answer (no source, no time per change), so a report like this cannot be answered from the data.
- **Owner update (same day):** Денди says she opens the evening and it ALREADY says «Не иду» — she never pressed anything. Owner said «записывай, надо разобраться».
- **Done:** every change of the answer is now written to `evening_response_history` (previous → new status, `source`, by player or not, time) from `setParticipantResponse`; sources are named at every caller (`telegram_quick_rsvp`, `mini_app_slots`, `player_slots_route`, `vk_miniapp_slots`, `vk_poll`, `vk_join`, `player_app_answer`, `organizer_card`, `organizer_slots`, `novice_application`, `slot_selection_cleared`); organizer endpoint `GET /api/evenings/participants/:id/response-history`.
- **Status:** root cause still unknown — it will be visible from the history after the next occurrence. Still open: a screen in the CRM participant card that shows the history; and whether «clear the games» should stay «Не иду» (owner decision).

## GoMafia nomination audit — 2026-10-12 (owner request)
- FIXED `goMafiaCareerSource.ts`: profile history's observed winner flags are ignored; a tournament-read failure loses published nomination wins on initial import. Nominations are extracted before the hidden-results guard.
- FIXED `goMafiaAwardsService.ts`: insert/upsert retains an automatic award when a later authoritative source names a different winner; retained awards are not retracted.
- FIXED `PlayerGoMafiaLink.tsx`: tournament chronology does not display imported nomination wins; only the separate trophy showcase exposes them.
- Acceptance: live Chagin 13 appearances → four nomination victories (507: don; 616: red/sheriff/MVP), no awards for ranks 2/3; all five keys, hidden results and transient failures tested; corrections preserve manual and unrelated awards.

- FIXED PR #881 review `goMafiaCareerSource.ts`: malformed/duplicate published tournament lists left history winner flags available; mark nominations unavailable before award building so a contradictory payload cannot create new wins.

## 2026-10-12 · CRM / cabinet redesign — owner walk-through (collecting; nothing fixed yet)

Scope: the owner dictates what he dislikes while clicking through the organizer CRM (phone and desktop). Audit first, redesign in slices after the owner confirms. Status of every item: open unless marked. Items 1–7 fixed in the «Сегодня» slice (PR below): header block is a home button; action tiles became full-width rows; add-player shortcut removed from the overview; debts first; the `debts:<evening>` item is hidden from the «Дела» preview when the debts block shows the same evening; desktop week/agenda columns are equal and week rows are bigger.
Note for item 16: `docs/ARCHITECTURE.md` says experienced-player decisions live in «Ещё → Развитие», so the section cannot simply be deleted — rename and surface its open items as tasks instead.

### CRM «Сегодня» (`OrganizerCommandCenter.tsx`, `OrganizerAgenda.tsx`, `CRMOverview.tsx`)
1. Header «2LA noire · NEWMAFIA» (`OrganizerCRM.tsx`, ~line 302) is not a link; expected: tap goes to the home page like on any site.
2. «Нет ответа · приглашённых ещё не ответили» (`actionCards`, grid-cols-2) takes half the screen width as a lone tile; looks unfinished.
3. «Добавить игрока в состав» button sits on the home screen; owner: it belongs inside the evening, not on the overview.
4. «Дела» block is huge and left, «На этой неделе» (`WeekEventsPanel.tsx`) is tiny and right/below — the sizes do not match the importance.
5. «Долги с прошлого вечера» (`previous-evening-debts`) is at the very bottom; owner: debts are the top priority and should be first, then the evening and what is open for it (no answer, unpaid), then the rest.
6. Overlap/duplication between «Дела», «Долги за вечер» and other lists — unclear which one is the main to-do list.

### CRM «События» → «Вечера» (desktop; `EveningsList.tsx`, `WeekEventsPanel.tsx`, `OrganizerCRM.tsx`)
7. «На этой неделе» (`WeekEventsPanel`) is a small card in the top-left; with a single evening it looks like a cropped fragment. Owner: with one evening it must not be a tiny window. (He does not want a settings window right there — drilling into the evening and choosing tournaments inside is fine.)
8. Tabs «Свои события», «Будущее», «История»: no complaints for now.

### CRM «Игроки» → карточка игрока (`PlayersCRM.tsx`, related `PlayerProfileCRM*`)
9. Card mixes two things: the player's own profile and the organizer's CRM record. Result: a lot of odd information in odd order. Owner direction: separate them (CRM card = organizer facts and actions; link «Открыть профиль игрока» to the player profile).
10. Separate window «Следующий игровой вечер: иду / не иду / записан»: not needed as its own block; the answer belongs in the evening view, here at most a plain-text status («записан»).
11. «Анкета» appears at the top (with edit buttons) and again lower: duplicate; one place only.
12. «Создать задачу», «Записать общение»: owner OK to keep (it is the comment/CRM note); low priority.
13. Learning / «Отслеживание тренажёра» block: keep only as a link to the player's profile where learning is linked.
14. Header part (photo, edit data, player music, replace login, delete photo): fine.

### CRM «Ещё»: Дела, Развитие, Обучение, Уровни и роли (`MoreCRM.tsx`, `CuratorTasksPanel.tsx`, `NoviceDevelopmentCRM.tsx`, `LearningProgressCRM.tsx`, `LearningActivityCRM.tsx`)
15. «Дела» (incl. curator tasks): OK as is.
16. «Развитие игроков» (`NoviceDevelopmentCRM`, «Первые заявки, новичковый этап и перевод в клуб»): owner does not use it and does not understand its purpose; name unclear, maybe it should not be a section at all. Direction: the organizer just receives tasks/notifications («нужно настроить профиль» etc.) in «Дела»; decide whether to remove the section after checking what only it offers.
17. «Обучение» (`LearningProgressCRM`): on mobile the layout «плывёт» (desktop OK) — verify at 360/390 px.
18. «Обучение»: tapping a player opens a plain profile instead of the exam detail for that player — illogical; should open the exam breakdown.
19. «Уровни и роли»: functionally OK, but colours/light theme are too pale (weakest contrast on the most important thing); selected rows are highlighted oddly.
20. «Уровни и роли»: quick filters (новичок, клуб, турнирный игрок…) sit in a left column as cell-like boxes — inconvenient; want a horizontal chip row on top.

### CRM «Ещё»: Памятка, Администрирование, Аналитика (`MoreCRM.tsx`, `AnalyticsCRM.tsx`, `AppUsagePanel.tsx`)
21. «Памятка новичку»: just a separate page with the newcomer guide; owner does not see why it is a CRM menu item. Decide: remove from the menu or move to where newcomers actually get it (link already sent from the bot/profile).
22. «Администрирование» / global CRM settings: purpose unclear to the owner, looks meaningless as one block; move items to sensible places or drop.
23. «Аналитика» (reports): cards in a random mess; unclear terms («откуда новые игроки», «подробнее будете в записи» — wording not understood); needs plain-Russian labels and a clear order.
24. «Использование приложения» (`AppUsagePanel`, who tapped where): screens are named inconsistently — some in Russian, some raw «player»/«Плеер»; show Russian names for all screens and explain what «65 игроков» counts.
25. «Сейчас в приложении онлайн»: OK. Owner's question about the «Сегодня / ближайшие вечера / клубы» block on that screen is unfinished in the dictation — clarify with the owner.

### CRM «Ещё» → Администрирование (`MoreCRM.tsx`, `DataSettingsCRM.tsx`, `ClubDigestCard.tsx`, `AnnouncementPhotosCard.tsx`, `CommerceAdminCRM.tsx`, `BettingAdminCRM.tsx`)
26. Club publications («Фотографии», «Сводка для игроков», «Что нового в 2LA Noire»): important and must be filled correctly, but today it is a long scroll of unclear fields. Needs a much simpler interface (few clear steps, preview).
27. «Оплата и поддержка», «Управление ставками»: not worked on yet (owner); leave as is for now.
28. «Данные и настройки» (add new product, expert modes etc.): owner does not understand what the section is for; clarify contents, split or hide expert modes.
29. «Проект / Дорожная карта» (incl. «подтвердить два ответа»): unfinished new section, keep; finish later.
30. «Состояние системы», «Оформление», «Тестовые режимы»: OK, keep.
31. General finding (owner): many functions are important, but the CRM is hard to navigate — too many items, unclear names, no hierarchy. Redesign principle: fewer top-level entries grouped by the organizer's tasks (today / people / evenings / club publications / money / system), plain-Russian names, one place per function.

### Status after the first redesign PR (2026-10-12)
Fixed (verified by screenshots at 390 px and 1280 px, no horizontal overflow): items 1–7 («Сегодня», week panel); 10 and 11 (next-evening status is a plain text line; one «Анкета» block, duplicates removed); 16 (renamed «Заявки новых игроков», section kept); 17–18 (Обучение: two-column tiles on phones, row expands to the exam breakdown with an «Открыть карточку игрока» button); 19–20 (Уровни и роли: stronger contrast, filter titles above the chip rows); 21 (памятка moved out of the top level into the collapsed administration group as «Ссылка-памятка для новичка»); 23–24 (analytics wording; every screen has a Russian name, «чел.»/«заходов» explained); 31 (Ещё grouped: Каждый день / Люди и обучение / Деньги и отчёты / Администрирование).
Still open: 9 (full split of CRM card vs player profile — only the duplicates were removed), 13 (learning block link), 16 (open applications as tasks in «Дела»), 22 and 28 («Данные и настройки» purpose/expert modes), 26 (club publications flow simplification), 27, 29, 25 (owner to clarify).

### Second pass (2026-10-12): logic and hierarchy checked by the assistant, not only the owner's list
Fixed: «Дела» and «Аналитика» belong under «Ещё» (the menu highlights it) but had no way back — added «← Ещё»; analytics «Сегодня и ближайший вечер» links were plain `<a href>` (full page reload, CRM state lost) — now open the evening inside the CRM; item 26 — «Публикации и каналы» split into three tabs (Публикации / Каналы / Связь), technical wording («Durable outbox», «маршрутизатор») replaced; item 28 — «Данные и настройки» explains what is inside and «База» tab renamed «Правка»; item 9/13 — the CRM player card now has «Открыть профиль игрока» (the profile exactly as players see it) so the card keeps the organizer's facts and actions; item 16 — open applications already surface on «Сегодня» (`level-decisions` block), no extra task type needed.
Checked, no defect: evening → player card → back returns to the same evening section; «Обучение» → player card → back returns to «Обучение»; unknown `/admin/more/<x>` falls back to the menu.
Not changed on purpose: «Оплата и поддержка», «Управление ставками», «Проект» (owner: not worked on yet / unfinished). Open question for the owner: «Игровой движок» and «Музыкальная база» leave the CRM shell (`/player/conduct/music`), so «Назад» there is the player app's own navigation.

## 2026-10-12 · Poker: chat covers the game, no desktop layout, silent sounds (owner report)
- `PokerChat.tsx`: the chat sheet was a full-screen dimmed modal over table and action buttons — fixed: on a phone a compact panel (emote strip + one input line, history on demand) sits inside the block above the action buttons and the table re-measures around it (hero cards and buttons stay visible); from 1120 px wide it is a permanent column beside the table. Status: fixed, merged in #883 (`c8d93632`).
- Poker has no real desktop layout beyond the centred phone-size table (empty black sides): the chat column is the first use of the width; a left column (hand history / tournament info) is still open.
- `PokerSoundToggle.tsx`: sounds exist since #868 but were off by default, the speaker icon was easy to miss, and a saved «on» never resumed the AudioContext after a reload (`play` returns when no context) — fixed (on by default, unlock on first tap, louder). Needs the owner's phone check.

### Poker follow-up (2026-10-12, owner: «это не звуки покера, какое-то пиликанье»; «нормальные фишки летают»; desktop layout)
- Sounds rebuilt (`src/lib/pokerSoundEngine.ts`): the old cues were bare sine beeps. Now chips are a click + inharmonic ring + knock on felt, cards a hiss + dry snap, check a knuckle rap, fold a card toss; cues added for check, fold, a raise (heavier stack) and sweeping the bets into the pot (`pokerSound.ts`). No samples (nothing to download or license) — rendered offline to check levels (peak 0.1–0.5, no clipping, chips centred near 2.4 kHz, knock near 240 Hz). Nobody has listened to them yet: the owner's ear on a phone is the real test; volumes/recipes live in one file.
- Flying chips: bets to the pot and the pot to the winner now fly as separate chips (up to nine, staggered, along an arc, rotating) instead of one block. Found and fixed on the way: the global `img { max-width: 100% }` squeezed the chips to zero width.
- Desktop layout from 1120 px: left column «ход раздачи + стеки» (`PokerDeskSidebar.tsx`), table in the centre, chat column on the right.

### Poker: show cards after the hand (owner request 2026-10-12) — new feature
`showPokerCards` (`pokerLobbyService.ts`), `POST /poker/lobbies/:id/show {cards:[0|1]}`, hand field `shown_cards` (indexes on the server, masked cards `[Card|null, Card|null]` for other viewers), UI buttons after a finished hand (`poker-show-cards`) and a card back next to a shown card. Rule recorded in `docs/BUSINESS_RULES.md`. Tests: `pokerShowCards.test.ts`, `PlayerPokerTable.test.tsx`; screenshot at 390 px via `poker-harness.html?finished=1`. Merged in #883 (`c8d93632`).

### CRM: club tokens could not be found (owner 2026-10-12: «не могу просто начислить жетоны»)
The manual token adjustment existed (`POST /api/players/:id/tokens/adjustments`, reason required, ledger entry) but only inside the player card → last collapsed block «Финансы и служебные настройки». Fixed: a visible «Жетоны» button among the quick actions of the CRM player card opens the same ledger card in a sheet; form wording «Начислить (+) или списать (−)», button «Применить». No server change.

### Status after merge #883 (2026-10-12, `c8d93632`)
Everything above marked fixed is in `main`. Merged ≠ deployed ≠ runtime verified: the Amvera build and the owner's phone/desktop check of CRM and poker (sounds by ear, flying chips, show-cards on a live table) are still to be done.

### Honest reconciliation of the 31 items (2026-10-12, after the owner said many were not fixed)
- **Done and verified on screenshots:** 1, 2, 3, 5, 10, 11, 17, 18, 20, 21, 24 (names), 26 (tabs), 28 (wording), 31 (grouping), «← Ещё» for Дела/Аналитика.
- **Was only half done, now fixed:** 7 — on «События» the running-evening card and the lists sat in the left half of a two-column grid (right half empty); now one column on the full width, the week list in two columns (single evening full width).
- **Partly done — the owner should check live:** 4 and 6 (the debts item is hidden from «Дела» only for the evening the debts block shows; debts of other evenings stay in «Дела»); 9 and 13 (the card still holds the organizer's profile blocks «Игровой профиль и награды» etc.; «Открыть профиль игрока» was added, nothing was removed); 16 (renamed, not turned into tasks); 19 (contrast raised, the odd highlight of selected rows not changed); 22 («Администрирование» regrouped, not dissolved); 23 (wording only, the card layout was not redone); 24 («65 игроков» is explained but you still cannot see who they were).
- **Not done:** 25 (unclear in the dictation — asked), 27 and 29 (owner: not worked on yet), the cabinet/profile of the player (waiting for screenshots).

### Second pass on the partial items (2026-10-12, same day)
- 9/13: the CRM player card no longer embeds the player's own profile content; the collapsed block is now «Проверка профиля и активность» (the organizer's integrity panel + activity), the profile itself is behind «Открыть профиль игрока».
- 19: selected rows in «Уровни и роли» have an accent tint, a bar on the left and an accent checkbox (before: a barely visible white wash).
- 22: the collapsed group «Администрирование и настройки» is now «Служебное» with a plain description of what is inside.
- 4/6 stays as designed: the debts block and the «Дела» preview must not show the same debts twice, so only the evening shown in the debts block is hidden from the preview.
- 24: «чел.» counts distinct people anonymously by design (`uiTelemetry` keeps no names); listing who they were would change that privacy rule, so it is not done without the owner's decision.
- Still open: 16 (applications as tasks — they already show on «Сегодня»), 23 (analytics card layout), 25 (dictation unclear), 27/29, the player's cabinet and profile.

### Owner answers on the open items (2026-10-13) and what was done
- 23 (analytics layout): screenshots showed cards of different widths and heights in one grid and tiles whose «?» pushed the content. Fixed: the main card spans the full width, its four tiles are equal, cards of one row are equally tall, the «?» floats in the corner; the lists that need room span the full width.
- 24 (who the «65 people» were): the owner wants it per player. The totals by surface (huge meaningless organizer numbers) are replaced by «Кто куда заходил»: one row per player — visits, last seen, screens opened in Russian (`getPlayersUsage`, `GET /api/ui-events/players`). The owner's own activity and organizers are not listed. History starts when events began to carry the player id.
- 25 («Сейчас» tab): «Сегодня и ближайший вечер» and the debts count were removed from the analytics tab — they exist on «Сегодня» and «События»; the tab keeps «Сейчас в приложении» (owner only).

### Owner's list of 2026-10-13 and what was done
- **14 «Очистить выбор»** (`eveningSlotPlanningService.ts`): now «Нет ответа» (`unanswered`), «Не иду» stays if the player said it himself; the organizer's notice says «снял запись» (`organizerResponseNotificationService.ts`). Tests `clearSlotSelection.test.ts`.
- **4 poker:** one shown card is marked «показана карта» at the seat (no chat message) and stays in the hand history (`shown` on the history entry). Tests `pokerShowCards.test.ts`, `PlayerPokerTable.test.tsx`.
- **1 «Что нового»:** built editable from the CRM (`whats_new_entries`, `/api/whats-new`); first rows are drafts.
- **2 «Оплата и поддержка», «Управление ставками»:** texts at least 12 px, plain wording («Онлайн-оплата пока выключена», no list of missing keys, no «тотализатор»). No structural change.
- **3 «Проект»:** `PROJECT_BOARD_RU.md` rewritten to the real state (it listed finished work as open).
- **15 «Игровой движок» / «Музыкальная база»:** «Игровой движок» is only shown when the app passes the engine callback, which the real app does not, so the row does not exist there. «Музыкальная база» opens the player app's conducting screen, whose only way back was the mode switch to the CRM home; now the screen has «Назад в CRM · Музыкальная база».
- **17 bot FAQ:** friend answer extended; cafe hours are not written anywhere in the app — the question is for the cafe, not for the code.

### Bot /start and menu audit (2026-10-13, owner screenshot)
- **Fixed — three entries to the same thing:** «🎭 Открыть 2LA Noire» sat on the reply keyboard, on the home card and in Telegram's blue menu button. The keyboard row now carries only «🎭 Открыть 2LA Noire | 📋 Меню» (`bot_menu.main_menu_for_user`); the card keeps its button; the blue button stays.
- **Fixed — a tall persistent keyboard covered the card and mixed roles:** «🎟 Доступ в клуб», «🛠 Админ-панель», «🩺 Проверить состояние приложения» and «⚖ Судейство» were keyboard buttons. Access was already under «Ещё → Группы»; organizers now get «🛠 Организатору» inside the card (cabinet, judging, app status, browser link), judges get «⚖ Судейство» inside the card (`bot_home._staff_rows`, `staff_view`). The old text buttons still work for players whose phone keeps the old keyboard.
- **Fixed — long, noisy intro:** the first message after /start is one line (`bot_menu.start_text`); the `/crm` hint is gone.
- **Fixed — answers only in code:** the bot's frequent questions are edited by the owner in the CRM (`bot_faq_entries`); the in-code list is only the seed and the safety net.
- **Fixed (follow-up, owner asked why it was left):** the legacy handlers (`start_profile.py`, `booking.py`, `admin.py`) re-sent the old ten-button keyboard after any profile/payment/booking action, replacing the short one. `keyboards.main_menu*` now return the same one-row keyboard; the «нажми «🕵️ Записаться на игру»» hints in `booking.py` point to «📋 Меню». The old text buttons still have handlers for phones that keep the old keyboard.
- **Fixed (full cleanup, owner: «все переделай»):** (1) retired-button replies (`legacy_retired_actions.py`) were jargon («legacy-бот», «legacy-базу»); now one plain sentence and the reply swaps the phone's old big keyboard for the short one. (2) The command list showed `/crm`, `/cabinet`, `/app` to every player; players now see start, events, faq, app, link, organizers additionally `/crm` and `/status` (per-chat scope in `commands.py`). (3) Removed dead handlers in `start_profile.py` that another router always answered first or that the retired-button router intercepts: `/start`, «📋 РЕГЛАМЕНТ», «🏠 В главное меню», «⚖ Панель судьи», «📊 Статистика», «👤 Мой профиль». (4) `/status` and the status button reply with the short keyboard.
- **Still in the code, unreachable in practice (not deleted, listed so it is a decision, not a surprise):** the legacy organizer/game-engine handlers in `admin.py`, `game/admin_actions/*`, `handlers/profile.py`, `handlers/booking.py`, `handlers/payment.py` and the rest of `keyboards.py`. Their entry buttons are intercepted by `legacy_retired_actions.py`; deleting them is a separate, larger removal that should be checked against `mafia_crm.db` readers first.

### Novice path audit (2026-10-13, owner: experienced/tournament players still got novice tasks and filters)
Root cause: «новичок» was defined two ways — by the organizer's level (`game_level`: novice/club/tournament, used by «База» tabs and audiences) and by visit counting (one attended evening). Everything built on visit counting ignored the level the organizer set.
- **Fixed** `crmAutomationService.ts`: «Спросить впечатления после первой игры» was created for anyone with exactly one attended evening; now only for novice level, and open ones of players later set to club/tournament are cancelled.
- **Fixed** `organizerAgendaService.ts` (`noviceFeedbackItem`): «Спросить новичков о первом вечере» lists only novice-level players.
- **Fixed** `crmRoutes.ts` (`newcomersAfterFirst`, «Сегодня» → «newcomer_followup»): novice level only.
- **Fixed** `noviceService.ts` (`listPlayersAwaitingFirstDecision`, the level-decision queue on «Сегодня»): a player with club/tournament level is decided and is not listed even when `club_stage` is still `NEW`.
- **Fixed** `playersRoutes.ts` (`/access/bulk`): setting club/tournament level now moves `club_stage` to `CLUB_PLAYER` and closes «Определить игровой уровень» and the feedback task (`syncPlayersWithOrganizerLevel`).
- **Fixed** `PlayersCRM.tsx`: quick filter «Новички» uses the level (`novice_level`), not «one visit»; the engagement stage `newcomer` is labelled «Первый визит» so it is not read as the level.
- One rule lives in `src/lib/noviceRule.ts`; tests in `src/tests/novicePathRule.test.ts`.
- **Not changed (by design):** the engagement stage (`lead` / `newcomer` / `returning` …) stays a pure visit-count descriptor; novice evenings, free visits and invitations already follow the level.

### Old bot code removed (2026-10-13, owner: «Да, удаляй, если они больше не нужны»)
How it was proven: a script loaded the real router order of `main.py`, replaced every handler with a recorder and fed each handler its own trigger texts and callback data; a handler that never answered its own trigger because the interceptor `legacy_retired_actions.py` (or `admin_crm`) answers first is unreachable. 51 handlers are reachable (home card, `/events`, `/faq`, `/crm`, `/status`, club access, profile search, game archive buttons on old messages, achievements, rating pages, evening answers and votes, DB backup buttons of the admin menu); 168 were not.
- **Deleted:** the whole legacy game engine in the bot (`game/admin_actions`, `game/day`, `game/night`, `game/edit_router.py`, `game/state.py`, `game/models.py`, `game/elo_calculator.py`), `handlers/admin_judges.py`, `handlers/payment.py`, `handlers/shop.py`, `handlers/bets.py`, and 185 unreachable handlers inside `admin.py`, `handlers/profile.py`, `handlers/booking.py`, `handlers/crm_booking.py`, `handlers/start_profile.py`; about 160 helper functions and classes that nothing referenced any more, and the unused imports.
- **Kept:** `game/text.py` and `game/utils/endgame_pic.py` (used by the live game archive in `profile.py`), `handlers/booking.py` helpers used by `registration.py`/`start_profile.py`/`admin.py`, the registration flow (`finish_registration`), and `legacy_retired_actions.py`, which still answers old buttons with «Эта кнопка устарела».
- **Check after the change:** the same 51 handlers still answer their triggers; `pytest` 88, `python3 -c "import main"`; the contract test `legacyRuntimeContracts.test.ts` was updated for the deleted routers.


## 2026-10-14 · Screen-by-screen audit: CRM «Ещё → Дела» (pass 1)

**Scope and evidence:** mounted \`OrganizerCRM.tsx\` renders \`OrganizerAgenda\`, \`CuratorTasksPanel\` and, behind «Свои задачи и выполненные», \`TasksCRM\`. The worklist is built by \`organizerAgendaService.ts\`, with separate curator and organizer-task sources. Audit reviewed action destinations, on-screen wording, load/error/empty states and UI hierarchy; no live-phone screenshots or production database were accessed.

- **P1 — wrong action destination (confirmed):** \`fillItems()\` returns cards \`people:thinking:...\` and \`people:fill:...\` labelled «Открыть ответы», but their action targets evening section \`overview\` instead of \`participants\` (the merged unified «Ответы» list). Both \`why\` strings refer to removed «Личные приглашения» navigation. Fix in this pass: target \`participants\`, use the existing unified «Ответы» wording and assert both actions in the existing SQLite integration test. No eligibility/shortfall calculation changes.
- **P1 — silent curator-task failures (confirmed):** \`CuratorTasksPanel.load()\` ignored HTTP non-200 and caught network errors without displaying anything; with \`data=null\`, the whole task panel disappeared. \`cancel()\` had \`try/finally\` without \`catch\`, leaving unhandled rejected mutations and no visible feedback. Fix in this pass: keep the screen visible with retry/error state and surface cancellation errors while retaining the task row.
- **P2 — fractured information architecture (verified, not refactored):** one conceptual «Дела» screen still exposes three independent work sources (\`/api/crm/agenda\`, \`/api/tasks\`, \`/api/curator-tasks\`) with separate done/history rules and separate loading states. Evaluate a unified information hierarchy with the owner after this bugfix; **do not collapse stores or change curator/organizer task lifecycle as a cosmetic change**.
- **P2 — snoozed items uninspectable (verified, deferred):** \`organizerAgendaService.loadAgenda()\` exposes only a \`snoozed\` count while excluding snoozed cards; currently there is no view to inspect/undo postponement before its expiry. Needs backend contract and organizer approval; do not pretend the count itself is a list.
- **P2 — UI interaction sizing and confirmation (verified, deferred):** several routine curator/task actions use 36–40 px targets and curator cancellation still uses \`window.confirm\`; a mobile-first cleanup should reuse the design-system confirmation/sheet primitives, after visual review at 390px.

**Pass exit:** the two P1 regressions get focused test evidence; broader structural proposals are explicitly deferred. An open PR / green CI / merge / deployed runtime are separate states.

## 2026-10-15 · Player Cabinet «Сообщество → Рейтинг»: error recovery and period freshness

- `PlayerRatingPeriods.tsx`: period selection retains previous `detail` during the next request; an archived season can briefly appear under a newly selected period while fetching. **fixed in PR:** clear detail on request start, retain cancellation guard.
- `PlayerRatingPeriods.tsx`: a failed period-list or period-detail GET ends in text-only dead ends. **fixed in PR:** scoped retry for each request without resetting selected season.
- `PlayerTournamentResults.tsx`: failed `/api/player/tournaments` GET has no in-place retry. **fixed in PR:** retry and neutral loading/error reset, preserve tournament navigation.
- Scope: UI fetch/recovery only; rating calculation, minimum participation rules, Elo, club points, GoMafia and production database untouched. Mobile/CI evidence required before merge.

## 2026-10-15 · Player Cabinet «Сообщество → Активность → Матчи»

- `PlayerStoriesPanel.tsx`: a failed GET `/api/player/stories` replaced the entire history with a dead-end error; no in-place retry. **fixed:** show actionable retry, reset error on request, preserve cancellation guard.
- `PlayerStoriesPanel.tsx` `MatchSpotlight`: failed `/api/player/games/:key` within the in-page game sheet offered only close, not reload. **fixed:** in-sheet retry for the same game, reset stale detail before retry, retain cancellation guard and current game navigation.
- Entire match feed, voting panel, evening scores, game chronology, cards and score computations unchanged. Browser/CI evidence required before merging.

## 2026-10-15 — art PR ownership reconciliation

- #941: likeness/key-art criteria existed only in a standalone document and current queue omitted the work. Preserve them in DESIGN_SYSTEM, point the workflow document to that owner, and record current/pending work in PROJECT_STATE.
- #891: the latest approved four-quality/collectible-portrait direction and separate legendary animation upgrade were stranded on the rejected wardrobe branch. Preserve that exact product scope in BUSINESS_RULES and motion feedback in DESIGN_SYSTEM; archive runtime/prototype without deleting the branch, items or snapshots. No new product decisions or art generation.

Second-block connected checks:41 tests across8 suites,14 isolated Python-copy cases, TypeScript, changed-file ESLint and isolated UI/production builds passed. Baseline components frozen from mainbdc59 for same-fixture360/390 game+recap comparisons. No protocol/game score/finance writer changed.

## 2026-10-19 · Evening summary of 16 Oct (owner screenshot)

- `clubResultData.ts` «Больше всех побед»: a player with 1 win in 1 game took third place because the list had no minimum. **fixed:** only 2+ wins.
- `clubResultData.ts` best by role on unscored evenings counted wins only, so after an evening of five black wins the sheriff and citizen nominations were empty. **fixed:** effectiveness per game (rules in BUSINESS_RULES, evening summary); empty only when nobody played the role.
- Elo growth looked wrong to the owner: **open** — waiting for the owner to say what is wrong (no production data here); the number comes from `loadPlayerEloHistory`, unchanged.
- Season table role nominations: **fixed** — two lists, by wins and by effectiveness (owner choice).

## 2026-10-22 · Novice evening of 16 Oct «disappeared» (owner question; checked on the running app, read-only)

- The evening was **not cancelled** (an earlier guess that the shortfall check had cancelled it was wrong): status `published`, never started or closed — 10 answered «going», 3 «declined», nobody marked as attended, no games; the route shows «Закрыть вечер» as an open task and «Автоотмены нет» for novices. It lives in «Актуальное» as an overdue open evening and is not in «История» because history lists only closed evenings. **open** — owner to say whether it was held (then mark attendance and close; else cancel).
- «Недобор: набрано 0 из 2 нужных игр» screenshot: the roster of 9 included 3 «не идут» and 2 «молчат»; only the 4 «Идут» count (4/9 per game), matching «Ответы игроков». Counting is right, the wording is misleading. **open** — wording proposal pending.
- Elo of the 16 Oct evening: all five games were black wins; one player was black in 4 of 5, one in 2, the rest once or never, so +36 / +16 / ~+8 for the blacks and minus for the reds is what the system gives. No defect found.
- Judges of games 1–4 (numbers 12–15): 12–13 already «Спящий», 14–15 «Чагин». Change to «Спящий» waits for the owner's explicit «да» (a production write).

## 2026-10-22 · Architecture and dependency audit (owner request: «пора заняться рефакторингом … какие аудиты?»; approved plan)

Scope: all of `src/**` and `server.ts` on `main` `54a86b1` (848 non-test modules, 145k lines), static analysis only, no production data. Tools: own guard `npm run project:deps` (`src/scripts/checkDependencyCycles.ts`), madge 8, knip 5, jscpd 4, `npm audit`, `vite build`, churn from `git log` (90 days). Not done in this pass: route-by-route auth/permission review, SQLite query plans, test-coverage numbers (each is a separate pass).

**Dependency cycles and layers (guarded in CI from now on; baseline `config/dependency-cycles-baseline.json`, new entries fail CI, removed ones shrink the baseline).**
- Runtime cycles (type-only and dynamic imports excluded): **2 groups, 13 modules, 19 edges; 0 after the follow-up PR.** madge reports 66 because it also counts `import type` and `await import()`; the alarming chain `db/index.ts → one-off migrations → services → routes → db/index.ts` is closed only by type-only/dynamic imports, so it is a layering smell, not a start-up cycle. **open**
  - `src/db/index.ts ↔ src/db/seed.ts`. **fixed** — `seed.ts` imported only the `DatabaseWrapper` interface; now `import type`.
  - Evening lifecycle ring of 11 services: `eveningSlotPlanningService → eveningRescheduleService → eveningTodayPostService → eveningShortfallService → eveningRecruitmentService → eveningPeopleService → guestPlayerService → vkLiveEveningSyncWorker → vkDirectJoinPublishingService → eveningSlotPlanningService`, plus `personalNotificationRouterService → vkMessageOutboxService → vkLiveEveningSyncWorker`. **fixed — 0 runtime cycles left.** The ring closed through two writes inside the slot read model: `updateEveningSlotSettings` and `replacePlayerSlotSelection` moved unchanged to `eveningSlotWritesService.ts` (they kick the VK sync and send the reschedule notice; the read model `eveningSlotPlanningService.ts` no longer imports either). The last edge, a guest change kicking the VK sync, loads the sync module on demand (`await import`, the kick was fire-and-forget already). Full local Vitest: 2861 passed; 3 organizer-password tests failed only because the session's own `ORGANIZER_PASSWORD` leaked into them and pass without it.
- Layer direction (`lib/shared → db → services → routes`, UI never imports server/db at runtime): **16 violations, 10 left after the same PR.**
  - Services import code from route files (5): `calculateBestMovePoints` lived in `routes/tournamentProtocolRoutes.ts`, `internalGetStandings` / `internalGetNominations` in `routes/tournamentsRoutesBase.ts`; used by `flexibleTournamentStandingsService`, `gameResultCardService`, `playerTournamentViewService`, `ratingPeriodStandingsService`, `tournamentAwardsService`. **fixed** — moved unchanged to `services/bestMovePoints.ts` and `services/tournamentStandingsService.ts`; routes import them.
  - `db/` imports services (10): one-off data migrations (`fixFandorinAug28…`, `fixSep4Chagin…`, `applyEloScaleMigration`, `applyPlayerStarterTokenGrant`) and `ensureIsolatedTestRuntimeSchema` call ledger/Elo/payment services. **fixed except the sandbox schema (2 left)** — the four files moved to `src/server/dataMigrations/`; the Millourt/Fandorin/Chagin repairs left `getDb()` and run from `server.ts` right after it, in the same order. Removing them needs proof that production has their `migration_history` markers; no read path for that exists (no developer read key in the session), so they stay. **Production start-up log after the #996 deploy (Amvera run log, 14:27 UTC):** `[DATA] Fandorin 2026-08-28 game identity repair failed: No game evening found for 2026-08-28` and `[DATA] Confirmed 2026-09-04 game identity repair failed: Expected one exact 2026-09-04 evening shape, found 0` — the same lines the old code printed, so both repairs never completed on production and cannot apply to the current data (they stop before writing). Whether those two evenings were fixed another way, or should be, is the owner's call; until then they only add two error lines per start. **open — owner question** Check: a production build started on a fresh checkpoint copy gives the same start-up log, the same `migration_history` and the same row count in all 120 tables as `main`.
  - UI imports a server file at runtime (1): `ProtocolImportModal.tsx → server/services/recognition/types.ts`, types only. **fixed** — `import type`.

**Unused code (knip, each candidate confirmed by grep; tests that only read a file's text do not count as use).**
- Files with no importer: `src/lib/uiPreviewProductionBootstrap.ts`; `src/components/crm/EveningAnnouncementPanel.tsx`, `EveningAttendanceQuickControls.tsx`, `EveningOverviewView.tsx`, `EveningParticipantsWorkboard.tsx`, `PlayerProfileContent.tsx` + `PlayerProfileContentBase.tsx` (only import each other), `tournaments/CreateTournamentModal.tsx`, `tournaments/TournamentBackupBlock.tsx`; `src/components/player/PlayerProgressionPanel.tsx`; `src/components/ui/Badge.tsx` (only listed in the CI fast-path list); `src/server/services/vkJoinRouter.ts`, `vkJoinCallbackRouter.ts`, `vkJoinCallbackProbeRouter.ts`; `src/db/tursoHttpDatabase.ts` (only its own test; Turso is retired). Source-text tests guarded three of them: `legacyRuntimeContracts.test.ts`, `instantCrmRowActions.test.ts`. **fixed** — all removed except `uiPreviewProductionBootstrap.ts`, which is a false positive (built by `scripts/buildUiPreview.mjs`); the tests' cases about the removed files are dropped, the live `EveningActiveRosterView` check stays.
- Broken browser harness: `e2e/club-pilot-harness.tsx` imports `src/components/player/PlayerClubHub.tsx`, which does not exist in history; `club-pilot.spec.mjs` is in no Playwright config. **fixed** — harness, page and spec removed.
- npm packages never imported: `bcryptjs`, `canvas-confetti`, `motion`, `recharts` (also deprecated 2.x); stub types `@types/bcryptjs`, `@types/helmet`, and `@types/canvas-confetti`. (`tailwindcss` is a false positive, used from CSS.) **fixed** — uninstalled; the start bundle size is unchanged (they were never bundled).
- 310 unused exports and 331 unused exported types: informational, cleaned only together with their owners.

**Duplication (jscpd, ≥15 lines):** 0.48 % overall, 17 clones. Real one: `TournamentStandingsView.tsx` repeats ~540 lines inside itself (three blocks). **fixed** — the mobile card of the top three and of the other places is one render function (942 → 716 lines); a one-off jsdom comparison of the old and new component on the same data gave identical HTML in five states (collapsed, row open, games open, for two cards). Others are 17–25 lines (route helpers, `App.tsx` / `App.vk-direct.tsx`), left as is.

**Size × change hotspots (lines × commits in 90 days):** `LiveGameEngine.tsx` (1836 lines, highest), `LiveGameEngine/CenterPanel.tsx`, `EveningLiveGameModal.tsx`, `PlayerGameDetail.tsx`, `lib/api.ts`, `eveningSlotPlanningService.ts`, `metricRatingService.ts`, `eveningStaffRoutes.ts`. Largest files that rarely change (`tournamentResultsExport.ts`, `tournamentsRoutesBase.ts`, `GameProtocolModal.tsx`, `tournamentProtocolRoutes.ts`) are lower priority. Live Game stays programme item 9 (audit first, owner scope). **open**

**Client bundle:** the start bundle is 1.95 MB (503 KB gzip) plus 416 KB CSS; `OrganizerCRM` 932 KB is already split. Phones download all of the player cabinet up front. **fixed (start JS 1978 → 972 KB, gzip 516 → 260 KB)** — measured with source maps: the judge's «Ведение» screen pulled the live engine and protocol modals, the guide pulled the reasoning courses, poker 64 KB. They now load on demand (`PlayerCabinetShell.tsx`: `PlayerConductCenter`, `PlayerPoker`, `PlayerClocktower`; `App.tsx`: `/guide` via `PublicGuideRoute.tsx`); a failed chunk after a deploy reloads the page once (`main.tsx`, `vite:preloadError`). 390 px screenshots of `/player`, `/player/conduct`, `/player/poker`, `/player/clocktower`, `/guide` on a local production build: pixel-identical before/after, no console errors.

**Data fetching:** `fetch(` is called directly in 131 components; the shared `getJson` helper is used by 16 (programme item 5). **partly fixed (2026-10-22, follow-up PR)** — 239 calls in 126 components: 125 reads, 111 writes. 38 calls in 28 components that matched the hand-written block exactly (same error text, same-origin cookie, optional `no-store`) now use `getJson` / the new `sendJson` (`src/lib/requestJson.ts`, unit tests). The rest have their own shapes (custom auth headers, 204 handling, local per-screen request wrappers, `.then` chains) and are converted only screen by screen with that screen's tests. **open**

**Dependencies/security:** `npm audit --omit=dev`: 0. Dev tools: 3 (vitest, @vitest/mocker moderate; brace-expansion high), not shipped. **fixed** — vitest came up in #991, `npm audit fix` took brace-expansion; `npm audit`: 0.

**Test coverage (2026-10-22, v8, full Vitest, not added to CI):** lines 63.5 %, branches 51.0 %, functions 56.0 %. Weakest hot files: `EveningLiveGameModal.tsx` 10.9 %, `lib/api.ts` 13.7 %, `TournamentDetailViewBase.tsx` 32.4 %, `GameProtocolModal.tsx` 47.0 %, `LiveGameEngine.tsx` 48.4 %. Money and rating services are well covered (Elo 99 %, token ledger 98 %, evening pricing 97 %, slot planning 95 %). Splitting `GameProtocolModal` / `TournamentDetailViewBase` / `LiveGameEngine` waits for characterization tests of their handlers. **open**

**Sandbox schema layer:** `ensureIsolatedTestRuntimeSchema` imported two schema functions from services. **fixed** — `ensureUiUsageSchema` and `ensureEveningAnnouncementTrackingSchema` moved to `src/db/` (services re-export them). Layer violations 0, cycles 0.

**Large route file:** `tournamentsRoutesBase.ts` 1250 → 1022 lines — tournament JSON backup helpers (`insertRowSafe`, `validateTournamentBackupData`, table whitelist) moved unchanged to `services/tournamentBackupService.ts`.

## 2026-10-22 · The server stalls ~2 s about once a minute (found during the refactoring audit; production read-only)

- `GET /api/health/performance` on production (14:21–14:26 UTC, the build before #996): event-loop windows alternate between ~2.0–2.4 s and 0.3–0.7 s max stall every 30 s sample, so roughly one 2 s freeze per minute; `slow_requests` and `slow_transactions` are empty, so it is not an HTTP request or a write transaction. Every request that arrives in that moment waits. **open**
- Suspects (run every 60 s): `reconcilePersonalNotifications` (evening, Elo and betting notification scans) and `refreshExistingVkEveningPosts` (VK live evening sync). Not proven.
- Step 1 (follow-up PR): the probe now records each background worker tick whose synchronous SQLite time is ≥ 300 ms (`slow_jobs` in `/api/health/performance`: job, wall time, SQLite time, number of calls); the database wrapper counts SQLite time only inside a timed job. Workers timed: personal notifications, VK live sync, VK and Telegram message outboxes, Telegram sync outbox, poker tournaments, weekly evening automation. Step 2 after deploy: read `slow_jobs`, then fix the job that owns the stall.
- **Measured after the #997 deploy (production, 14:51–14:52 UTC):** `personal_notifications` 1.8–2.4 s of SQLite in ~120 calls every minute; `weekly_evening_automation` 2.2 s (start-up and every 30 min); `vk_live_evening_sync` 0.65–0.75 s every minute; `telegram_message_outbox` 0.3–0.67 s in only **4** calls every 5 s. Slow requests at the same moments (`/api/health/runtime` 3.9 s, bot `public-router` 2.4–2.8 s) were waiting behind them.
- **fixed (follow-up PR):** the Telegram and VK outbox drains, the stale-notice expiry and the queue count filtered `status <> 'sent'`, which cannot use the due index, so every 5 s SQLite scanned every message ever sent (with its picture). The tables allow only pending/sent/failed (CHECK), so the filter is now `status IN ('pending', 'failed')`: same rows, `SEARCH … USING INDEX` instead of `SCAN` (synthetic 40 000 rows: 32 → 6 ms).
- **open:** the minute scan is nine steps; each is now timed on its own (`personal_notifications/<step>`, threshold 100 ms) to name the heavy one before changing it. VK live sync and the weekly automation come after that. Slow SQLite statements (50 ms or more) are grouped by their text (no parameters) with count, longest and total time since start; because SQL text shows the database layout they are served only behind the organizer session at `/api/health/performance/queries`, never on the open probe.

## 2026-10-22 · Characterization tests before splitting large screens (refactoring programme)

- `EveningLiveGameModal.mapEngineResultToProtocol` (what a club live game saves): five more cases pin markers, both best moves, fallback to the earlier protocol, seat lookup for a guest identity and the fourth-foul kick. All passed on the current code.
- `TournamentDetailViewBase`: the edit rights of the selected game (judge, roles, seats; correction mode) moved unchanged to `tournamentGameEditRights.ts` with a status matrix test. **Observation, not changed:** «another game is running» compares with the *first* active game of the list, so when two games are active at once (possible only in correction) the first one in the list is not blocked by the second. Pinned by the test; change only with the owner. **open — owner question if it ever matters**
- Five CRM cards with identical local `request` helpers use the shared `requestJson`.
