# Public GoMafia career contract

Verified 2026-10-12 using an unauthenticated Cloud Browser and the production source adapter (player 1202, Chagin). No GoMafia password, organizer rights, private backend, or paid protocol endpoint is used.

## Confirmed public sources

- `GET https://gomafia.pro/stats/1202`: `#__NEXT_DATA__ -> props.pageProps.serverData`. `user.id` establishes the player identity; `history` contains ID-linked tournament appearances and the player's own game number, seat, role, winning team and Elo delta. `historyTotal=13`; the default page contains ten appearances.
- `GET /stats/1202?tab=history&page=2`: observed after clicking page 2, then reloading to verify SSR. Returns the other three appearances. Client navigation does not rewrite the original `__NEXT_DATA__` script: reload or request a fresh document before treating it as current.
- `POST https://gomafia.pro/api/stats/get`, form-urlencoded `id=1202&period=all&gameType=all&tournamentType=all`: exact read request found in the public profile client and verified without cookies. Returns `result=success`, `data.user.id`, `data.stats` and `data.average_elo`. Period accepts `all` or the selected year. The browser's year selector changes these requests, rather than updating the profile URL.
- Confirmed selector values in the public client: `gameType=all|team|individual`; `tournamentType=all|fsm|club`; period `all` and years from 2022. Our imported yearly/all-time summaries explicitly use `all/all`; they are not mislabeled as the default 2026/fsm view. Club tournaments recorded by GoMafia remain **external sports career**, not local 2LA Noire protocols.
- `GET /tournament/:id`: only IDs discovered from that player's public history are requested. `serverData.tournament.id`, `status`, `is_hidden_result` and `tournamentResultWithFinal` / `tournamentResultWithoutFinal` expose results. Each standings row has `user_id`, `place`, `sum`. Select a unique exact ID row, prefer the finalist table when the player occurs in both. Never match by login, join charts by title, or substitute GG/Elo for score.

## Observed Chagin career

13 appearances, 164 player games, 83 wins (51%), Elo 1685.02. Published years: 2026 — 30 games; 2025 — 21; 2024 — 10; 2023 — 93; 2022 — 10. CHEATERS CUP 2026: tournament 2765, place 27, score 11.3. REStart 2025: tournament 1846, place 31, score 7.1. TULA MAFIA OPEN 2022: tournament 30, place 48, score 2.2. The public `chart.elo` points include exact tournament IDs and published after-tournament Elo values; show only these ID-linked points. The profile user Elo remains the **current** Elo for every year filter. The site's chart Elo deltas can differ from history (2022); preserve the history value, do not average/reconcile it into a guess.

Sanitized JSON fixtures in `src/tests/fixtures/gomafia` contain only public career fields, with unrelated profile/contact/session data removed. The complete career fixture is a captured source-adapter output, not synthetic records. Mocked tests validate contract handling; the separate live smoke is necessary evidence of source compatibility.

## Limitations

- Public future cards 2822 and 2788 showed registration-open status, participant counts, `registerStatus=null`, and no ID-linked participant roster. The public profile history only exposed played tournaments. The public tournament page client renders `usersCount` as text and only exposes `tournament/registerUser` for the signed-in account; that write method was not called. No public roster read or player-to-future-registration source was found in the inspected page client. **Registration unavailable** is not **player unregistered**. Do not enumerate tournament IDs, infer a registration from a count, scrape external chat lists, use session-only fields, or promise registration coverage from these samples.
- History exposes per-player tournament game numbers, not a global game/protocol ID. The stable key is provider + player ID + tournament ID + published game number. Duplicate game numbers fail closed. Tournament `games[].game[].table[]` publishes signed per-game `points` and `table_id`. Enrich only a unique exact player ID + game number + seat + role match; retain the original stable per-player game key and store the table ID separately. All 164 Chagin games were verified live with scores. A row’s `elo` is current, not historical, and is not imported as game Elo. Exact game dates and full event protocols are absent from the verified sources; store missing dates as null. Tournament dates are separate and are never substituted for game dates.
- Hidden results, absent ID rows or duplicate rows in one standings partition remain unavailable. A failed enrichment never invents a score; existing sourced values are retained with their older observation time. Error text records incomplete enrichment.
- A changed/incomplete history pagination fails without replacing the saved complete snapshot. History over 2,000 appearances fails with a bounded error. Each response is bounded to 2 MiB, each request to 15 seconds, each career pass to approximately three minutes. Large careers prioritize previously missing scores on subsequent passes.

## One refresh owner

`goMafiaFederationSync.ts` handles confirmation, profile reads and the production hourly worker. Only verified links refresh; max four concurrent profiles per database, six-hour snapshot TTL and failure cooldown. Data is replaced atomically under the existing `gomafia_player_snapshots` table's `career-v1` scope. Source tournament/game keys prevent duplicate records. There is no second manual or nickname-based importer. Club Elo, local games, tournaments, rankings, achievements and token balances are not written. Profile career API also honors the player's existing statistics visibility.

## Verification

Run `node --import tsx src/scripts/goMafiaCareerSmoke.ts 1202` from an environment that can reach the public provider. It prints only ID, retrieval time and career counts; it never accesses the runtime database. An optional output path captures the normalized public career for review. In a workstation whose normal egress requires an environment proxy, Node's `NODE_USE_ENV_PROXY=1` may be necessary for the smoke command; this is not an application deployment requirement.

Focused tests: `goMafiaCareerSource.test.ts`, `goMafiaCareerSync.integration.test.ts`, `goMafiaRoutes.integration.test.ts`, `goMafiaFederationSync.test.ts`. Mobile preview: `gomafia-career-preview.spec.mjs` at 360/390px, plus the independent achievement-paths preview. Release/deployment truth lives in `PROJECT_STATE.md`.

## Awards and nominations (probed 2026-10-12 from a GitHub Actions runner; the Claude cloud session cannot reach `gomafia.pro`)

- `GET /tournament/:id` → `serverData.nominations` = `{ best_red, best_mafia («Лучший чёрный»), best_don, best_sheriff, mvp }`; each is an ordered list of up to three `{ user: { id, login, … }, amount }`. The same tournaments expose the final standings with `place` (1 = winner) in `tournamentResultWithFinal` / `tournamentResultWithoutFinal`.
- `GET /stats/:id` → `serverData.history[].place`, `history[].prize`, `history[].nominations[]` (empty for the checked player; its winner flags are confirmed below), `stats.games_stats.prize_places`, `rewardsOpened`.
- There are no «cups» as objects: the federation publishes places and nominations only.
- Import rule (owner, 2026-10-12): the podium places 1–3 and the nominations of the tournaments of a VERIFIED link become awards of the club profile (`player_verified_awards`, `source_type='automatic'`, `source_key='gomafia:<externalId>:<tournamentId>:place|nom:<key>'`) by `goMafiaAwardsService.ts`, written when the career is refreshed. Awards only: no game is recounted, Elo, ratings and achievements are untouched. Matching is by the exact federation user id, never by nickname. Only the FIRST name of each nomination list is awarded (the winner of the nomination); the meaning of the 2nd and 3rd names is not confirmed, so nothing is claimed for them (their rank stays in the snapshot).

### Confirmation of the nomination rule (probe of player 1202, 13 tournaments, 2026-10-12)

The player's own page has `history[].nominations` = `{ "<key>_id": 1 }` exactly for the nominations in which the tournament page lists him **first**: 2023-07-22 `{best_red_id:1, best_sheriff_id:1, mvp_id:1}` ↔ list positions best_red#1, best_sheriff#1, mvp#1 (he is also 2nd in best_don, which is NOT in `history.nominations`); 2023-04-01 `{best_don_id:1}` ↔ best_don#1 (also 3rd in best_sheriff, not listed). So **the first name of a list is the winner of the nomination**, which is what `goMafiaAwardsService.ts` awards. Expected awards for 1202: cups 2023-04-01 and 2023-07-22 (1st places), medals 2023-09-16 (2nd) and 2023-06-03 (3rd), nominations: Лучший дон (2023-04-01); Лучший мирный, Лучший шериф, MVP турнира (2023-07-22).

### Nomination refresh correction (2026-10-12)

The observed ID-linked profile history marks winners with `<key>_id:1`; these published victories now survive an initial tournament-page read failure. A complete tournament nomination payload enriches published list positions; malformed/missing payloads do not prove zero wins and cannot inherit profile flags to create a new award. The profile fallback applies when the tournament request fails, not when a read payload is contradictory. Hidden results publish no nomination awards. Duplicate exact IDs in one nomination list are ambiguous and are not awarded. Only five categories exist; `best_mafia` means «Лучший чёрный», not a second distinct «Лучший мафия» award.

The existing award writer reconciles only its own automatic source keys for an authoritatively refreshed tournament. A removed/corrected winner is marked rejected (retained for audit), reinstatement reuses the same row, and temporary errors preserve earlier evidence. Manual/other-source awards and other players' rows remain untouched. Upserts and retractions share one SQLite transaction. Sanitized live nomination fixtures cover 616/507/2765, four Chagin victories and another player's `best_mafia` win.
