# 2LA Noire — Current Project State

This file is the canonical **current-state snapshot**. It deliberately does not contain a long chronological history; Git commits and merged PRs own history.

**Single planning document:** maintain the current development queue in this file. Other documentation describes rules, architecture, or operating procedures; Git history preserves completed and superseded plans. Before treating a queue item as unfinished, compare it with the latest `main` implementation.

**Status date:** 2026-09-30

**Latest release record:** the current `main` baseline includes the completed organizer/player/Live Game UX audit through PR #268, canonical club-game betting plus durable personal/organizer/betting Telegram delivery from PR #273, profile integrity/verified awards from PR #274, and the completed three-part premium Player Profile delivery from PRs #275–#277: canonical profile core, verified awards/club history, factual player connections, organizer-curated referral history and player-to-player evening invitations. VK Player Cabinet access and personal delivery were introduced in PR #285; the operational follow-up for cabinet OAuth routing, restart-active VK outbox delivery, channel-neutral betting notifications, owner-initiated VK linking and trusted public callback URLs is implemented by VK-ACCESS-002 / PR #290 and remains subject to merge, deployment and runtime verification. CRM-PAY-003 / PR #292 implements factual regular-evening pricing at 100 ₽ per actually completed game with a 400 ₽ cap, debt-free RSVP/slot planning and application-level historical reconciliation; it remains subject to review, merge, deployment and runtime/data verification. The OBS Live Game broadcast bridge is implemented in current code and still requires deployment/runtime verification before it may be called live.

**Deploy mode:** Amvera combined Docker application; Git merge, deployment and runtime verification are three separate states.

**Live deployment:** PRs up to #567 were deployed by the owner and checked on 2026-09-30 (`/api/health` ok, served bundle contains them). PR #568 (squash `7887cafe`) is merged but **not deployed** yet. Anything merged later is not live until deployed and checked again (see «Handoff»).

The **actual current main SHA belongs to Git**, not this document. Always read it from remote `main` / `npm run project:status`; do not add a mutable “Current main” field here.

## Handoff (2026-09-30, end of the Claude session)

For the next assistant:

- **State:** deployed and checked: #563 «Дела», #565 «Приложение перезапускается», #567 «Игроки» tabs by the organizer's statuses + visits counted from game seats. Deployed as well: #568 — «Дела» as «Срочно / На этой неделе / Гигиена клуба» (добор 3 days before, «Думают», profiles of all club players, quiet curators), «Куратор направления» marks, TG/VK marks in the player list, «Другие города» tab, «Ещё на этой неделе» on «События», and the fix of «Данные и фото» (the player card's own sheets closed the card). #568 is deployed (checked 2026-10-01). The OBS remote (#570) needs deployment and a real laptop/OBS check before it may be called runtime verified. Amvera reports its own build SHA — compare the served JS bundle instead.
- **Production data (read 2026-09-30 through developer read access):** 38 evenings; all 32 past ones are cancelled copies (31 of 25 September, 1 of 18 September), so **no evening has been played in the app yet** and nobody has visits — visit-based «Дела» items are empty until the first played evening. Friday 2 October has two published evenings: novices 19:00 and club 21:00.
- **Access:** developer read access works: `POST /__developer-read/evenings`, `/evenings/:id`, `/evenings/by-date/YYYY-MM-DD` with header `X-Developer-Read-Key: $DEVELOPER_READ_KEY` (read-only). `DEVELOPER_READ_KEY`, `ORGANIZER_PASSWORD` and `TEST_ACCESS_PASSWORD` are in the Claude environment and on Amvera (values only there — never write them into the repository or chat). Sandbox test cabinet: `POST /api/test-environment/login`. When running the test suite locally, unset `ORGANIZER_PASSWORD`, `TEST_ACCESS_PASSWORD` and `DEVELOPER_READ_KEY` (three auth tests expect them absent; CI has none). Safety note for the owner: the organizer password was shared in chat and is short — suggest a long separate one.
- **Owner workflow rules:** Russian, plain words; questions through the interactive picker; bugs and wording fixed at once, new features proposed and started after «да»; at most 3 PRs per owner message for the GPT/Codex assistant only (the owner lifted the limit for Claude, 2026-10-04); each PR to green CI (Codex review comments answered and fixed), squash-merged by the assistant, then the owner gets the `main` SHA and deploys himself; never change production data.
- **Waiting for the owner:** the result of the first real broadcast (the 2026-10-03 tournament) on the one-laptop plan (item 37); a step-by-step broadcast guide only if the owner asks for it. The phone/USB-hub test is no longer needed.
- **Owner ideas 2026-10-01, to agree:** adjust the Elo system a little (future task, details to discuss).
- **Done 2026-10-01 (outside Claude, checked by Claude):** owner-only «Объединить профиль-дубликат» in the player card (a manual duplicate without Telegram/VK into a linked profile; the token journal stays with each profile, the balance moves as debit + credit; the merged row is hidden like the archive); music: two locked player slots («раздача» / «договорка», owner can repair a slot through the API only), the game's track is drawn from the evening's arrived players, «Сменить трек» removed.
- **Music, owner answers 2026-10-01:** tracks come from the people at this game's table, the judge included, deal and night from two different people (fixed in a follow-up PR); no «Сменить трек» is fine — the judge closes a Yandex track in Yandex Music, files have «Стоп». The owner wanted a button to repair or free a player's locked slot: «Данные и фото → Музыка игрока» (owner only).
- **Elo (owner, 2026-10-01):** the formula logic stays (confirmed against the owner's cases), no calibration; the owner wanted bigger numbers, so the whole scale is ×5 (same behaviour). On the first start after deploy a one-time migration (`0042_elo_scale_x5_v1`) stretches manual start Elo and rebuilds every rating. Idea for later: a seasonal Elo trim for everybody (for example cut 20% of the distance from 1000), to discuss when needed. Note: rating achievements start at Elo 1400 (`achievementCatalog.ts`) and become reachable on the new scale.
- **Next work:** nothing agreed; ask the owner.

## Source-of-truth model

- Code/current SHA: latest remote `main`.
- Current product/deploy/storage state and current queue: this file.
- Work procedure: `AGENTS.md` + `docs/RUNBOOK.md`.
- Runtime topology: `docs/ARCHITECTURE.md`.
- Feature routing: `docs/FEATURE_MAP.md`.
- Game/product rules: `docs/BUSINESS_RULES.md`.
- Visual contract: `docs/DESIGN_SYSTEM.md`.
- Old roadmaps, old chats and old PR descriptions: historical evidence only.

**Important:** the known open PR outside current `main` is draft PR #246, which is separate scoped work for manual club players/guests and historical lineup repair. It is not part of the completed UX audit and must not be mixed into unrelated fixes. `TOURNAMENT-EVENING-001` is implemented in PR #300 and is likewise not part of `main` until merged. Old closed PR descriptions are not backlog; always compare historical work with current `main` before treating it as unfinished product work.

## Production/runtime

### Hosting

- Canonical production target: one Amvera Docker application built from `main`.
- Public origin: `https://2la-noire-chagina7x.waw0.amvera.tech`.
- The container runs nginx, Node web/API and the integrated Python Telegram bot under Supervisor.
- `/api/health` is shallow liveness.
- `/api/health/runtime` is the safe deep canonical-DB/bot/Telegram check.
- Legacy Render is retained only as historical/fallback configuration, not the canonical deployment target.
- The separate `fainta7x/mafiabot` repository is legacy and is not the source selected for the combined deployment.

### Database — critical

Canonical Amvera product storage is persistent SQLite:

`/data/mafia_crm.sqlite`

`deploy/start-web.sh` hard-pins this path on every production start. Turso is retired: runtime selection no longer uses it, and production startup rejects stale `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` variables.

Existing non-empty `/data/mafia_crm.sqlite` always wins over repository checkpoint/bootstrap data. The checkpoint is used only when the canonical file is missing or empty.

The Python bot still has legacy local state at `/data/mafia_crm.db`; it is not the canonical product database and must never replace or seed `/data/mafia_crm.sqlite`.

The production application contains a password-protected manual sandbox at `/test-login`. A signed test-session cookie switches requests from `/data/mafia_crm.sqlite` to the separate `/data/mafia_crm.test.sqlite` file while reusing the real Player Cabinet, CRM and Live Game UI. The sandbox starts from an empty schema plus synthetic seed data, never from the production checkpoint. Production sessions and background delivery workers remain attached only to the production database. A sandbox organizer login issues a `test_sandbox` organizer session that is honoured only together with the sandbox player session; it never authorizes production CRM routes (organizer session version 3 revoked all earlier tokens).

Repository checkpoint files are bootstrap/recovery artifacts only:

- `mafia_crm.checkpoint.sqlite.gz.b64`
- `mafia_crm.checkpoint.meta.json`

Canonical product backups are created by `deploy/backup-sqlite.cjs` into `/data/backups/` with SQLite's backup API and integrity verification. Use `npm run backup:verify -- <backup.sqlite>` for an isolated restore drill. Amvera's own `/data` snapshots are a separate platform-level safety layer.

Never overwrite/reset/restore a non-empty production SQLite file as a normal bug fix or deploy step.

## Current product state

### Player application

The public split-vote trainer linked from Player Cabinet includes basic and advanced personal-vote questions and an interactive whole-table level. In the interactive level the player processes nominees in nomination order, assigns each of the ten seat cards once or skips a nominee, reviews the distribution, and receives one final check. Practice and exam each run for five questions; the exam ends on the first incorrect full distribution. The level also offers endless practice. Passing the basic exam unlocks advanced; passing advanced unlocks interactive and mixed endless training. Passed exams persist per authenticated player in SQLite, while anonymous visitors can only practice basic questions. Deployment of changes must be verified separately.

Implemented and connected:

- first-visit routing for actual Mafia novices versus experienced visitors: novices can choose their path and book a novice evening immediately; experienced visitors require organizer approval before self-registration;
- canonical novice progression state (`club_stage`) kept separate from playing access (`game_level`), channel-neutral Telegram/VK decision notifications and player-visible novice visit/free-price state;

- Telegram/session authentication and canonical Player Cabinet shell;
- events/calendar/registration and multi-game slot planning;
- games/history/statistics/career/replay;
- rating/Elo/rating periods;
- one canonical premium player profile shared by self and other-player views, with mobile-first hero/overview, paginated completed-game history, role analytics and Elo history;
- directory/rating identities open the same state-preserving player profile so Back returns to the prior screen instead of a duplicate profile implementation;
- weighted profile-completeness state with exact missing fields, profile-update timestamps and a non-blocking Player Cabinet reminder that can be dismissed for the current visit and disappears after completion;
- player self-service editing for canonical identity/contact data, optional day/month birthday with optional year and explicit birthday privacy, while linked Telegram identity remains system-owned;
- official verified awards kept separate from application achievements, ratings and game/tournament statistics; players may only submit pending suggestions/corrections and only verified awards are visible in player/public profiles;
- premium verified showcase with owner-pinned awards plus a club-history timeline built only from verified/system facts and organizer-authored milestones;
- factual player-to-player connections calculated only from completed games, including shared-table, same-team and opponent counts;
- organizer-curated historical `invited_by` / invited-player club relationships; historical referrals are never inferred or fabricated from nicknames or game history;
- player-to-player invitations from another player's profile to an eligible upcoming evening the inviter is already attending, with duplicate/self/format/limit protection, in-app inbox/notification and durable Telegram outbox delivery; accepting an invitation never creates a booking automatically;
- wallet/tokens/shop/manual accounting plus canonical club-game betting: one 90-second server pool per game, spectator-only eligibility, idempotent stake/payout/refund ledger writes, active bet/coefficient state and settled history in Player Cabinet;
- the Live Game start boundary is fail-open: after local setup validation the judge proceeds immediately, while betting synchronization reports `ready`, `disabled`, `pool_failed` or `notification_failed`; `LIVE_BETTING_ENABLED=false` remains an emergency betting-only kill switch;
- judging/conduct surfaces and speech recording;
- exactly two personal music slots in the player profile;
- staff/judge music library and playlist;
- judge game launcher and in-game music controller.

Profile-completeness, verified-award, premium-profile, referral and invitation schema changes are additive/idempotent. Historical awards and referrals are never auto-inferred; manual/historical official awards or club-referral records do not create games/tournaments or affect Elo, statistics or rankings. Birthday congratulations are not sent automatically.

The mobile Player Cabinet has been audited at narrow phone widths. Current navigation/content density, game history, profile, events, wallet, club and live-evening surfaces are the post-audit baseline; future changes should start from a reproduced issue rather than an assumed pending mobile redesign.

### Player ↔ Organizer navigation

This is **already implemented** and must not be presented as future work.

- Player Cabinet and Organizer CRM are two modes of one application.
- `src/App.tsx` owns route-level transitions between `/player/*` and `/admin/*`.
- `src/components/ProductModeSwitch.tsx` provides the bidirectional switch.
- Switching modes does not log the user out and does not bypass permissions.

### Music system

This is **already implemented** and must not be presented as an unfinished “build music database/player” project.

Implemented surfaces include:

- player personal music slots;
- persistent staff/judge music library;
- `JudgeMusicPlaylist`;
- `JudgeGameMusicController` during conducted games;
- event/live music pool behavior.

Future music work should start from a concrete missing behavior or UX request, not from an assumption that the music subsystem does not exist.

### Organizer CRM

Implemented and connected:

- **Ещё → Развитие** for experienced-player approval, novice/experienced routing, attendance/completion tracking and manual promotion to the main club;
- next-NOVICE operational timing for the Thursday 20:00 group check and Friday 15:00 decision, explicitly without automatic cancellation;

- organizer auth/entitlement tied to canonical player identity;
- Today/command center;
- evenings/calendar/workspace;
- announcements, responses and game-slot planning;
- participants, walk-ins, attendance and payments;
- tables/games/protocol workflow;
- player CRM, tasks and analytics;
- player profile integrity with completion percentage/missing-field filters, private contact/birthday data, last profile update/check state, upcoming birthdays and duplicate-safe actionable organizer tasks;
- verified official-award administration, including organizer-only manual/historical entry, explicit legacy historical import, player suggestion approval/rejection/correction and trusted automatic awards only from completed tournament data;
- commerce/admin data;
- Telegram/VK/system diagnostics;
- music administration/context links.

Recent reliability/UX work includes:

- CRM startup renders after overview/evenings are ready instead of waiting for the full player aggregate; slow startup requests are measured in the browser console;
- CRM overview is a read-only path; canonical payment reconciliation remains on game/payment mutation paths instead of rerunning across historical debts on every open/resume;
- Player Cabinet and organizer player records use the same historical-debt eligibility: completed/settled, factually attended, non-waived and still unpaid; upcoming planned payments remain separate from debt;
- regular CASUAL evenings use one canonical factual price: 100 ₽ per actually played completed game with a 400 ₽ cap; RSVP/slot plans do not create debt, regular defaults/slot estimates normalize to 100 ₽, and historical legacy charges are repaired by the idempotent CRM-PAY-003 application reconciliation rather than manual production edits;
- quick attendance/payment row actions update in place instead of refreshing the whole workspace;
- mounted roster/payment lists provide search and counter filters; clearing search restores the selected filter; staff assignment stays in a collapsed section;
- active in-progress evenings accept existing database players who arrived without prior registration;
- closed-evening payment edits remain available through the canonical payment service;
- repeated payment/pricing reconciliation is idempotent and must not create duplicate financial ledger rows;
- closeout distinguishes planned response from factual attendance;
- active-evening operations use compact primary navigation, with secondary tasks/tables/closeout grouped behind a mobile-friendly More action;
- Today prioritizes organizer attention items instead of passive empty dashboard space;
- event type/period/view/format filters remain available without presenting every filter layer at equal visual priority;
- manually added/check-in participants remain in the working roster without fabricating a positive RSVP response;
- closeout is presented as an attendance/payments/games/blockers checklist while retaining existing safeguards and exact blocker reasons;
- next-game preparation stays inside the active Evening workspace instead of forcing a navigation detour;
- Players quick segments and exact activity filters are mutually consistent, expose truthful active state, and use a fixed 3+2 phone grid rather than a horizontal micro-scroll;
- opening a player profile no longer performs a redundant hidden full-list request, and creating a manual player refreshes the visible Players list immediately;
- CRM Rating opens directly, automatically selects the current active period when available, and falls back predictably without changing rating calculations.

For CRM-PLAYER-UX-001 / PR #307, the organizer player card explicitly separates four independent concepts: `game_level` is playing skill/access, `club_role` is relationship/status in the club, `judge_level` is hosting/judging qualification, and `organizer_player_access` is the separate actual Organizer CRM entitlement. `club_role=organizer` does not grant CRM access; grant/revoke of CRM access does not modify the other three fields. A revoked identity-bound entitlement remains revoked even after a correct organizer-password login; the password-only root organizer flow is explicit and separate from player-bound authorization.

A registered external/occasional player remains a canonical account and is not a guest placeholder, even where the stored compatibility value is `club_role=guest`. A true guest placeholder has no account/profile, Elo, tokens, or Telegram/VK identity and cannot become an editable registered-player profile. Profile role edits do not alter CASUAL fee treatment: regular-evening waivers remain evening-specific.

PR #307 repository checks, tests and UI preview verify repository behavior only. They do not prove that the same revision is deployed on Amvera or that real Telegram/VK identity-bound sessions work; deployment and real runtime verification remain separate.

The requested broad CRM/cabinet/Live Game usability audit has been completed in current `main`. Do not resurrect old redesign roadmaps as backlog. Future UX work should start from a newly reproduced issue, new user feedback, or a deliberate new design request.

### Tournament evening registration — PR #300

`TOURNAMENT-EVENING-001` is implemented in PR #300 as an additive registration/preparation layer over the existing canonical tournament engine.

Repository implementation includes:

- organizer creation/editing with title, date/time, venue, canonical judge, exact 10-player capacity, entry fee, prize fund/allocation and notes;
- explicit publication/open/close registration lifecycle, readiness summary and stable `/player/events/<tournamentId>` copy link;
- Player Cabinet calendar/detail for tournament registration, reserve position, cancellation and manual payment-report status;
- first ten eligible players confirmed, deterministic FIFO reserve after capacity, judge exclusion and atomic reserve promotion on confirmed cancellation;
- organizer manual add/remove/promote/reorder with required audit reasons;
- two-stage tournament entry-fee claims where player reports `pending` and only organizer `confirmed` counts as money; tournament fees remain isolated from CASUAL pricing/debt, wallet tokens and betting;
- channel-neutral publication/promotion/payment notifications routed to at most one linked Telegram/VK channel for the canonical player identity;
- confirmed roster synchronization into `tournament_participants` before seating so the pre-existing tournament conducting/protocol/standings/awards/results/Elo/token modules remain the only tournament engine;
- additive schema plus focused regression coverage that does not rewrite synthetic historical tournament/participant state.

PR #300 is **not merged or deployed merely because this branch contains the implementation**. Historical `Турнир Богдана 1.08` remains a read-only regression reference; real production standings/compensation/awards/three-output verification and real Telegram/VK WebView screenshots remain post-merge/deploy runtime checks. See `docs/TOURNAMENT_EVENING_RUNBOOK.md`.

### Evening / Telegram response flow

Current approved behavior:

- `Буду` / `Иду` selects all current game slots automatically;
- `Приду позже` records late intent without inventing exact game choices;
- `Пока думаю` records thinking without exact game choices;
- `Не буду` clears game-slot selections;
- manual game-slot selection uses the canonical save route and is expected to persist;
- closed/past Telegram announcement history is preserved instead of overwriting the old message with only “registration closed”.

### Games and protocol recovery

Implemented:

- completed games can be opened in explicit correction mode where supported;
- pending/failed final game saves are recoverable;
- a stale local pending save is rebased onto the current server roster by seat so old local player IDs cannot silently replace the canonical roster;
- a pending game exposes protocol editing instead of trapping the organizer behind only “retry save”.

### Live Game

The real club launcher currently provides:

- roster confirmation before role dealing;
- roles hidden by default with manual reveal, including the bare-engine fallback;
- phase-aware day/night/voting flow with explicit phase-step labels plus visible day/night and round context;
- a phone-first judge HUD that receives a dedicated full-width working row instead of being squeezed by player cards;
- voting hierarchy that separates current candidate, assigned votes, remaining votes, assigned voters and the exact next action without a nested voting scroll area;
- explicit voting/transition actions such as next candidate, finish voting, next speech, start revote and go to night;
- the automatic final-candidate vote remainder remains explicit before the judge commits the voting result;
- editable vote assignment: a voter can be moved directly between candidates, and undo restores an editable voting state;
- destructive confirmation remains limited to genuinely consequential transitions rather than routine hosting actions;
- repeated split/revote speeches only once per unchanged disputed set;
- exact raise/leave table-decision voter selections survive snapshot undo/recovery instead of being reconstructed from aggregate input;
- player actions and fouls available throughout active play where appropriate, including direct removal/PPK after a player leaves the table and PPK after removal;
- alive/killed/voted-out/removed state is textual as well as visual, while PPK remains a separate discipline marker and does not overwrite the canonical killed/removed state;
- night shot/Don/Sheriff markers scoped to their actual subphase;
- consistent Undo snapshots across voting, zero round and best-move/protocol overlays;
- actual day-starter rotation based on the previous **actual** starter, skipping absent/dead seats;
- `+30с за 2 фола` during an eligible current speech after zero round;
- protocol/best-move announcement buffers increased by five seconds;
- local session recovery;
- death/protocol work remains inside the Live Game flow rather than forcing a separate navigation context.

The club launcher also publishes a dedicated OBS Browser Source overlay:

- one stable secret URL for the main broadcast channel;
- a transparent 1920×1080 HUD with the current game number, ten player identities, roles and alive/out status;
- role emblems (owner, 2026-10-01, after a club-stream reference): neutral cards with a large portrait; the role is a round emblem on the photo — pink heart on white (мирный), black pistol on white (мафия), black hat on purple (дон), star on yellow (шериф). Seat chips elsewhere use the team colours: red, black, purple, yellow;
- the evening score in the top bar: red and black wins in the evening's other finished games (counted by the server from `protocol.winner_team`);
- «Ход игры» on the left (owner, 2026-10-01: what happened stays on screen until the end of the game) as two blocks: «Ночи» (shot or miss, Don's and Sheriff's checks; the seat colour shows the result) and «Дни» (who left and by whose hands), starting from the first night; the current night fills in live. Built from the engine's own game log (`nightLogs`), so it survives a phone reload;
- live layout (owner, 2026-10-01): «OBS и трансляция» → «Размер графики» has a 60–140 % slider and a show/hide switch for the top bar, «Ход игры» and the player cards, plus «Сбросить как было». The layout is kept in memory and in `broadcast_overlay_layout`, sent with every public frame, and the overlay applies it within a second, without a build (`BroadcastLayoutControls.tsx`, `/api/games/broadcast-overlay-layout`);
- player cards: players who left get a grey photo with an «Убит / Заголосован / Удалён» stamp; the speaker is lifted in gold; nominated players carry an orange «Выставлен · N-м» strip; the card lists how and when the player left, by whose hands (the judge's device keeps each day's last fixed vote in `mafia_live_broadcast_votes:<gameId>`), the killed player's best move and protocol; fouls are dots, technical fouls are spelled out («техфол», «большой техфол»);
- ordered nominations, with the nominating seat where available;
- voter-to-candidate assignments only after the judge fixes the voting result; partial collection is never shown;
- transient server relay only: the phone remains the recoverable Live Game source and timer ticks are not written to Turso.

Approved game behavior remains governed by `docs/BUSINESS_RULES.md`.

## Integrations

### OBS / Twitch broadcast

Connected through the Live Game modal and `/broadcast/<secret>` Browser Source route. The secret URL is returned only to an authorized organizer or the assigned judge. The public `/live` screen remains a separate safe view and must not receive roles, checks or unfinished voting detail.

The current relay is intentionally one main in-memory broadcast channel for one streamed table. A Node restart or phone connection loss leaves the last frame visible; the phone heartbeat republishes the current local snapshot after connectivity returns.

The OBS Studio remote (owner, 2026-10-01): the organizer's phone runs Live Game and the broadcast; OBS runs on the laptop in the commentary room (its camera and microphone for the commentators) with `/obs-bridge` open. The phone shows buttons for the agreed scenes «Заставка» (готовимся к игре), «Стол», «Стол + комментаторы», «Комментаторы», «Перерыв», «Итоги», mute switches for every sound input, and «Начать/Остановить эфир» and recording. The table camera must be a second device at the table (any old phone with VDO.Ninja over Wi-Fi), because the organizer's phone runs the game and the laptop is in another room. Not yet checked with real OBS. Full-frame scenes by the same secret link (owner idea 2026-10-01): `/broadcast/<secret>/lobby` for «Заставка» — «Готовимся к игре» with the next not-yet-played game's seating (today's tournament first, else today's club evening; `broadcastLobbyService.ts`, `BroadcastLobbyScreen.tsx`) — and `/broadcast/<secret>/standings` for «Итоги» — the tournament table; both links are in the active game's «OBS и трансляция» window.

### Telegram

Connected:

- Mini App/player entry;
- announcement APIs and Python bot bridge;
- response/game-slot synchronization;
- preservation of historical announcement messages after an evening closes;
- durable direct-message outbox with stable message keys, retry/backoff state, partial-failure recovery and deduplication of already-sent events;
- personal reconciliation that queues invitations/status reminders, completed game/Elo changes and betting results without requiring Player Cabinet to be opened;
- betting-open notifications to linked eligible spectators, excluding the ten seated players and canonical judge;
- organizer notification recipients: explicit `ORGANIZER_NOTIFICATION_IDS` / `ORGANIZER_CHAT_ID` win; when neither is set, alerts go to the linked Telegram accounts of players holding CRM access (`organizer_player_access`, the canonical owner by default); `ADMIN_IDS` and `BACKUP_ADMIN_ID` are not silently reused unless the dedicated backup opt-in is enabled;
- organizer Telegram settings expose recipient configuration/runtime diagnostics and an explicit test-notification action;
- synchronization/outbox paths;
- organizer runtime diagnostics;
- independent GitHub Actions runtime monitor with Telegram outage/recovery notifications when secrets are configured;
- weekly Friday calendar/announcement reconciliation.

Green CI proves the code/test/container contracts only; it does not prove the live bot token, explicit organizer recipients, webhook/runtime connectivity or deployed SHA. Verify those after Amvera deploy.

### VK

Connected in repository code:

- Player Cabinet OAuth starts at the exact `/api/integrations/player/vk/start` route used by the shared UI; public evening registration remains isolated under `/api/public` and cannot authorize the full cabinet;
- OAuth state remains browser-bound, PKCE-protected, rate-limited and one-shot, with `return_to` restricted to `/player` paths;
- production callback and confirmation links use the configured trusted public HTTPS application URL instead of trusting the request Host header;
- an authenticated player can explicitly link VK from owner-only profile/settings to the same canonical `player_id`; an identity already owned by another player is rejected without changing the current session;
- personal notifications select at most one linked external channel according to the canonical player preference;
- the durable VK message outbox starts during normal application bootstrap and immediately resumes pending/retryable rows after process restart;
- betting-open spectator notifications use the channel-neutral personal router, include VK-only eligible spectators, preserve the Telegram WebApp action and give VK recipients a Player Cabinet action link;
- organizer delivery diagnostics derive delivered/pending/failed betting state from the actual Telegram/VK channel outboxes;
- public join/live endpoints, organizer runtime diagnostics and Friday publication remain connected.

These are repository-level guarantees only. After PR #290 is merged and deployed, verify the deployed SHA plus one real VK login/link, one successful VK test notification, one permission-denied case and one betting-open notification to a VK-only test player before calling VK cabinet access live.

## Recent real-world validation

The latest real club evening reported by the user completed without a core Live Game failure after the recent game-flow fixes. The requested follow-up audit has since addressed the confirmed Player Cabinet navigation/information architecture, CRM organizer workflow, RSVP truth, mobile density, rating-entry and Live Game voting/readability issues in focused regression-tested PRs.

The betting/Telegram lifecycle from PR #273 is covered by integration acceptance tests for CRM and assigned-judge game start, one 90-second pool per game, player/judge exclusion, idempotent stake/payout/refund handling, Player Cabinet active/history state, durable Telegram retry/deduplication, personal invitation reconciliation and explicit organizer recipients.

The profile work through PRs #274–#277 is complete in `main`: weighted completeness/privacy and verified official awards are followed by one canonical premium self/public profile, completed-game/role/Elo analytics, owner-pinned verified awards, verified club history, factual completed-game connections, organizer-curated historical referrals and duplicate-safe player-to-player evening invitations with in-app plus durable Telegram delivery. Focused tests cover connection aggregation, invitation deduplication/delivery/eligibility, organizer-only referral maintenance and the earlier profile integrity/award contracts. The final #277 head passed TypeScript, lint, the full test suite, production build/container startup, Gitleaks, CodeQL and UI preview before merge.

VK-ACCESS-002 adds focused Supertest/auth/outbox/betting/channel regressions for the exact cabinet start route, separation from public join auth, restart-active VK delivery, VK-only and dual-linked betting notification routing, owner-only linking, cross-player identity conflicts and trusted public callback URLs. Repository verification is still distinct from the required post-deploy VK runtime pass.

CRM-PAY-003 adds focused pricing/reconciliation regressions for 0/1/2/3/4/5+ completed CASUAL games, legacy 600 ₽ durable repair, correction/idempotency, debt-free planned slots, CRM/Player Cabinet debt consistency and non-CASUAL isolation. Production rows such as Kawasaki's historical evenings are intentionally not claimed verified until the reviewed revision is merged, deployed and checked against the live database through normal application paths.

TOURNAMENT-EVENING-001 / PR #300 adds focused organizer/player registration, exact-capacity, reserve-promotion, canonical-roster synchronization, manual payment/audit, calendar/deep-link, one-channel notification and additive historical-schema regressions. Repository checks remain distinct from the required real `Турнир Богдана 1.08` read-only runtime comparison and Telegram/VK mobile WebView evidence after deployment.

This real-world success and automated coverage are useful evidence, but they are not substitutes for runtime verification after a new deploy. The next meaningful validation step is a manual/runtime pass against the merged `main` after deployment.

## Publishing after the 2026-09-25 incident

On 2026-09-25 an evening auto-cancelled for shortfall was recreated by the rolling calendar and announced again in a loop. #496–#498 closed the loop and added an emergency pause. The follow-up on 2026-09-26 added duplicate safeguards in the bot, the outbox, the shortfall call and VK (listed in `docs/RUNBOOK.md` → «Emergency weekly publishing pause») and made publishing run by default. Deploying that `main` lifts the pause; `WEEKLY_EVENING_AUTOMATION_ENABLED=false` brings it back. Runtime check after deploy: the calendar has no duplicate evenings for one date, and exactly one pinned router post in the public group.

## One-time plan for 2 October 2026

On the first weekly automation run after deploy, `src/server/services/oneTimeEveningPlans.ts` moves the 2 October club evening from 20:00 to 21:00 (with its games) and opens a novice evening «Вечер для новичков» (rules 18:30, two games 19:00–21:00). It runs once (key `one-time:2026-10-02-novice-friday` in `club_weekly_automation_runs`), never after 18:00 Moscow on 2 October, and keeps anything the organizer already did by hand. Both evenings are announced by the weekly automation (Monday 19:00 Moscow, or at once if that time has passed). Remove the plan after 2 October.

The same runner moves upcoming club evenings still at 20:00 to 21:00 once (key `one-time:club-evenings-start-21`); new club Fridays are created at 21:00 (owner decision 2026-09-28).

## Current queue (organizer flow, approved 2026-09-24)

Rules: `docs/BUSINESS_RULES.md` → «Organizer flow and payment targets».

1. ~~Evening route with stages and the «Мы собрались» photo post gate~~ — built: the evening's «Маршрут» tab, `GET /api/evenings/:id/route`, `/api/evenings/:id/gathered-post` (Telegram `sendPhoto` to the format's destination, VK wall photo via the organizer user token; the first game of an `active` evening returns `gathered_post_required` until the post is published or skipped).
2. Organizer and judge accountability.
   - Built: an organizer is required to start an evening; a club or explicitly guest judge is required per game; token rewards (judge 200 per game, organizer 1000 per closed evening); organizer achievements.
   - Also built: «Провёл вечеров / Отсудил игр» on the CRM player card and in the player's career profile, and the CRM «Аналитика» report «Организаторы и судьи» for this or last calendar month, the rating season or all time (`GET /api/analytics/staff`).
3. ~~«Порядок в клубе» on the home screen~~ — built: it replaced the home «Задачи» card. It checks:
   - evenings not closed, drafts without an announcement, no organizer, an empty week, a skipped «Мы собрались» post;
   - players with an undetermined level;
   - duplicate nicknames, per group, with a «Это разные игроки» dismissal that comes back if a new namesake appears; there is no merge tool for real duplicates yet, only archiving the empty profile;
   - players without Telegram and VK, players absent 90+ days;
   - unfinished protocols and debts over the last 60 days.

   The code is in `clubOrderService.ts`.
4. Payments per evening type: novice prepayment, rating entry fee with a season prize fund share.
   - Built:
     - Free novice visits go only to players with the «Новичок» level.
     - Prepayment at the table: `POST /api/games/evening/:id` returns `prepayment_required` with the seated players who still owe on NOVICE and RATING evenings. The game create sheet shows them with an «Оплатил» button.
     - Tournament registration by answers («Играю» / «Готов подменить» / «Пока думаю» / «Не смогу», `POST /api/tournaments/evenings/:id/answer`). It replaces the overflow reserve. The payment deadlines at 3 days and 24 hours are enforced by the personal notification worker (`enforceTournamentPaymentDeadlines`), with a reminder at 4 days.
     - Tournament organizer: `tournaments.organizer_player_id` (club role «Организатор»), chosen in the tournament settings. Completed tournaments count in «Провёл вечеров», the staff report and the organizer achievements.
     - Shortfall (`eveningShortfallService.ts`, run by the personal notification worker):
       - 3 h before, an automatic group call through the existing Telegram recruitment post;
       - 1 h before, when fewer than 10 (novice 8) have said they come, automatic cancellation with notices; after the start, also by fully checked actual attendance; existing games or sufficient recorded attendance require organizer review; past evenings without games can be cancelled for shortfall from closeout;
       - every cancellation notifies players who were coming or thinking.
     - Rating entry fee: one 500 ₽ fee per evening (`src/lib/ratingEveningMoney.ts`), recomputed together with novice charges; only players pay; the organizer and judges pay only when they play. The organizer payments panel shows the 50/40/10 split of what was collected; the split is not shown to players.
     - Table size (`src/lib/tableComposition.ts`): novice evening games may seat 8 or 9 (roles per `BUSINESS_RULES`); every other game stays at exactly 10. Game creation (CRM sheet and judge launcher), the club protocol, token settlement, the Live Game deal/speech order/overlays and the OBS state follow the game's size. Betting opens only for 10-seat games; tournaments stay at 10.
   - Left:
     - recording the rating winner's and judge's payouts (club finance module).
5. Plain wording across the CRM.
   - First pass done: screens, server error messages and bot texts no longer show technical words (ID, JSON, ledger, RSVP, slots, «канонический», webhook).
   - The organizer area is called «кабинет организатора» on screens, and an unfinished game protocol reads «Не завершена» / «Открыть для правки».
   - Continue as found. The user delegated wording choices (2026-09-24): fix them without asking, and ask only about game, mechanics or club-specific meaning.
6. Online checkout (after self-employment registration).
7. Club finance: evening revenue, expenses, organizer and judge payouts, fund allocations (for example a % of each evening for club needs, the season prize fund).
8. One announcement system for every format: an event created in the in-app calendar automatically gets an information post with registration in the right Telegram and VK groups (and later the website), respecting which player statuses may join which evenings.
9. Automatic «добор» call (user request 2026-09-24).
   - Today the evening's Telegram card has a manual «Позвать в общий чат» button (`EveningTelegramCard.tsx`, `eveningAnnouncementRoutes.ts` / `botAnnouncementRoutes.ts`), Telegram only.
   - Target: when games are short of players, the app itself posts a friendly call in the same Telegram/VK group as the main announcement, for example «Всем привет! Нас пока не хватает — записывайтесь активнее».
   - To agree before building:
     - when and how often it is sent (for example the day before and on the day);
     - whether VK gets it too;
     - whether the organizer confirms it or it goes fully automatically.
10. Parallel games of different formats (user request 2026-09-24, for later).
   - Target: two or more tables running at the same time, possibly in different formats (for example a novice table next to a rating table).
   - Today:
     - an evening can already have several tables (`evening_tables`), and each table stores a `format` label;
     - but every rule follows the evening's format, not the table's: price and prepayment, Elo, table size, the required judge level, the rating fee split;
     - Live Game keeps one unfinished game per device (`mafia_live_session` in local storage), so each table needs its own judge phone.
   - To agree before building:
     - one evening with tables of different formats, or separate evenings at the same time;
     - how the player registers and pays when formats differ;
     - which tables and games the organizer and the OBS overlay see at once.
11. Achievement overhaul (user request 2026-09-24, for later).
   - Today: 44 achievements in `src/lib/achievementCatalog.ts`, earned by counters (games, wins, Elo, judged, organized, role wins, ПУ, a game without fouls).
   - The user finds the names and the difficulty poor. Examples:
     - generic names repeat across categories («Мастер», «Легенда», «Мастер побед», «Легенда побед»);
     - Elo steps start at 1400 («Начало пути»), although everyone starts at 1000;
     - the role section has one win per role;
     - «Идеальная игра» is just a game without fouls.
   - To agree before building: the list of achievements, their names in the club's noir style, the thresholds and rarity, and what happens to achievements players already have.
12. Shop, donations and micro-purchases (user request 2026-09-24).
   - Today:
     - the token shop (`ensurePlayerShopSchema.ts`, `PlayerWalletHub.tsx`) sells three items: «Купить роль на игру», «Заказ музыки», «Бесплатный вечер»;
     - purchases are redeemed by hand by the organizer;
     - tokens are earned only in the club: coming to an evening (500 at the start after signing up, 400 late or without signing up; `eveningAttendanceRewardService.ts`), games, judging and organizing.
   - Target:
     - finish the shop and add interesting goods and services;
     - design donations and purchases for real money.
   - Real-money purchases depend on the online checkout (item 6, after self-employment registration).
   - To agree before building:
     - the new items and their prices;
     - which items are for tokens and which are for money, and whether tokens can be bought;
     - what donations give the player (a thank-you, a badge, nothing that affects the game);
     - how purchases are redeemed at the evening.
13. Learning portal, rules and glossary (user request 2026-09-24).
   - Built: «Школа мафии», the public page `/guide` (no sign-in). Its texts live in `src/lib/clubGuide.ts`; they are an assistant draft approved as the starting point, for the club to edit.
     - The home screen opens with four section cards: «Уроки», «Тренажёры», «Справочник» and «Статьи». Below them are the last opened screen («Вы недавно открывали») and the novice path with «Продолжить». Sections come from the catalog `src/lib/guideCatalog.ts`. Each section has its own screen (`/guide?tab=trainers|reference|articles`) with entries grouped by topic. Every entry ends with «Ещё в разделе» (the rest of its section), and the header shows which section the screen belongs to.
     - Each screen has an address (`/guide?tab=<id>`, `/guide?tab=lessons&lesson=2`), and the phone or Telegram back button returns to the previous screen. Rules open topic by topic, roles one at a time, and the glossary filters by letter.
     - Lesson and self-check progress is remembered only in the browser, with no rewards or effect on player status.
   - Links: the player events tab and CRM «Ещё → Памятка новичку».
   - Left: club-approved video links, any assessed/rewarded tests, and optional saved learning progress if approved.
   - Target:
     - a rules and regulations section in a convenient format;
     - a glossary of Mafia terms (ПУ, ЛХ, ППК, фолы, договорка and so on);
     - a learning portal with lessons, texts, links to videos and tests.
   - It must work as a link that can be sent to a novice before the first evening, readable without signing in.
   - To agree before building:
     - the source texts (the club's regulations, which rules set);
     - which videos to link;
     - whether passing tests gives anything (tokens, an achievement, a level step towards «Клубный игрок»).
14. Mini-games and in-app activities (user request 2026-09-24).
   - The player's home screen links to the trainers section `/guide?tab=trainers`. The zero-round split-vote training has basic (pair includes №1, 2–4 nominees), advanced (pair excludes №1, random nomination order), and interactive whole-table (3–5 nominees) levels. The learner's seat never belongs to the split pair. Practice and exams have five randomly generated questions; practice reports the score and exams require 5/5. Passing an exam opens the next level for that account; passing advanced also opens mixed endless practice. The interactive level offers its own endless practice. The expert level (after the whole-table exam) rescues a broken split in 15 seconds per task (`src/lib/splitVoteExpert.ts`, `SplitVoteExpert.tsx`); rules in `docs/BUSINESS_RULES.md`. Progress has no rating or token effects; the expert exam gives the «Нулевой пациент» achievement. The separate «Попил на троих» trainer (9 people at the table, `src/lib/splitThreeTraining.ts`, `SplitThreeTraining.tsx`) has five levels with exams: easy, medium, «Сложный» (a broken split, 15 s), «Кого пилить» and «Экспертный» (two sheriffs); logic of the two new levels in `src/lib/splitThreeBreak.ts`. All split trainers show the table as a picture (`src/components/public/guide/SplitTableMap.tsx`): killed, nominated, split, sheriff claims and who votes where. The organizer sees results in «Ещё → Обучение» (filters by nickname, level and result) and on the player card.
   - Target: activities inside the app between evenings to keep players interested.
   - Ideas to discuss:
     - daily quizzes on the rules;
     - «угадай роль» from famous games;
     - predictions for the evening's games;
     - weekly challenges;
     - a streak for coming to evenings.
   - To agree before building: which activities, what they give (tokens, achievements), and that nothing affects Elo or the game itself.

15. «Новости бота» in the club Telegram group (user idea 2026-09-28).
   - A topic in the main club group for release notes about new features, written for players.
   - Each post can invite players to try an activity (a trainer, a quiz) for a reward.
   - To agree before building: posted by the bot or by hand, how often, and which rewards (tokens, achievements).
16. Tournaments of club players on gomafia (user idea 2026-09-28).
   - Collect from gomafia.pro the federation tournaments that club players took part in or registered for.
   - Post a call in the group to support them, and possibly show results on the player profile.
   - To check before building: whether gomafia has an API or allows reading its pages, and how to match a gomafia profile to a club player (the player links it themselves).

17. Organizer notifications, next steps (user request 2026-09-28).
   - Built: instant alerts when a player signs up or cancels after «Иду» (bot, app, VK) and when a free-evening credit pays an evening; new player, experienced-player application, shortfall and tournament alerts existed before.
   - Next, to agree:
     - forward a player's free-text message to the bot to the organizer with a «Ответить» button (today such messages reach nobody);
     - a player «Я перевёл» button with an organizer «Подтвердить оплату» alert;
     - a separate alert for «Приду позже» or a cancellation in the last 3 hours before an evening;
     - an alert when a Telegram or VK announcement fails;
     - the evening digest on a schedule (morning and 3 hours before) instead of on every change.
19. Bot home card built (2026-09-28), split by audience at the owner's request: newcomers get a short friendly menu (what the game is, novice evenings, frequent questions, write to the organizer); club players get a three-row card (app, «Расписание», «Мои записи», «Составы», «☰ Ещё» with stats, rating, tokens and shop, learning, groups, questions). Owner rule: menus stay short — at most two buttons per row, no full-screen button walls. Next ideas for the bot, to agree: reminders on the evening day with «Всё в силе?». Built 2026-10-01: after the evening is closed each player gets one personal message for the evening (games with role and result, rating points, Elo, buttons «Мои игры» and «🤝 Позвать друга»; owner chose one per evening instead of one per game) — `queueEveningPlayerCards` in `src/server/services/clubResultPostService.ts`; the friend's link `/start ref_<player id>` records the inviter for a newly registered player (`player_referrals.source = 'invite_link'`, an organizer-set inviter is never replaced) and thanks the inviter in the bot. The owner (2026-10-01) then asked for pictures instead of text in the chat: the club game blank after each game and the evening summary at closeout are posted to the evening's Telegram group, the summary together with the season-so-far table of the rating period as one album, with Elo changes and the judge's avatar (`clubResultPostService.ts`, rules in `BUSINESS_RULES.md` → «Game results in the club chat»).
20. «Ещё → Уровни и роли» built (2026-09-28): the organizer marks several players and sets «Уровень игры», «Как часто ходит» (incl. «Перестал ходить» — no personal announcements), «Роль в клубе» and «Ведёт игры» at once; each choice shows what it changes. Organizer cabinet access is not changed there — only in the player card. Owner feedback 2026-09-29 done: the owner can also set «Может проводить» marks there (owner-only on the server), every choice has a one-line explanation, a «Что изменится» summary shows before saving, the result shows by the button (it used to appear at the top, out of sight), and the list has quick filters (organizers, helpers, who hosts, who runs evenings, regular, stopped) and sorting (nick, most evenings, recently came, newest). Next step with the owner: go through the player list together and set levels and roles.
21. Roles and duties redesign (owner decisions 2026-09-28, built in steps):
   - Done: every new player starts as «Новичок»; the «Пока не знаем» level is retired (one-time migration `2026-09-retire-unrated-level`).
   - Done — «Может вести» instead of trainee/host/judge levels: independent marks per evening type (для новичков / клубные / рейтинг и турниры), in the player card and «Уровни и роли» (`src/lib/hostFormats.ts`).
   - Done — club roles: «Организатор клуба» = cabinet access (one setting); «Владелец» alone gives/takes organizers, deletes players and sees club money (`isClubOwner`/`requireClubOwner` in `src/server/auth.ts`). Owner (2026-09-28): nobody else gets the organizer role for now; «Матроскина» and «Гриня» are ordinary players (startup no longer assigns the role by nickname; one-time reset `2026-09-nickname-organizers-to-players`).
   - Done — «Организатор вечера» (owner chose 2026-10-01): an assigned player runs only that evening from the limited cabinet «Мои вечера» (arrivals, payment, tables, games, start, closeout) even without «Может проводить» marks; the evening's details stay with the owner (`canUseEventHostRoute`, `assignedOpenEveningCount` in `src/server/auth.ts`, `eventOrganizer` in `/api/auth/me`).
   - Done — limited cabinet «Проводит вечера» (owner decisions 2026-09-29, see BUSINESS_RULES): owner-only marks `organize_formats`; server scope `canUseEventHostRoute`; `EventHostCabinet` («Мои вечера» in /admin). Not yet checked on a phone screen by the owner.
   - Done — «Свои ивенты» (owner answer 2026-09-29): fourth «Может проводить» mark and a separate non-Mafia event model (`custom_events`) with no games or Mafia statistics. Organizer and marked host create a draft with title, description, cover, start/end, sign-up deadline, venue, limit, price, open/closed sign-up, visibility for everyone / club / selected invitees, selected announcement destinations and optional +1. Manual publication exposes it in the player calendar; player detail supports sign-up/cancel and capacity. «Отправить анонс» manually delivers to the selected Telegram channel, club group, VK and/or visible players through bot DMs. Delivery is recorded per destination; sent/uncertain calls do not retry automatically and this feature is not connected to weekly Mafia automation.
   - Done step 1 (owner, 2026-09-30: «да, сейчас») — «Куратор направления» marks in the player card and «Уровни и роли» (filter «Кураторы»): Новички, Обучение, Ивенты и активности, Турниры, Дисциплина, СММ (`players.curator_areas`, `src/lib/curatorAreas.ts`; any organizer sets them; no rights in the app; not for players from another city). «Дела» reminds the organizer about a curator whose direction was quiet for 14 days (BUSINESS_RULES «Дела»). Done step 2 (owner chose 2026-10-01) — curator tasks: `curator_tasks`, `curatorTaskService.ts`, organizer panel «Задачи кураторов» under «Дела» (`CuratorTasksPanel.tsx`), the curator's «Мои задачи куратора» on the player home (`CuratorTasksCard.tsx`), a bot message on each new task. Next: bonuses (tokens, a discount, achievements, a free evening for N tasks) — to agree.
   - Earlier plan — curators instead of «Команда клуба». Owner-approved directions: «Новички», «Обучение», «Ивенты и активности», «Дисциплинарный комитет» (bans and the evening conduct rules), «СММ» (photos, posts, stories), «Организация турниров». Each curator sees their tasks in the app, marks them done and earns bonuses: tokens, a discount on the evening, achievements, and a free evening for N completed tasks. Also proposed, not yet confirmed: «Возвращение игроков», «Ведущий-наставник», «Партнёрства», «Хозяин вечера».
22. Announcements feedback (owner, 2026-09-29, after the 2 October announcements):
   - Fixed — the novice evening of 2 October got no announcement while the club one did. A failed personal invitation (a player who blocked the bot) stopped that evening's whole weekly run before the VK post, and a failed run was never tried again. Now the channel post, the invitations and VK go on their own, a failed run retries every ~30 minutes until the evening starts (without messaging players again), the novice evening's public-channel post is checked too, and a Friday 21:00 evening is no longer outside the Monday 19:00 sync window. Runtime check after deploy: both 2 October evenings have a VK post and a Telegram post.
   - Fixed — the long app links in the VK post: one line each, «📝 Записаться и посмотреть, кто идёт» and «👤 Личный кабинет», with vk.cc short links (remembered in `announcement_short_links`), or the app's own short path `/e/<code>` if VK refuses.
   - Done — club photos above announcements: the organizer uploads them in CRM «Ещё → Telegram» («Публикации клуба» → «Фото для анонсов»), each for all evenings or one kind; photos are kept in the database (`announcement_photos`, `src/server/services/announcementPhotoService.ts`) and served at `/announce-photo/<id>.jpg`; each evening gets one of the matching photos (the same one on every edit), shown in Telegram as a large preview above the channel post and the personal invitation (`handlers/announcement_cover.py`). VK uploads the selected picture once with the API-compatible organizer token, remembers the attachment and adds it to the same wall post; without that token the text post still works and the photo is added on a later sync. A drawn cover was tried and rejected by the owner.
   - Done — announcement text (owner, 2026-09-29; the first rewrite was rejected): club evening posts (Telegram channel, personal invitation, VK) use the owner's short text «Привет! В пятницу, 2 октября, играем в мафию — ждём тебя 🎭 / 📍 place, time · price / Отметь кнопкой ниже, придёшь ли, и выбери игры» — in the Telegram group post the lists of who is coming (by game, «Пока думают», «Придут позже», declined) stay under that text (owner, 2026-09-29, after first seeing the post without them). Novice posts start with «🎓 Вечер для новичков: никогда не играли — приходите, всему научим!», then when/where, sign-up and the novice group links; «why the game is fun» moved to the end (`src/shared/novicePromo.json`: `headline`, `groups.telegram` fallback link).
   - Done — the VK sign-up page (`/join/<id>`, `PublicJoinView.vk-direct.tsx`) now goes step by step (owner, 2026-09-29): sign in through VK at the top, pick games (nothing is saved yet), press «Записаться»; later changes are saved with «Сохранить изменения» (or «Отменить запись»). Before, each tap on a game saved at once, with no confirmation.
   - Done — the novice group post and the novice personal invitation invite to play in the same style: «Привет! В пятницу, 2 октября, играем в мафию с новичками — приходи 🎭 / Никогда не играл — не страшно: в 18:30 объясним правила, потом сыграем вместе. Можно прийти одному. / place, time · price». Every Telegram group post names everyone who answered, those who cannot come included («❌ Не смогут (N): …»).
   - Owner report 2026-09-29: the novice post did not appear in the Telegram novice group and the group link was missing. The bot posts to «Игры для новичков» only when that destination is active with a chat ID (CRM «Ещё → Telegram»); the VK link used to require it to be active too (now any saved invite link is used). Owner gave the group (2026-09-29): chat `-1003925510303`, announcements topic `128`; set once at startup (`2026-09-novice-group-destination` in `ensureTelegramPublishingSchema`, later CRM changes kept) and due open novice evenings are synced once. The join link `https://t.me/+UBvwCzPMd4c2N2Iy` is in `src/shared/novicePromo.json` (`groups.telegram`); a member-only `t.me/c/…` link saved in CRM is ignored in posts.
23. Tournament and custom-event setup (owner report 2026-09-29, preparing the 3 October tournament):
   - Fixed — the tournament organizer: the one who creates a tournament becomes its organizer; the «Организатор» and «Судья» choice is always visible at the top of «Турнирный вечер» (it was hidden in the folded «Параметры турнира»); club organizers and players marked «Может проводить: турниры» may be chosen (server and screen agree).
   - Done (owner, 2026-09-29) — «Может проводить» has five marks: новички, клубные, рейтинговые вечера, турниры (separate from rating), свои ивенты. Old «Рейтинг и турниры» holders got both rating and tournament marks once (`2026-09-organize-tournament-mark`). Rating seasons stay with the owner and club organizers (already so).
   - Done (owner answered 2026-09-30) — «Судья вечера» and the publish rule (see BUSINESS_RULES «Судья вечера»); owner as default organizer and judge for novice and club evenings; upcoming ones filled once (`2026-09-default-evening-staff`).
   - Fixed 2026-09-30 — any evening, player or task edit wrote defaults for fields it did not mention (zod 4 `.partial()` keeps `.default()`): renaming a draft published it and could reset its kind, places and price; a player card edit reset Elo to 1000 and tokens to 0. Elo is rebuilt from games; token balances were checked read-only on production on 2026-10-01: every balance equals its `token_ledger` sum (10 players with tokens, 26 with none) — no repair needed.
   - Done 2026-09-30 — «Перестал ходить» is saved even when the mailing is already paused for another reason or the player is blocked.
   - Earlier note (2026-09-29): a draft may be incomplete, but publishing an evening or tournament needs an organizer and a competent judge — rating evenings and tournaments always, novice and club evenings too (organizer and judge able to run that kind). Open questions before building: the weekly automation publishes club evenings on Monday by itself — who is put as organizer and judge there, or does it wait; an evening has no single judge today (judges are set per game), so an «evening judge» field is needed.
   - Fixed — a tournament with registration no longer shows the old «Изменить состав» (all ten at once) and «Редактировать данные» forms; players are added one by one in «Участники», settings live in «Турнирный вечер».
   - Fixed — «Свои ивенты»: a draft can be edited or deleted (published ones can be edited or cancelled); the block is named «Свои ивенты — не мафия» and sits below the evenings so it is not mistaken for evening or tournament creation.
   - Done (owner approved 2026-09-29, before the 3 October tournament) — one tournament screen in four steps for tournaments with registration: «Параметры» (settings, organizer, judge) → «Участники» (players and payments) → «Игры» (start, seating, games, per-game judge) → «Итоги» (standings, nominations, Telegram). The screen opens on the next unfinished step; finished steps are marked ✓. Tournaments made the old way keep their old screen (`TournamentDetailView.tsx`, `TournamentDetailViewBase.tsx` `hideHeader`/`tabs`).
24. Tasks and the 2026-09-25 evening copies (owner report 2026-09-30):
   - Fixed — every cancelled copy of the repeated 25 September evening kept an open «Закрыть вечер» task, so «Все задачи» was full of them. Open tasks of cancelled or deleted evenings are now cancelled and a closed evening's closeout task is done (`closeTasksOfEndedEvenings` in `eveningCloseoutService.ts`, run on every task list and home load). Nothing is deleted.
   - Fixed — «Сегодня» shows «Мои задачи» (overdue and today, the rest one tap away in «Все задачи»); before there was no link to tasks on the home screen.
   - Fixed — «События → История» keeps cancelled evenings in a folded «Отменённые · N» list, so the copies no longer fill the history. The owner may still ask to delete them from the database (not done: production data).
   - Next, to agree with the owner — automatic organizer tasks for club upkeep (owner idea 2026-09-30): write to players with an incomplete profile, to players absent for a long time, and to curators (learning, events and so on) who have done nothing for a while; a periodic «check profile cleanliness» task when the owner has not checked for some time. Together with curators (item 21) — the owner noticed the curator roles are not in «Уровни и роли» yet (they were agreed, not built).
   - Owner (2026-09-30): decide a bit later. Open questions: (1) thresholds — 30 days absent for regulars, 14 for novices after the first evening, 14 days of curator inactivity, the profile check every 7 days; (2) what a complete profile is (photo, Telegram or VK, phone, level — which are required); (3) «curator did nothing» = no finished task, or a per-direction measure (a lesson, a post); (4) curator bonuses now or as a second step (proposed: second step). Proposed order: curators + automatic tasks first, bonuses later.
25. ~~«Из другого города»~~ — built (owner approved 2026-09-30): a fourth «Как часто ходит» answer, a «Из других городов» filter, and «Я гость из другого города» at the first application / on «Сегодня». Rules in `docs/BUSINESS_RULES.md` (next to «Как часто ходит»). Runtime check after deploy: mark one player, see only the level and «Рейтинг и турниры» in the panel; that player is not in the next club evening's personal announcement list.
26. «На этой неделе» on «Сегодня» (owner, 2026-09-30) — built: every evening and tournament of the next 7 days, one tap to open (`WeekEventsPanel.tsx`; a tournament opens inside «События»).
27. Organizer-made profiles that players claim later (owner approved 2026-09-30) — built. Creating a player, editing the card and the photo existed before. New: the card's «Привязка профиля» block shows which Telegram/VK is linked, makes a one-time personal «Ссылка для привязки» (14 days; a new link replaces the old one; `playerClaimLinkService.ts`, table `player_claim_links`) — the Telegram link `t.me/<bot>?start=claim_<code>` links in the bot at once, the web link `/player?claim=<code>` asks «Это ваш профиль?» after VK/Telegram sign-in; and a «Страница VK» field (`vkProfileLinkService.ts`). The bot, when a nickname is taken, asks «Это твой профиль?» and sends the organizer the usual link request — only for a profile without its own Telegram/VK; a nickname whose profile already has an account (owner, 2026-09-30: «Чагин») is simply taken, in the bot and in the app: the person is asked for another nickname and the organizer gets nothing (the existing private Telegram confirmation for a VK sign-in stays). Runtime check after deploy: make a link for a test profile, open it in Telegram, see «Профиль привязан»; paste a VK page and see it linked.
28. Organizer tasks redesign (owner, 2026-09-30: «возьми полностью в проработку логику, навигацию, задачи, интерфейс»). Today tasks come from five generators (`organizer_tasks`: closeout, first-visit feedback, lapsed return, profile integrity per missing field, onboarding level) and «Порядок в клубе» is a separate computed list (`clubOrderService.ts`); the home screen showed neither well.
   - Done step 1: «Закрыть вечер» only once the evening has started (future ones are hidden until then); «Мои задачи» on «Сегодня» counts every open task.
   - Fixed with step 1 (owner reports 2026-09-30): «Ходит иногда» could not be set for a helper or an organizer (one `club_role` value held both) — now `players.attends_sometimes`; every status transition is covered by `playerStatusMatrix.integration.test.ts`. Tournament roster changes no longer require a comment.
   - Done step 2 — «Дела» (`organizerAgendaService.ts`, `GET /api/crm/agenda`, `OrganizerAgenda.tsx`): one list instead of «Задачи» + «Порядок в клубе», grouped «Сейчас / На этой неделе / Когда будет время», order computed from time and impact; the home screen shows the urgent part, «Ещё → Дела» the full list («Свои задачи и выполненные» keeps the old task list). Items about many players are one item with a list and Telegram/VK links; «Написал» records the contact in the player's history and hides the person for the item's quiet period; any item can be put off for 1/3/7/30 days; checks disappear when fixed. Owner thresholds (2026-09-30): regulars after 14 days (2 Fridays), «иногда» after 28 days, «перестал ходить» once in 60 days, novices asked after the first evening, profiles by the player's own profile banner. The per-field profile tasks and «Вернуть игрока в клуб» tasks are no longer created (open ones closed once, migration `2026-09-agenda-replaces-player-tasks`). Manual tasks stay (owner is not sure they are needed).
   - Visits for «Дела» and the player list count game seats as well as «пришёл» marks (owner 2026-09-30, `playerVisitsService.ts`); «Игроки → База» tabs follow the organizer's statuses (BUSINESS_RULES «Player base tabs»). An empty «Дела» shows what was checked (players, players with visits, last visit, open tasks) and any source that failed.
   - Done step 3 (owner, 2026-09-30: «проработай как по науке») — «Срочно / На этой неделе / Гигиена клуба». Urgent: «Добор» 3 days before an evening short of «Иду» (who has not answered, regulars first), «Думают», payment (debts, protocols), unclosed evenings. Club upkeep: profiles of every club player (not only those who came), absence lists, novice after the first evening, quiet curators, base order. Applications and link requests stay on «Сегодня» with their own buttons. Rules in BUSINESS_RULES «Дела». On production the list was empty because no evening had been played in the app yet (all 32 past evenings are cancelled copies), so visit-based items had nothing to show.
   - Built (owner «да» 2026-10-01, «люди игнорируют голосование»): «Напомнить неответившим» goes out by itself 48 h before an evening, once, in the daytime (`eveningAutoReminderService.ts`, table `evening_auto_reminders`; rule in BUSINESS_RULES «no answer»); the evening's announcement panel says whether it went out.
29. Safe owner-only duplicate-profile merge (owner approved 2026-10-01) — built. Only a linked keeper and an unlinked manual CRM profile can participate; preview, exact nickname confirmation, conflict blockers, one transaction, token-ledger transfer, Elo rebuild, claim-link revocation, merged tombstone and audit are implemented (`playerProfileMergeService.ts`, `PlayersCRM.tsx`).
30. Music section — work on it and improve it (owner, 2026-09-30; details to agree).
   - Built 2026-10-03 (owner): the current Yandex «Поделиться» playlist link `/playlists/<id>` is accepted; a player's two slots take tracks only, playlists are for the organizer's club library. Idea to keep (not built, to agree later): playlists in a player's slot as a paid privilege through the compendium, a subscription or VIP.
31. Online games inside the app, if possible — for example online poker for club tokens (owner idea 2026-09-30; to research and agree: legal limits of games with tokens, rules, who plays when).
   - Poker room MVP built 2026-10-01 (GPT, rules fixed by Claude the same day): «Poker» button in the player's top bar → `/player/poker`; Texas Hold'em for 2–8 players with **play chips only** (1000 each, not club tokens), one test bot, 20 s per move plus a 60 s reserve. Files: `pokerEngine.ts` (rules, side pots, showdown), `pokerLobbyService.ts` (rooms), `pokerRoutes.ts`, `PlayerPoker.tsx`. Built since: the next hand is dealt by itself 6 s after a hand ends; seats sit on the chairs of the table picture (layouts for 2–8 players, viewer at the bottom), bets lie between the player and the pot; quick bets like poker rooms (Мин, 2.5/3/4 ББ before the flop, ½/¾/банк after, олл-ин) with a slider; minimum raise = last raise; up to 7 test bots that think 1.2 s; the showdown names hands («Две пары: дамы и девятки») and lights up the winning five cards.
   - Built after the owner's live test (2026-10-01): the table stays open — anyone sits down during a game and plays from the next hand; «Выйти» gets up (cards of a running hand are folded, the table passes to another person, an empty table closes); a player whose move time runs out is «Отошёл» (not dealt in, keeps the seat and chips) until «Вернуться за стол», and «Отойти» does the same by hand. The table uses the full phone width; seats on the chairs; the move shows as a coloured tag above the avatar (Пас/Чек/Колл/Бет/Рейз/Олл-ин — «Бет» is the first bet on a street, «Рейз» any raise); D/SB/BB lie on the felt with the player's bet; a timer ring runs around the avatar of the player to act and a bar on your own plaque (green — base time, orange — reserve); the street is in the header; before the flop your hand reads as one combination, «Пара валетов» or «Старшая карта: валет» (owner, 2026-10-02: the high card is the combination itself, so no separate «кикер» name); cards are drawn by CSS (the face picture has grey margins).
   - Built 2026-10-02 (owner's phone test): a permanent «Общий стол» always listed first — it never closes, deals by itself once two players with chips sit down, any seated player may add bots, and when the last person leaves it clears the bots and waits; sitting down there shows the table at once («Ждём второго игрока», «+ Посадить бота», no set-up screen), and «+ Бот» in the table's bottom row seats a bot at any moment, also mid-hand (it plays from the next deal); «Взять 1000 фишек» for a busted player (play chips); hand history of the last 20 hands per table («История»: board, each player's result, cards shown only if revealed at a showdown or your own, moves by street; served by `/history`, never inside the public lobby); pre-moves while waiting for the turn («Чек / Пас», «Чек», «Пас», «Колл N», «Колл любую»: a tap toggles, «Чек» and «Колл N» drop when the bet changes); the latest move in words under the board, a street banner («Флоп», «Тёрн», «Ривер») and a pulsing active seat. The table is a fixed 400×640 canvas scaled to the phone, so plaques, bets, the pot and the board no longer overlap on short screens.
   - Built 2026-10-02: Poker state is durable in the active SQLite database (`poker_runtime_state`). A restart/deploy restores tables, the exact in-progress hand (deck, pot, turn and timers), the last 20 hands and human player bankrolls. Closing the app keeps the seat; explicitly leaving saves the current stack and the next table entry uses it instead of issuing another 1000. One human account may sit at only one table, so reconnecting cannot duplicate a saved stack. Production and the in-app sandbox use their own database rows. Bot opponent-learning profiles are still process-memory only and reset on restart.
   - Fixed 2026-10-02: after returning to the Telegram Mini App from the background, the poker table remeasures against the current visible viewport instead of retaining Telegram's transient compact height. The shared viewport controller re-expands and performs delayed resynchronization, so the table no longer becomes narrow with a large empty gap above the fixed action panel.
   - Fixed 2026-10-02: the short Telegram landscape viewport keeps the poker table at a readable width and allows vertical page scrolling instead of shrinking the canvas to exactly the viewport height. This also fixes the mobile preview regression.
   - Fixed 2026-10-02: right-side poker seats stay inside the table canvas on narrow Telegram screens, the compact header no longer wraps its blind label into the controls, and hole cards are presented high-to-low (QJ rather than JQ).
   - Fixed 2026-10-02: poker motion is slightly slower and smoother, the showdown pause is 4 seconds, and the turn header explicitly shows base and reserve seconds. Reserve time is server-persisted and can recover only passively at 1 second per completed minute while the player is not spending the clock, so reconnecting cannot reset or refill it.
   - Fixed 2026-10-02: Telegram player entry now requests the session and player profile in parallel, shows a clear slow-network message after 6 seconds, and routes gateway/timeout responses to the existing retry screen instead of leaving the player on an unexplained spinner.
   - Strong training bots (built 2026-10-02, `src/server/services/pokerBot.ts`): preflop by position from a 169-hand strength order (open, 3-bet with suited-ace bluffs, defend, 4-bet, push/fold under 12 BB), mixed at range edges; after the flop every option (check/fold, call, bets of 1/3, 2/3 and a pot, raises) is compared by EV in chips, using Monte Carlo equity against the opponents' likely ranges, pot odds, implied odds for draws and fold equity. Ranges narrow with the line (a raise after the flop and river action mean strength; a tight or passive player's bet more so). Each finished hand updates every player's tendencies (hands played, raises, fold to a bet, aggression), blended with population priors from public statistics; bots bluff more against folders and value-bet thinner against callers. Cash games use chip EV; ICM (Malmuth–Harville) and a risk premium are ready for future tournaments (`payouts` option). Simulation: about +25…+40 BB/100 against a tight-aggressive rule bot over 40 000 hands, about 0 against itself. Opponent-learning profiles remain in process memory and are not rebuilt from the now-durable hand history after a restart.
   - Poker art pass completed 2026-10-02: generated transparent 2.5D assets now provide a deck lying flat in the table perspective (`deck-flat-noir-v2.webp`), a compact face-down opponent pair (`opponent-hole-cards-noir-v1.webp`) and chair-integrated leather seat plaque/avatar frame (`seat-plaque-noir-v1.webp`, `seat-avatar-frame-noir-v1.webp`). `PlayerPoker.tsx` uses the new assets without changing the approved seat/bet layout (`CHAIRS`, `betSpot`).
   - Table polish (owner screenshot 2026-10-02): seat plaques are clean CSS leather (fixed 84 px, thin gold edge, Inter), not stretched pictures; opponents show two neat card backs beside the avatar; card faces use vector suits with mirrored corner indices and one centred suit; bets and D/SB/BB are placed in pixels from the seat so they never slide under a plaque on short phone screens. The poker harness takes `?players=6&board=3` for a fuller visual check.
   - Not built: club tokens.
31. Integration with the club website (owner, 2026-09-30; much later): the site is https://fainta7x.github.io/2la-noire-site/ (GitHub Pages, a separate repository `fainta7x/2la-noire-site`, built apart from the app). The owner wants a business-card site with what the club needs: the calendar of evenings, possibly ratings, photos, contacts. Not started; when it comes up, agree what the site shows from the app and whether it reads app data or links into the app (item 8 also plans announcements «later on the website»).
32. «Приложение перезапускается» instead of a bare 503 (owner, 2026-09-30, before bringing new players in) — built: the app shows the note with the organizer's contacts and retries by itself when the server does not answer or answers 502/503/504 (`src/lib/maintenance.ts`, `App.tsx`); a service worker (`public/sw.js`) serves the last good app shell or the same note (`public/maintenance.html`) while the hosting is down; nginx serves that note when the web process restarts inside the container (`deploy/nginx.conf`). The bot needs nothing: Telegram keeps webhook updates and delivers them after the restart, so replies only come late. Limits: a first-ever visit during an Amvera redeploy still sees the hosting's page (no service worker yet); iOS Telegram may not run service workers. Runtime check after deploy: open the app once, then during the next restart it shows the note.
33. «Сейчас в приложении» (owner idea 2026-09-30, approved: online + screen, only the owner sees it, players are not told) — built: the app reports its open screen every 15 s while on the display (`src/lib/presence.ts`, `POST /api/presence`); kept in process memory only, no database writes (`presenceService.ts`); the owner sees the list at the top of «Ещё → Аналитика» (`OnlineNowPanel.tsx`, `GET /api/presence`, owner only). A person counts as online for 90 s after the last report.
18. Live content in the Telegram entry channel — built 2026-10-01 (owner chose: automatic, all formats): «Мы собрались» photo, evening summary picture and a weekly season table go to the `public` destination (`postPublicGathered`, `postPublicEveningSummary`, `postWeeklySeasonTables` in `clubResultPostService.ts`). Needs the `public` destination set in «Ещё → Telegram» (on 2026-10-01 it had no chat). Funny moments / own posts from the app — not built, the owner may ask later.

34. Novice ratings and selection into the main club (owner, 2026-09-30) — very much later. Until then moving a novice to the main club is only the owner's manual decision; the app does not remind about it.

35. Live Game judge screen, a more «volumetric» look (owner idea 2026-10-01) — **on hold, do not start without the owner's «да»**. The owner is happy with the current Live Game layout and controls (`src/components/LiveGameEngine.tsx` and `LiveGameEngine/`): keep the same screen, places, buttons and flow; at most a 2.5D/volumetric finish of the existing elements later. No poker style, no new markers, no table redesign.

36. Broadcast scenes follow the game (owner idea 2026-10-01, to discuss after the first stream test; not built): OBS scenes switch by themselves with the game — «Заставка» while seating, «Стол» from the role deal, «Перерыв»/«Комментаторы» between games (the commentator's job is to entertain viewers during breaks), «Итоги» at the end. The owner is not sure «Стол + комментаторы» is needed. Today scenes switch only by the judge's buttons in «OBS и трансляция» (`ObsRemoteCRM.tsx`, scene names in `src/lib/obsScenes.ts`).

37. Broadcast, next steps in the owner's order (2026-10-01; **the hardware plan in step 3 and the answer below were superseded on 2026-10-03, see the next paragraph**): (1) the overlay graphics — done and approved on screenshots (#616), including live size sliders in «OBS и трансляция» → «Размер графики»; sizes still to be checked in a live game; (2) ~~a frame around the commentator window~~ — built 2026-10-03 as the Browser Source `/broadcast/frame`; (3) the hardware plan. Minimum on site: one laptop (goes to the commentary room) + the organizer's phone (runs the game, switches scenes, mutes inputs), plus the owner's home PC, which stays at home; maximum: a second laptop. Everything must work with the minimum and only get better with more. Answered 2026-10-02 (not yet tried live): the home PC stays the OBS server at home (everything is already set up there) and streams to Twitch; the laptop in the commentary room sends its camera and microphone over VDO.Ninja; the table camera and microphone are USB devices on a hub plugged into the organizer's phone (risk to test first: the phone may stop the camera when the browser tab goes to the background while Live Game is open); OBS «Автоматически переподключаться» plus the phone's «Начать/Остановить эфир» cover a dropped stream, remote desktop (RustDesk/AnyDesk) as a fallback; scenes move between computers by OBS scene collection and profile export/import; (4) refresh the generated images (tournament seating, game results, standings, official results with nominations, club game blank, evening summary, season table): first screenshots of each with problems, then the owner picks priorities; (5) **donations for streams and tournaments — open, high priority (owner, 2026-10-03; not ready for the 2026-10-03 tournament, wanted by the next one):** they go through DonationAlerts (its own alert widget and styling tools in OBS; the owner does not want a donation banner on the stream). Still to set up with the owner: the DonationAlerts page and widget in OBS, alert look, and what donations pay for. Ask the owner before building anything in the app.

   - **Hardware plan as of 2026-10-03 (owner, set up and tested with ChatGPT on 2026-10-02; replaces the plan above):** the home PC as OBS server and the phone as camera hub / scene remote are **dropped**. For the 2026-10-03 tournament: one laptop with the table camera and microphone attached runs OBS and the stream, and the owner runs the game (Live Game) on it; a second laptop is the commentators'. Everything was configured and worked in the owner's test. The frame around the commentators' window (item 37.2) is built as a transparent Browser Source page `/broadcast/frame` (`BroadcastCommentatorFrame.tsx`; static, no token, no server request; optional `?label=`, `?names=`, `?plate=top`; sized in 1/1920 of the source width, put above the VDO.Ninja source with the same size). Not yet seen in a live stream. Donations (owner, 2026-10-03): through DonationAlerts with its own alert widget and styling tools; no banner on the stream; the setup stays an open high-priority task (item 37.5). Answers (owner, 2026-10-03): the commentators' laptop reaches the stream through VDO.Ninja; scenes are switched by hand in OBS itself (not through «OBS и трансляция»); as far as the owner knows ChatGPT changed no code for this setup (not checked by Claude); the owner's test on 2026-10-02 went fine. The first real stream (the 2026-10-03 tournament) is still to be recorded. The earlier items about the phone remote, home-PC OBS and the phone-background camera risk are no longer the plan.

38. Mafia as an imperfect-information game (owner idea 2026-10-02, optional and far off, not started): try to compute Mafia the way poker solvers do — strategies for votes, nominations and checks from the information each role has — for training and for analysing games.

39. Handoff 2026-10-02 (the owner moves to ChatGPT until the weekly limit resets; read this first). Done and merged today: broadcast overlay rework + size sliders (#616), strong poker bots (#618), clean card faces and plaques (#619); #620 (permanent «Общий стол», hand history, pre-moves, rebuy, readable play, fixed-canvas table, preflop label «Старшая карта: валет») — check that it is merged and deployed before starting. Next in order, each needs the owner's «да» before work: (a) ~~commentator frame~~ built 2026-10-03 (item 37.2); (b) ~~hardware plan test~~ replaced by the one-laptop plan (item 37.3); (c) refresh of generated images (item 37.4: screenshots first); (d) donations through DonationAlerts — open, high priority (item 37.5); (e) ~~poker persistence~~ built 2026-10-02. Ideas parked: auto-switching scenes (36), Live Game volumetric look (35, on hold), Mafia as an imperfect-information game (38).
40. Evening gathering fixes (owner, 2026-10-02, built): «Иду» without exact games now shows as all games in the roster (no «Идут, без игр» bucket); the route's «Ответы игроков» is done once nobody is silent («думает» counts as an answer); «Набор на игры» uses the slot plan's 4-of-N rule and lists every game as `N-я ✓` or `N-я 9/11`.
41. «Сегодня играем» post (owner «да» 2026-10-02, built): `eveningTodayPostService` + `TodayPostSheet` in the evening route («Сбор»). Auto at 17:00 MSK when the slot plan is assembled; otherwise an organizer Telegram message and a «Дела» item «Играем сегодня?» with publish / «Не публикуем». Rule in BUSINESS_RULES «Announcements». Not yet verified live with a real post.

42. Cancel an evening from «Сбор» (owner, 2026-10-02, built): `eveningCancelService` + `CancelEveningSheet`; players notified, VK marked cancelled, a post to the evening's own Telegram group and VK; also posted by the automatic shortfall cancellation. Rule in BUSINESS_RULES «Announcements». Not yet verified live with a real post.

43. Tournament announcement (owner «да» 2026-10-02, built): 36 h before the start, one picture with the roster, the judge and the Twitch link to the rating group (`postTournamentAnnouncement`, `tournamentAnnounceSvg`). Rule in BUSINESS_RULES «Announcements». Not yet verified live with a real post; check that the «Рейтинг» group is the one the owner means.

44. Merged 2026-10-02 (with ChatGPT, reviewed by Claude 2026-10-03): replacing a confirmed tournament player until the first game starts, keeping the prepared seats and serialized with game start (#639, `tournamentRosterReplacementService.ts`); tournament seating export redesign and phone PNG saving (#641); the broadcast «Заставка» and «Итоги» scenes redesigned with avatars, served only for that tournament or evening's players behind the secret link (#642); Live Game on desktop mirrors the approved phone board (#643, `liveGameDesktopParity.css`, desktop only — its header note asks to fold it into `liveGameJudge.css` later).
45. Poker table after returning to Telegram (2026-10-03): the table takes the tallest of Telegram's and the browser's heights and re-measures on resume, so a stale short Telegram height no longer shrinks it into side bars. This replaces the open PR #640, whose global viewport change broke the «resynchronizes after returning from the background» check.

46. Tournament seating (owner, 2026-10-03, built): the generator shuffled every game on its own, so in every tournament someone sat three or more games on one seat (measured: 100% of generated tournaments, up to 7 repeats). Now every block of ten games is a Latin square (each player on each seat once) with varied neighbours — `tournamentSeatingPlan.ts`, rule in BUSINESS_RULES «Tournament seating». An already generated tournament keeps its old seating until the organizer regenerates it (draft only). The owner will regenerate today's tournament and post the seating to the group chat.

47. Tournament game results and personal seat messages (owner, 2026-10-03, built): after the judge completes a tournament game its blank is posted once to the rating group (this did not exist for tournaments before: only the announcement and the final publication did), then each player of the next game gets a personal Telegram/VK message with their seat; the first game's messages go out 30 minutes before the nominal start. Rule in BUSINESS_RULES «Announcements»; code `tournamentSeatNotificationService.ts`, `postTournamentGameBlank`. The first deploy (2026-10-03) sent no seat messages to the players (reason not visible from the repository; the most likely one is the clock: the first message goes out only 30 minutes before the nominal start). Added the same day: the organizer's own button «Разослать места игрокам» in the tournament screen (`POST /api/tournaments/:id/seat-messages`, the next game to be played, once per game and player) and isolated steps in the personal-notification scan, so one failing step cannot stop the tournament messages. Not yet verified live with a real tournament: check that the rating group receives the blank after game 1 (needs the `rating` destination in «Ещё → Telegram»), that the points on the blank match the tournament table, and that players get the seat messages (a player with no linked Telegram/VK or personal messages switched off gets none).

48. Tournament seating picture: save and share (owner, 2026-10-03, built; the owner's priority is saving the picture to the phone): inside the Telegram app the browser download and Web Share often do not work, so «Сохранить на телефон» uploads the picture once to a short-lived public link (24 h, in memory, `seatingImageLinkService.ts`, `/api/public/seating-image/<token>/<name>`) and calls Telegram's own `downloadFile` (Telegram 8.0+; older Telegram opens the link in the phone browser; plain browsers keep the old download and the iOS share sheet). «В VK» and «В Telegram» open the standard VK `share.php` and Telegram `t.me/share` forms with that link (`?inline=1` shows the picture); «В группу «Рейтинг»» makes the bot post it to the rating group. The bot-to-my-own-Telegram route (`target: 'me'`) stays in the API without a button. Not yet verified live. **Not built, to agree:** posting it straight to a VK chat by the bot (needs a VK chat destination, e.g. the community chat peer 2000000001, and the VK message-photo upload; wall photo upload exists in `announcementPhotoService.ts`).

49. Tournament game in the Live Game engine (owner, 2026-10-03, urgent, built): the engine for a tournament game (`TournamentLiveGameModal.tsx`, same protocol as the manual one) was reachable only from the judge's cabinet «Ведение игры» (`/player/conduct`, no link to it from the cabinet; the game must have a club judge linked to the player), while the CRM game card showed only «Протокол игры» and «Загрузить бланк игры». The CRM card of an active game now has «Вести игру (движок)». A judge written as a guest by name cannot be changed once the game is active (existing rule), which is why the game did not appear in his cabinet. Not built, to agree: a link to «Ведение игры» from the cabinet.

50. Tournament protocol could not be completed with a voted-out player (owner, 2026-10-03, fixed): the browser sends the results by participant without seat numbers, while the server's completion/save vote check («статус ухода соответствует подтверждённому голосованию») compares seats, so every game with a «Заголосован» player failed with «Игрок #undefined имеет статус ухода "Заголосован"…». The server now takes the seat number from the game's seating (`withSeatNumbers` in `tournamentProtocolRoutes.ts`); tests `manualProtocol.test.ts` 20a/20b.

51. Fix roles in a running tournament game (owner, 2026-10-03, urgent, built): after the deal there was no way to correct a misclicked role because the seating is locked for an active game. The CRM card of an active game now has «Исправить роли» (`ActiveGameRolesModal.tsx`): pick a role per seat, the whole 6/1/2/1 composition is validated and saved in one `PATCH …/games/:gameId/roles`. Allowed while the tournament and game are active and the game protocol is not completed (`checkGameEditingPermission(…, 'roles')`); seat swap and judge change stay locked. A game already open in the engine must be reopened to pick up the new roles; the engine's own state is not rewritten.

52. Tournament standings clarity and Ci rule (owner, 2026-10-03, built): the «П» (wins) column now sits right after «Σ» because Σ = П + Σдб + Ci (Ci is not inside Σдб); the game breakdown shows signs correctly and a «победа + доп. + Ci» line. Ci compensation (`ciHelper.ts`) is now given only when the first-killed player's best move names at least one black player (full on a red loss, half on a red win); with no best move or no black in it — no compensation. This changes already-played games' totals when standings are recalculated.

53. Best move in the protocol player list (owner, 2026-10-03, built): the «Игроки» tab of the game protocol now shows a «ЛХ +N (угадано K)» mark on the row of a player who made a best move, next to the existing fouls / judge / protocol / colour-protocol marks. Ci compensation is not shown there (it needs the player's rate and is calculated in the standings).

54. Softer speech-timer signals and tournament score on air (owner, 2026-10-03, built, not merged yet): the 10-second warning and the end-of-speech signal in `useLiveGameClock.ts` are now soft sine chimes (660 Hz / 523 Hz, fade-in, about half the previous volume); the tournament Live Game overlay now shows «Счёт турнира» (wins of the tournament's other finished games) instead of 0:0 — `loadCanonicalTournamentBroadcastGame`.

55. Voting visuals and votes lost after a tournament game (owner, 2026-10-03, built, not merged yet): (a) in the engine's day voting each seat card now shows what the player voted for (`→ #N`) and a candidate card shows how many votes it has collected («Кандидат · N гол.»); after the vote the candidates show the final count. Layout of the centre voting panel is unchanged — no screenshot was available, so the owner should look at it on the phone and say what still looks off. (b) The tournament engine (`TournamentLiveGameModal`) did not carry the voting rounds and nights into the protocol, so the post-game protocol asked to enter the votes again. It now records them while the game is played (`updateLiveProtocolEvidence`, the same mechanism as the club evening) and `mapEngineResult` writes `votes`/`shots` into the protocol. Games already finished without votes still need the votes entered by hand.

56. OBS panel and graphics size in the tournament engine (owner, 2026-10-03, built, not merged yet): the tournament Live Game (`TournamentLiveGameModal`) had no OBS button, so the graphics size sliders could not be reached during a tournament game. The header now has the same «OBS и трансляция» panel as the club engine (`TournamentBroadcastPanel.tsx`): overlay link, scene links (`/lobby`, `/standings`), «Размер графики»; the CRM card also shows the OBS remote control (`obsRemote`). New route `GET /api/games/tournament/:tournamentId/:gameId/broadcast-config` returns the same secret link.

57. Revote-speech button cut off on a wide screen (owner, 2026-10-03, fixed): the «К переголосованию / Следующий игрок» button fell below the fixed centre cell on desktop widths; the revote-speech stack now has a compact layout from 768 px up (`liveGameEveningBugfixes.css`), checked at 1280×720, 1366×640 and 390×780.

58. «Руками» cut off in the broadcast day log (owner, 2026-10-03, fixed): the day row of «Ход игры» had a fixed height, so when many players voted the second line of voter chips was clipped; the row now grows (`.live-broadcast-tl.is-day` in `liveBroadcastOverlay.css`) and the chips are a little smaller. Checked at 1920×1080 with 8 voters.

59. «+30с за 2 фола» missing again (owner, 2026-10-03, fixed): the button lived only in the judge toolbar (`LiveGameJudgeToolbar`), which the engine CSS hides (`display:none` on every width), so the working button was invisible. It is now also in the centre panel next to the timer controls («+30», `live-hud-speech-extension`), shown only while the exchange is allowed; the toolbar button stays. Checked in a browser at 390, 820 and 1280 px: pressing it adds 30 s and two fouls.

60. Game could not be finished after the last black player shot himself (owner, 2026-10-03, fixed; root cause reproduced only in part): the death-protocol overlay confirmed the protocol and then looked for the engine's «Завершить игру» button by text; when the engine's primary button was something else (the night-music button) it showed «Протокол сохранён, но не удалось запустить завершение игры». The overlay now falls back to asking the engine directly (`live-engine:advance-after-death-protocol`), which ends the game on a winner or goes to the day. Reproduced in the preview by forcing the night-music button; the owner's exact in-game state was not available, so verify on the next such game. Also in this PR: a purchased +30 s is kept in a revote speech (Codex P1, item 59).

61. Tournament engine stuck on the death-protocol screen (owner, 2026-10-03, fixed): once the game was handed over the engine's autosave kept re-writing the saved session (timer ticks), so the death-protocol overlay came back over the finished game and the game could not be left. The autosave now stops after the game is finished, and a failed save of the result to the tournament protocol shows «Повторить сохранение» / «Заполнить протокол вручную» (`TournamentLiveGameModal`). A game stuck before the deploy: close the engine and fill the protocol by hand from the CRM card.

62. A finished live tournament game could not be saved — «Номера кругов голосования не могут повторяться» (owner, 2026-10-03, fixed): the engine numbers voting rounds from 1 on every day, and since item 55 those rounds are written into the tournament protocol, whose server check wants round numbers unique across the game. `renumberVotingRoundsSequentially` (`liveClubSession.ts`) now renumbers them in game order and re-points revotes to their parent; covered by `tournamentLiveVotesSave.test.ts` (the test fails with the owner's exact error on the previous code). A game that failed to save before this fix has its result only on the owner's screen: fill its protocol by hand.

63. Player actions in every phase and +30 s on the first night's farewell (owner, 2026-10-03, fixed): (a) the centre-panel «Игрок» selector (the way to fouls, notes, removal at night and in other phases when the cards are busy) was shown only in day speeches/voting; it is now shown in every phase of a started game. The judge-toolbar selector is hidden by the engine CSS, so the centre one is the entry point. (b) «+30 с за 2 фола»: the engine counts the first night as round 1, so the exchange was refused on the farewell speech of the first night's victim; the zero circle is now only the zero night and the zero day with its vote (`speechExtensionModel.ts`, `BUSINESS_RULES.md`). Checked in a browser at the first night (round 1) and the later phases.

64. Game chronology, step 1 of 3 (owner, 2026-10-03, built, approved «да»): the engine now writes an event log of the whole game — phase changes, nominations with who made them, speech starts, every vote (who voted for whom, removals, raise/leave votes), results of voting rounds, shot targets, Don and Sheriff checks, fouls and technical fouls, exits, first killed, best move, PPK, the colour protocols of killed players and the end — and the tournament engine saves it next to the protocol (`tournament_game_protocols.events_json`, additive column, at most 4000 events, cleaned on the server). The manual protocol screen never overwrites it. The colour protocols filled in at the engine now also go into the tournament protocol's player results (as in the club evening). The «Итог» tab of the game protocol shows it as «Журнал партии». Club evening games collect the same log in the browser evidence but do not store it yet. Next steps (not started): a game-analysis screen, then statistics across games.

65. Shortening a created tournament (owner, 2026-10-03, force majeure, built): `PATCH /api/tournaments/:id/game-count` (organizer) drops trailing games that were never started (status planned, no protocol) and lowers `tournaments.game_count`; increasing is refused, played/active games are never touched. Standings (Ci threshold), readiness and completion already read `game_count`. CRM button «Убрать игру №N (N → N-1)» in the game block of the card (draft/active tournament, last game still planned). Needs a deploy.

66. Full audit of the tournament flow (owner, 2026-10-04, requested, in progress): look at it as the organizer (what to do when something goes off the normal scenario: replace/remove/move a player, change or drop a game, correct a finished game, cancel; compact understandable buttons, mobile first) and as the player (what I am told, what I must do, what is wrong or missing, trophies in the profile showcase after the tournament), and find places where one concept lives in several places with different logic. Result is a findings list ranked «blocks the organizer / confusing / cosmetic»; blocking items are fixed straight away, the rest is agreed with the owner. The owner's 2026-10-03 tournament is to be closed on 8 played games (shortened with item 65).

67. Audit batch 1, organizer blockers (owner, 2026-10-04, «чинить все», built): (a) `POST /api/tournaments/:id/games/:gameId/reset-to-planned` + CRM button «Вернуть игру в план» — an active game with an unfinished protocol goes back to planned (draft protocol, results and best moves dropped, seats and roles kept); (b) the judge of a running game can be replaced until its protocol is completed; (c) backup validation and the evening seating/readiness follow `tournaments.game_count` instead of a fixed 10; (d) `syncTrustedTournamentAwards` now also deletes persisted automatic trophies that are no longer earned (reopened tournament, changed winner); (e) `correct-player` after a played game rebuilds Elo and re-evaluates achievements of both players, and the button is hidden for evening-flow tournaments (the server refuses them); (f) UI texts «10 игр» follow the real count. Still open from the audit: cancel a tournament, player-side notifications and «my seat» screen, replacing a player in an evening tournament after game 1, duplicated legacy standings/readiness code, role-label helpers, mobile/desktop browser pass.

68. Audit batch 2, cancel and the player's side (owner, 2026-10-04, «чинить все», built): (a) `POST /api/tournaments/:id/cancel` + CRM button «Отменить турнир» (draft/active tournament with no started game; status `cancelled`, registration closed, every registered/seated player gets a message; shown as «Отменён» in the list, card and the player screen); (b) seat messages are keyed by game, player AND seat, so after a seat swap «Разослать места игрокам» sends the new place; (c) the replaced player is told he was replaced (`tournament_player_replaced_out`); (d) a change of time or venue of a published evening tournament notifies registered and reserve players; (e) publishing results sends each participant his place and points; (f) the player's tournament screen shows «Мои игры и места» (all games, my seat, the table; the next game opened) from `my_games` of `GET /api/tournaments/evenings/:id`. Still open: replacing a player in an evening tournament after game 1, shortened-distance notice to players, duplicated legacy standings/readiness code, role-label helpers, the browser pass on phone and desktop.

69. Audit batch 3, one owner per concept and a phone pass (owner, 2026-10-04, built): (a) ~540 lines of dead legacy tournament handlers removed from `tournamentsRoutesBase.ts` (create, detail, participants, generate-seating, start, complete, judge, standings, final-readiness, standing resolutions, publish, and the fixed-10 readiness helpers) — the live owners are `tournamentsRoutes.ts` (lifecycle) and `flexibleTournamentResultsRoutes.ts` (standings/publish) with `game_count`; the base file keeps the standings/nominations calculators, backup and the non-shadowed routes; (b) the judge rule for a running game lives in three places (server `checkJudgeEditingPermission`, outer `TournamentDetailView.canEdit`, inner `canEditCurrentGameJudgeAndRoles`) — the outer one, the only one the 4-step flow uses, was missing the batch-1 change and is fixed; (c) the card opens on the running (or next) game instead of game 1, in both the game tabs and the judge panel, and the selected game tab is scrolled into view; (d) game action buttons are a 2-column grid on a phone. Checked in a browser at 390 px and 1280 px (organizer card in draft/active/running-game states, player «Мои игры и места»). Still open: role-label helpers duplicated in ~10 components, replacing a player in an evening tournament after game 1, the shortened-distance notice to players.

70. Audit of the Live Game engine (owner, 2026-10-04, «Да», in progress): the same method as the tournament audit — a judge on a phone (390 px, Telegram WebApp) running a real game, looking at what goes wrong off the normal scenario (undo of a misclick, removing/restoring a player, revotes, reload or backgrounded app in any phase, two devices, wrong winner, save paths for tournament and club evening) and at the same rule living in several places. Result is a ranked findings list; blocking items are fixed straight away, the rest is agreed with the owner.

71. Live engine audit, batch 1 (owner, 2026-10-04, built): (a) the game no longer ends the instant a win condition becomes true — a «Победили X» sheet asks «Завершить игру» or «Вернуть последнее действие» (a misclick that removed a player or restored the wrong one can be taken back; PPK keeps its own confirmation); (b) a nominee who left the game is not put on the ballot; (c) the speech/night timer counts real elapsed seconds and catches up when the page returns from the background; (d) the saved engine session carries `sessionKey` (`tournament:<gameId>` for tournament games) and is offered only to the game it belongs to, so a previous game's session never shows up in the next one; (e) a finished tournament game that failed to save is kept in the browser (`mafia_live_pending_save:tournament:<gameId>`) and the retry/manual-protocol buttons come back after a reload. (f) undo now keeps 60 steps in memory (20 are saved for a restore after a reload), the standings screen rounds points to two decimals. Owner rule (built after the batch): a removal during a voting cancels it unless a candidate is already voted out for certain (`findDecidedVoteLeader`, BUSINESS_RULES «Removal during a voting»). Open from the audit (not built): undo has no per-phase pin; a restored session resumes a running timer by itself (kept on purpose: a judge back mid-speech expects it, owner may decide otherwise); the broadcast state is last-writer-wins (no version); a second device cannot take over a game; the same win/foul/timer rules are written in several files (win check, 4th foul and tech-foul removal, timer seconds); replacing a player in an evening tournament after game 1 is skipped for now (owner, 2026-10-04: undecided, needs the rule «who gets the points of the remaining games»).

72. Player award showcase polish (owner, 2026-10-04, «с чего хочешь», built): awards show a medal for places 1–3 (🥇🥈🥉), a ribbon for a nomination and a cup otherwise instead of one cup for everything; pinned awards go first and carry «на витрине»; the disabled pin button reads «Уже закреплено 3 награды»; the profile overview now has an «Награды» strip with up to three awards — the pinned ones, or, while nothing is pinned, the best and newest (places first, then nominations). Checked in a browser at 390 px. The overview strip reads only persisted awards (`/showcase?light=1`, no history scan); tournament trophies are reconciled in the background when a tournament is completed and on the awards tab (`syncTrustedTournamentAwards`); nothing is pinned automatically. Ordinal spellings of a place («1-е место») are recognised.

73. Game analysis, step 2 of 3 of the chronology (owner, 2026-10-04, «Да», built): «Разбор партии» in the «Итог» tab of the game protocol — a summary (winner, circles, votes, first killed) and one fold-out block per circle: who nominated whom, every voting and revote with the voters of each candidate and the result, shots and checks of the night, who left the game and how (with the role), best move, fouls. A finished game opens on it (above the form); a game still being filled keeps it below. `buildGameAnalysis` (`src/lib/liveGameAnalysis.ts`) reads only the stored events, so it exists only for games saved after the chronology shipped (tournament and, since item 75, club-evening games: both store the events with the protocol). Step 3 (statistics across games) is built, see item 81.

74. Second bug hunt (owner, 2026-10-04: «ещё один прогон поисков багов», in progress): read-only code audits of the engine game logic (voting, revote, night, best move, protocol validators) and of registration/payment, Telegram/VK notifications and the broadcast overlay; findings are fixed in follow-up batches. Done so far: players of a running tournament get a message when its distance is shortened (`tournament_game_count_changed`).

75. One chronology for every game mode (owner, 2026-10-04, «чтобы работало в любом режиме игры», built): `buildFinalChronology` (`src/lib/liveGameEventLog.ts`) is the single place that closes a game's chronology and is used by the tournament modal and the club-evening modal (club and novice tables alike); the club protocol now stores `events` (cleaned on the server in `canonicalizeClubGameSave`, a manual save without events keeps the stored ones), and the club protocol editor shows «Разбор партии» and «Журнал партии» like the tournament one. The test sandbox goes through the club path, so it gets the same behaviour. Only games saved after the deploy have a chronology. Parity audit findings still open (not built, need owner decisions or are larger): club evening winners get no trophies; «Игрок вечера» is defined three ways; win rate / stats are computed in ~8 places with different rounding; Telegram tournament post prints UTC; tournament results are not posted to channels; exit-reason and role wording duplicated; two protocol editors (tournament vs club) differ; tournament save path has no backoff/rebase of the club one.

76. Club evening awards (owner decisions 2026-10-04, built): one vote «Игрок вечера» replaces the four role votes (BUSINESS_RULES «Club evening awards»); titles counted per calendar year with a yearly reset; «Игрок года <год>» awards for the top three of each closed year (`clubYearAwardsService`, synced with the profile showcase, same key family `club-year:`); the showcase shows «Игрок вечера · год: N»; voting is open 3 days after the evening is closed (until Monday); the evening-result personal message invites the attendees to vote. Not built yet: an inline-button poll inside the Telegram bot (today the vote is in the app, Клуб → Истории). Owner also approved: one calculation of win rate — built: `winRatePercent` (`src/shared/stats.ts`, one decimal, 0 without games) now backs every profile, cabinet, stories, pulse, career, insights, club-world, engagement and OBS «Игрок вечера» figure (the client club section too); «season» is the organizer's RATING period (`clubSeasonService.ts`, built; item 77).

77. Season = rating period (owner-approved 2026-10-04, built): the career profile «Текущий сезон» and «Клуб → Итоги сезона» take their bounds from the RATING periods (active/completed, `loadRatingSeasons`) instead of two copies of the calendar-quarter code; the period end is inclusive; calendar quarters remain only as a fallback while no period covers the date. Counted by date range — the period's per-evening/per-game overrides are not applied to these club statistics. Needs a deploy.

78. Engine / protocol bug fixes from the re-audit (owner: «делай все что нужно», built): both ЛХ of a game are kept and saved (zero-round and first-killed); a removal during the voting farewell no longer cancels the voting or blocks the winner check; removing a player who already left the table cancels nothing; the «decided leader» exception counts only surviving voters; a penalty foul during a revote speech is served at the next speech; a night without a shot and a black first-night victim no longer make the tournament server refuse the game; a cancelled voting leaves no pending round; Undo takes back a speech extension; completed club saves enforce first-killed/ЛХ consistency; tournament judge/protocol bonus is bounded to ±1. A player who already left the game and is removed later becomes «removed» but keeps first-killed, ЛХ and death protocols (owner, 2026-10-04); the tournament validators accept it. Details and the item still open (free `ci_points`) in `docs/AUDIT_LOG.md`. Needs a deploy.

79. Notification reliability (owner decisions 2026-10-05, built): the Telegram and VK outboxes keep a message for about two hours (17 attempts, pause growing to 15 min; a row is final when `next_attempt_at` is empty); «вечер отменён» is retried after a clean refusal; a delivery that was unroutable is re-routed on the next producer retry once the player links a channel; a VK message that finally fails is sent to the player's Telegram; organizer alerts escape nicknames and titles; payment-deadline, promotion and cancellation notices are queued in the same transaction as the change, and the outbox is never drained inside an open transaction; coming back after a refund resets the payment claim; a player who gets a place after the 72 h mark is reminded at once; details-changed and replacement notices are sent again when a value returns; cancelling a tournament leaves the announcement as it was and posts a separate «Турнир отменён» message once per group (`cancel_notice_message_id`); the Telegram tournament post shows Moscow time; club result posts retry up to 12 times with a growing pause and a post stuck «sending» is taken back; tournament live-broadcast publishing needs an active tournament and an unfinished game. Details in `docs/AUDIT_LOG.md`. Needs a deploy (the bot too: `handlers/crm_tournament_publishing.py`).

80. Club Ci and bonus hygiene (owner «все берем», 2026-10-05, built): a club save keeps `ci_points` only for the first-killed red player (citizen/sheriff), caps it at the 0.4 rate, never negative, and zeroes it for everybody else, because the value feeds the club Elo directly; judge/protocol bonus rounding is sign-symmetric. Owner also approved, to build next: game statistics across games (chronology step 3) and the inline-button Telegram poll for «Игрок вечера».

81. Game statistics, step 3 of 3 of the chronology (owner «все берем», 2026-10-05, built): `src/lib/gameStatistics.ts` (pure) reads finished games with the roles of their seats and their chronology (`loadStatGames`, club protocol events and tournament `events_json`). Organizer: «Игры в цифрах» in «Аналитика клуба» (`GameStatsPanel`, `GET /api/analytics/game-stats?period=`): voting days per game, revote and table-decision share, black voted out in the zero circle, sheriff/don check success, best move with a black, red wins by game length. Player: «Игра в цифрах» in the career profile (`PlayerGameNumbers`, `game_stats` in `/api/player/career/:id`): accuracy of his votes and nominations as a red player, best-move blacks, first-killed count, sheriff/don checks. Only games saved after the chronology shipped count; a figure with nothing behind it shows «—». Checked at 390 px. Needs a deploy; still to build from the owner's approved list: the inline-button Telegram poll for «Игрок вечера».

Audit findings (open and fixed) live in `docs/AUDIT_LOG.md`.

### Waiting on the owner
- Owner decisions 2026-10-01, not built yet: the novice evening keeps the current price per chosen game («для опытных будет скидка»); the weekly evening automation fails once at startup with «cannot start a transaction within a transaction» — fix later; the old browser suites for CRM and live game (`e2e/`) are out of date (roster confirm step, list test ids) and do not block a release — update later; a weekly anonymized copy of the production database for development checks (branch `feat/weekly-db-snapshot`, unfinished: GitHub Action, script, docs).
- Check the bot's frequent-question answers in `handlers/bot_home.py` (`FAQ`), rewritten in a friendly tone on 2026-09-28 without rating/tournament details; «Можно прийти с другом?» and «Как оплатить?» still need the owner's confirmation.
- Video links for the lessons; shop items and prices; texts of new articles and lessons (written only from the owner's explanations); split-vote trainers for other game stages (the owner explains how they work).
- Deploy the latest `main` and do the post-deploy checks in «Handoff» above; upload club photos for announcements.
- VK channel (owner, 2026-09-30): announcements reach the VK wall but not the VK community channel. VK gives no API for channels (checked 2026-09-23, see `docs/vk-runtime-health.md`); the CRM «В канал» button copies the text for manual posting. The community chat «Классическая мафия в Туле» (peer 2000000001) is reachable by the community key — auto-posting there is possible if the owner wants it.
- The cafe «Суп с Котом» is listed as open until 22:00, while club evenings end at 02:00 — confirm with the cafe.

## Intentionally incomplete / deferred

- External online acquiring/SBP remains intentionally disabled pending provider/product decision.
- Multi-city/multi-club expansion is not a current priority.
- Manual guests can be added while forming a game without fabricating an RSVP. Completed-game seat identity corrections are explicit organizer actions that preserve gameplay by seat and rerun dependent calculations; no date/nickname-based historical rewrite is allowed.
- Historical official awards/photos from before the application remain organizer-curated data-entry/import work; they are not inferred from nicknames, fake tournaments or synthetic games.
- Large refactor-only cleanup is paused unless it fixes a concrete bug or enables requested work.
