# Public GoMafia career contract

Verified 2026-10-12 using an unauthenticated Cloud Browser and the production source adapter (player 1202, Chagin). No GoMafia password, organizer rights, private backend, or paid protocol endpoint is used.

## Confirmed public sources

- `GET https://gomafia.pro/stats/1202`: `#__NEXT_DATA__ -> props.pageProps.serverData`. `user.id` establishes the player identity; `history` contains ID-linked tournament appearances and the player's own game number, seat, role, winning team and Elo delta. `historyTotal=13`; the default page contains ten appearances.
- `GET /stats/1202?tab=history&page=2`: observed after clicking page 2, then reloading to verify SSR. Returns the other three appearances. Client navigation does not rewrite the original `__NEXT_DATA__` script: reload or request a fresh document before treating it as current.
- `POST https://gomafia.pro/api/stats/get`, form-urlencoded `id=1202&period=all&gameType=all&tournamentType=all`: exact read request found in the public profile client and verified without cookies. Returns `result=success`, `data.user.id`, `data.stats` and `data.average_elo`. Period accepts `all` or the selected year. The browser's year selector changes these requests, rather than updating the profile URL.
- Confirmed selector values in the public client: `gameType=all|team|individual`; `tournamentType=all|fsm|club`; period `all` and years from 2022. Our imported yearly/all-time summaries explicitly use `all/all`; they are not mislabeled as the default 2026/fsm view. Club tournaments recorded by GoMafia remain **external sports career**, not local 2LA Noire protocols.
- `GET /tournament/:id`: only IDs discovered from that player's public history are requested. `serverData.tournament.id`, `status`, `is_hidden_result` and `tournamentResultWithFinal` / `tournamentResultWithoutFinal` expose results. Each standings row has `user_id`, `place`, `sum`. Select a unique exact ID row, prefer the finalist table when the player occurs in both. Never match by login, join charts by title, or substitute GG/Elo for score.

## Observed Chagin career

13 appearances, 164 player games, 83 wins (51%), Elo 1685.02. Published years: 2026 — 30 games; 2025 — 21; 2024 — 10; 2023 — 93; 2022 — 10. CHEATERS CUP 2026: tournament 2765, place 27, score 11.3. REStart 2025: tournament 1846, place 31, score 7.1. TULA MAFIA OPEN 2022: tournament 30, place 48, score 2.2. The site's chart Elo deltas can differ from history (2022); preserve the history value, do not average/reconcile it into a guess.

Sanitized JSON fixtures in `src/tests/fixtures/gomafia` contain only public career fields, with unrelated profile/contact/session data removed. The complete career fixture is a captured source-adapter output, not synthetic records. Mocked tests validate contract handling; the separate live smoke is necessary evidence of source compatibility.

## Limitations

- Public future cards 2822 and 2788 showed registration-open status, participant counts, `registerStatus=null`, and no ID-linked participant roster. The public profile history only exposed played tournaments. No verified public player-to-future-registration source was found. **Registration unavailable** is not **player unregistered**. Do not enumerate tournament IDs, infer a registration from a count, scrape external chat lists, use session-only fields, or promise registration coverage from these samples.
- History exposes per-player tournament game numbers, not a global game/protocol ID. The stable key is provider + player ID + tournament ID + published game number. Duplicate game numbers fail closed. Exact game dates, per-game score and full protocols are absent from this source; store them as null. Tournament dates are separate and are never substituted for game dates.
- Hidden results, absent ID rows or duplicate rows in one standings partition remain unavailable. A failed enrichment never invents a score; existing sourced values are retained with their older observation time. Error text records incomplete enrichment.
- A changed/incomplete history pagination fails without replacing the saved complete snapshot. History over 2,000 appearances fails with a bounded error. Each response is bounded to 2 MiB, each request to 15 seconds, each career pass to approximately three minutes. Large careers prioritize previously missing scores on subsequent passes.

## One refresh owner

`goMafiaFederationSync.ts` handles confirmation, profile reads and the production hourly worker. Only verified links refresh; max four concurrent profiles per database, six-hour snapshot TTL and failure cooldown. Data is replaced atomically under the existing `gomafia_player_snapshots` table's `career-v1` scope. Source tournament/game keys prevent duplicate records. There is no second manual or nickname-based importer. Club Elo, local games, tournaments, rankings, achievements and token balances are not written. Profile career API also honors the player's existing statistics visibility.

## Verification

Run `node --import tsx src/scripts/goMafiaCareerSmoke.ts 1202` from an environment that can reach the public provider. It prints only ID, retrieval time and career counts; it never accesses the runtime database. An optional output path captures the normalized public career for review. In a workstation whose normal egress requires an environment proxy, Node's `NODE_USE_ENV_PROXY=1` may be necessary for the smoke command; this is not an application deployment requirement.

Focused tests: `goMafiaCareerSource.test.ts`, `goMafiaCareerSync.integration.test.ts`, `goMafiaRoutes.integration.test.ts`, `goMafiaFederationSync.test.ts`. Mobile preview: `gomafia-career-preview.spec.mjs` at 360/390px, plus the independent achievement-paths preview. Release/deployment truth lives in `PROJECT_STATE.md`.
