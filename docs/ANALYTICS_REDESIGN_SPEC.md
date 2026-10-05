# Analytics redesign — implementation spec (for Codex/ChatGPT)

Status: **owner-requested spec, not built.** Findings and numbering («A1…A19») refer to the 2026-10-05 «Analytics audit» in `docs/AUDIT_LOG.md`. Read `AGENTS.md` first (mobile-first 390 px, PR rules, docs rules, ask-before-new-product-work). This spec is the owner's approval for the work below; anything marked **ASK** needs the owner's «да» first.

Goal: the owner opens «Аналитика» and in ten seconds understands how the club is doing, without knowing the jargon, and can trust every number because each has one written definition.

## 0. Non-goals

- No new data collection, no new tables for events, no change to player-facing screens.
- No charts library. Use plain numbers, small bars made of CSS, and sparklines only if they are inline SVG ≤ 40 lines.
- Do not touch `docs/BUSINESS_RULES.md` definitions other than the new «Analytics definitions» section (§2). Do not change money, awards or rating logic.
- Production data is read-only for you; use fixtures in tests.

## 1. Information architecture (fixes A12, A13, A16–A18)

One screen `/admin/analytics`, four sections as **tabs** (segmented control, 44 px high, always visible under the header — sticky), each answers one question:

| Tab | Question | Content (existing panels reused where noted) |
|---|---|---|
| «Сейчас» | Что происходит сегодня? | `OnlineNowPanel` (owner only), evenings today/next, open debt count |
| «Клуб» | Растёт ли клуб? | KPI row (new players, active players, visits, fill rate), retention, inactive, sources |
| «Деньги» (owner only, tab hidden for organizers) | Сколько заработали? | accrued, paid, unpaid balance, avg per evening, by-evening list |
| «Игры и люди» | Как играют и кто работает? | `GameStatsPanel`, `StaffReportPanel`, personal-mailing funnel, `AppUsagePanel` |

Rules:
- Default tab «Клуб». Remember the last tab in `sessionStorage` (wrapped in try/catch).
- **One shared period control** above the tabs content, sticky, with presets «7 дней / 30 дней / 90 дней / Сезон / Всё время» (+ «Месяц», «Прошлый месяц» for staff only if the user picks them; do not show two pickers). Min height 44 px. The chosen period is shown in the page subtitle in words («с 6 сентября по 5 октября»).
- Every block states in its small caption whether it obeys the period («за период» / «на сегодня» / «за всё время»). A block that cannot obey the period (e.g. players in base) says «на сегодня».
- Changing period or tab must **not** unmount the page: keep old numbers visible with a thin loading bar, replace when new data arrive. No whole-page spinner after the first load.
- Each panel owns its own loading / error / empty state: error = short plain sentence + «Повторить» button (44 px); empty = one sentence explaining why («за этот период вечеров не было»). Never hide a panel silently, never spin for ever.
- Top of «Клуб»: a plain-words summary line generated from numbers, e.g. «За 30 дней: 5 вечеров, 62 визита, 8 новых игроков. Заполняемость 71 %.» (pure function, unit-tested).
- Order inside a tab: the most important number first, details collapsed under «Подробнее» (native `<details>` styled, 44 px summary).

## 2. Canonical definitions (fixes A1–A7, A9, A10)

Add a section «Analytics definitions» to `docs/BUSINESS_RULES.md` (this is the one place the owner-approved wording lives; ask the owner to confirm the **ASK** items by showing him the plain text, one message):

- **Участник клуба (member)** = row matched by `MEMBER_SQL` in `organizerAgendaService.ts` (not guests, not archived). All «игроков» in analytics use it.
- **Визит (visit)** = the definition used by `playerVisitsService` (attended an evening OR seated in a game slot of an evening) counted once per player per evening; evening status `completed` or `active`. All visit counts, first/last visit, retention and inactivity use this one rule. If the code of `playerVisitsService` and this text ever disagree, fix the text or the code in the same PR, not both ways.
- **Новый игрок за период** = first visit (by the visit rule) falls inside the period.
- **Активный игрок за период** = at least one visit inside the period.
- **Неактивный** = no visit for N days where N is one constant per bucket: «давно не был» 30, «пропал» 60, «ушёл» 90 days, shown as **exclusive** buckets (30–59, 60–89, 90+), not cumulative. **ASK** whether the CRM «ready for club review» thresholds (14/28 d) stay as they are (default: yes, they are a different tool; the spec only requires the analytics buckets to be exclusive and named).
- **Возврат (retention) 30 д** = of players whose first visit is in the period **and at least 30 days ago**, share who had a second visit within 30 days of the first. Show the cohort size next to the percent («3 из 8»). If cohort < 5, show the fraction without a percent and the caption «мало данных». Players whose 30 days are not over are listed as «ещё считается: N».
- **Заполняемость вечера** = attended (visit rule) / capacity of the evening, averaged over completed evenings of the period; evenings without capacity are skipped and counted in the caption. If the capacity field does not exist for evenings, **ASK** before inventing one (default: use the seat count of the evening's game slots).
- **Отмены / неявки**: denominator = players who answered «приду» or were added (not all registrations); declined answers are not registrations. Show counts first, percent second.
- **Деньги** — one basis for the whole money tab: **evening date** (`game_evenings.starts_at`) for «начислено» and «оплачено по вечерам периода»; separately «поступило в период» by payment date (`financial_transactions.created_at`). Label both clearly; do not subtract one basis from the other. «Остаток долга» = current unpaid balance of the evenings of the period (same as the payments overview), never «created − paid». Refunds and expenses stay out of the page unless the owner asks (they are returned today and unused; remove them from the payload or show them in one collapsed line — **ASK**, default: remove).
- **Воронка рассылки**: each step's percent = share of the **previous** step; the first step is «доставлено». Show absolute numbers. Steps keep existing meaning (delivered → answered → positive → attended).
- **Rounding**: integers for shares ≥ 10 %, one decimal for shares < 10 %; never mix inside one table. One helper `formatShare(part, whole)` in `src/lib/analyticsFormat.ts` used everywhere (including game stats). `0/0` prints «—».
- **Sources**: map raw `players.source` to Russian labels via a dictionary in `src/lib/playerSources.ts` (keep unknown raw values as is, trimmed, title-cased); counts members only; obeys the period when it means «new players of the period».

## 3. Server (fixes A12–A15)

- Move all SQL out of `analyticsRoutes.ts` into `src/server/services/clubAnalyticsService.ts` with one pure-ish function per tab: `loadClubOverview(db, range, viewer)`, `loadClubFinance(db, range)`, `loadClubNow(db)`. The route only parses the query, calls the service, returns JSON. Keep existing paths `/api/analytics`, `/api/analytics/game-stats`, `/api/analytics/staff` working for one release (the front end switches to the new split endpoints `GET /api/analytics/overview|finance|now?period=`; old route may delegate).
- **One range parser** `parseAnalyticsPeriod(value, now)` in `src/lib/analyticsPeriod.ts` (shared client/server, pure): presets `7d|30d|90d|season|month|prev_month|all` → `{ id, label, since, until }` in Europe/Moscow. Replace the copies in `analyticsRoutes.ts` (3 places), `uiUsageService`, `GameStatsPanel`, `AppUsagePanel`, `StaffReportPanel`, `AnalyticsCRM`. Removing the `all → 180 days` special case in usage: usage keeps a retention cap, say so in its caption.
- Replace `SELECT p.* … 3 correlated subqueries` and the cohort N+1 loop with one aggregate query: `SELECT player_id, MIN(starts_at) first_visit, MAX(starts_at) last_visit, COUNT(*) visits` over the visit-rule CTE, and one more for «second visit within 30 days» using a window function (`ROW_NUMBER()`) or a self-join. Select only needed columns.
- `getUiUsageSummary`: aggregate in SQL (`GROUP BY`) with a row cap; move the retention DELETE into the existing cleanup job, not into the read path.
- `loadStatGames`: keep, but cap «Всё» at the latest 2000 games and show the cap in the caption if hit.
- Add indexes only if `EXPLAIN QUERY PLAN` shows a scan on a table with > 10k rows expected (`evening_participants(player_id, attendance_status)`, `financial_transactions(created_at, type)`); add them via the existing migration pattern, `CREATE INDEX IF NOT EXISTS`.
- Role visibility stays exactly as today: money and `OnlineNowPanel` owner only (`isClubOwner`), the rest organizer. The server must not send finance fields to organizers (test it).
- No change to the presence endpoint behaviour, only stop polling when the tab «Сейчас» is not shown or the document is hidden.

## 4. UI details (fixes A15–A18)

- Mobile-first at 390 px; verify 360 px too. No horizontal scroll. Respect Telegram safe area and the bottom navigation.
- Text ≥ 12 px everywhere (no 10–11 px labels); numbers 20–28 px; touch targets ≥ 44 px (period, tabs, retry, details summary).
- Cards: use the DESIGN_SYSTEM radius/spacing tokens, not `rounded-[16px]`. Check `docs/DESIGN_SYSTEM.md` before writing classes; no new colors.
- KPI tile = big number, one-line plain label, small caption of the basis («за период» etc.), optional delta vs previous period of equal length (▲/▼ + number, grey when |delta| is noise: < 5 % or cohort < 5). Show delta only when previous period has data.
- Replace the 7-column funnel grid with a vertical list: step name, number, share of previous step, thin bar.
- Jargon: rename with plain Russian and add a «?» button (44 px hit area) opening a short popover/sheet with the definition from §2: «нулевой круг» → «первое голосование (круг 0)» with explanation, «ПУ/ЛХ» → spelled out «первый убитый / лучший ход», «зах.» → «заходов», «retention» → «возвращаются». The text of each help lives in one file `src/lib/analyticsHelp.ts` and is the same text as BUSINESS_RULES.
- Remove dead prop `onOpenThemeModal`, unused payload fields, unused components.
- Do not render raw keys or `NaN`/`undefined`/`Infinity` anywhere (test with empty database).

## 5. Tests (required, no Playwright in ordinary CI)

- Service tests with a seeded in-memory DB: members vs guests vs archived; visit rule edge cases (attended, seated only, declined only); new/active/inactive buckets exclusivity; retention with censored cohort and cohort < 5; fill rate with and without capacity; money bases (evening-date vs payment-date) with an old evening paid now; funnel step-to-step; sources mapping.
- `parseAnalyticsPeriod`: each preset, Moscow month boundaries, season missing.
- Route tests: organizer does not receive finance; owner does; bad period → 400 or falls back to `all` (keep today's behaviour, test it).
- Component tests (jsdom): tab switch keeps data, period change shows bar not spinner, error state with working «Повторить», empty states, help popover, no `NaN`.
- Performance guard: a test that seeds 2000 players / 5000 participants and asserts `/overview` runs a bounded number of queries (count via wrapper spy, e.g. ≤ 12).
- Add a focused mobile static check to the existing UI preview workflow only if it already supports a CRM route (see `docs/UI_PREVIEW.md`); otherwise ask in the PR for a manual 390 px screenshot by the owner. Green CI is not visual approval.

## 6. PR slicing (Claude PR budget does not apply; aim for 3–4 coherent PRs, each green before the next)

1. **Definitions + shared period + service** (§2, §3): BUSINESS_RULES section, `analyticsPeriod.ts`, `analyticsFormat.ts`, `clubAnalyticsService.ts`, new split endpoints, old endpoint delegating, service/route tests. No visible redesign yet except corrected numbers.
2. **Front-end shell** (§1, §4 part): tabs, sticky shared period, per-panel states, summary line, no whole-page spinner, dead code removal, component tests.
3. **Panels and plain language** (§2 labels, §4): KPI tiles with deltas, vertical funnel, fill rate, new players, Russian sources, help popovers, game-stats jargon.
4. **Cleanup + docs**: remove old endpoint if unused, usage-summary SQL aggregation, indexes if needed, docs below.

## 7. Documentation to update (same PRs)

- `docs/BUSINESS_RULES.md`: «Analytics definitions» (§2, after the owner confirms the **ASK** items).
- `docs/FEATURE_MAP.md`: replace the stale analytics line («no player ids») with the new first-hop files (`AnalyticsCRM.tsx`, `clubAnalyticsService.ts`, `analyticsPeriod.ts`, `analyticsHelp.ts`).
- `docs/ARCHITECTURE.md`: one line for the analytics service and shared period module.
- `docs/PROJECT_STATE.md`: move the queue item to built; add to «Player-facing changes not yet announced» only if players see something (they do not).
- `docs/AUDIT_LOG.md`: mark A1–A19 `fixed (PR link)` one by one, or `wontfix` with reason.

## 8. Acceptance criteria

- Every number on the page has a definition in BUSINESS_RULES and a «?» help with the same words; no two panels contradict (same members, same visits, same inactive cut-offs).
- A failed request never leaves a spinner; Retry works; owner/organizer visibility unchanged and tested.
- At 390 px: no horizontal scroll, text ≥ 12 px, targets ≥ 44 px, period and tabs reachable without scrolling back to the top.
- `/overview` bounded queries, no per-player query loop, no unbounded row load.
- `npx tsc --noEmit`, eslint on touched files, all new and existing tests green; no weakening of tests.

## 9. Open questions for the owner (ask in one batch, plain words, before section 2 is finalized)

1. Keep the CRM «давно не был» thresholds (14/28 дней) separate from analytics (30/60/90)? Default: yes.
2. Заполняемость: what is the capacity of an evening (seats of the game slots, or a number you set)? Default: seats of the game slots.
3. Показывать ли возвраты и расходы (refunds/expenses) на вкладке «Деньги»? Default: no.
4. Сезон как период — брать активный рейтинговый период (как в отчёте «Организаторы и судьи»)? Default: yes.
