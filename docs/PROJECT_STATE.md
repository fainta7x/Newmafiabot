# 2LA Noire — Current Project State

This file is the canonical **current-state snapshot**. It deliberately does not contain a long chronological history; Git commits and merged PRs own history.

**Status date:** 2026-09-09

**Latest release record:** the current `main` baseline includes the completed organizer/player/Live Game UX audit through PR #268, canonical club-game betting plus durable personal/organizer/betting Telegram delivery from PR #273, profile integrity/verified awards from PR #274, and the completed three-part premium Player Profile delivery from PRs #275–#277: canonical profile core, verified awards/club history, factual player connections, organizer-curated referral history and player-to-player evening invitations. VK Player Cabinet access and personal delivery were introduced in PR #285; the operational follow-up for cabinet OAuth routing, restart-active VK outbox delivery, channel-neutral betting notifications, owner-initiated VK linking and trusted public callback URLs is implemented by VK-ACCESS-002 / PR #290 and remains subject to merge, deployment and runtime verification. CRM-PAY-003 / PR #292 implements factual regular-evening pricing at 100 ₽ per actually completed game with a 400 ₽ cap, debt-free RSVP/slot planning and application-level historical reconciliation; it remains subject to review, merge, deployment and runtime/data verification. The OBS Live Game broadcast bridge is implemented in current code and still requires deployment/runtime verification before it may be called live.

**Deploy mode:** Amvera combined Docker application; Git merge, deployment and runtime verification are three separate states.

**Live deployment:** runtime verification of the latest `main` is not yet recorded here. Do not claim the latest `main` is live until the public runtime is checked.

The **actual current main SHA belongs to Git**, not this document. Always read it from remote `main` / `npm run project:status`; do not add a mutable “Current main” field here.

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
- `/api/health/runtime` is the safe deep Turso/bot/Telegram check.
- Legacy Render is retained only as historical/fallback configuration, not the canonical deployment target.
- The separate `fainta7x/mafiabot` repository is legacy and is not the source selected for the combined deployment.

### Database — critical

`src/db/index.ts` owns backend selection.

**Production-primary:** remote Turso whenever both are configured:

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`

Existing non-empty Turso data always wins over repository checkpoint/bootstrap data.

`DATABASE_PATH` is fallback/local storage. The Python bot may still keep legacy local state under `/data`, but that must never replace or seed canonical Turso data.

Repository checkpoint files are bootstrap/recovery artifacts only:

- `mafia_crm.checkpoint.sqlite.gz.b64`
- `mafia_crm.checkpoint.meta.json`

Never reset/import/restore production Turso as a normal bug fix or deploy step.

## Current product state

### Player application

Implemented and connected:

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
- ordered nominations, with the nominating seat where available;
- voter-to-candidate assignments only after the judge fixes the voting result; partial collection is never shown;
- transient server relay only: the phone remains the recoverable Live Game source and timer ticks are not written to Turso.

Approved game behavior remains governed by `docs/BUSINESS_RULES.md`.

## Integrations

### OBS / Twitch broadcast

Connected through the Live Game modal and `/broadcast/<secret>` Browser Source route. The secret URL is returned only to an authorized organizer or the assigned judge. The public `/live` screen remains a separate safe view and must not receive roles, checks or unfinished voting detail.

The current relay is intentionally one main in-memory broadcast channel for one streamed table. A Node restart or phone connection loss leaves the last frame visible; the phone heartbeat republishes the current local snapshot after connectivity returns.

### Telegram

Connected:

- Mini App/player entry;
- announcement APIs and Python bot bridge;
- response/game-slot synchronization;
- preservation of historical announcement messages after an evening closes;
- durable direct-message outbox with stable message keys, retry/backoff state, partial-failure recovery and deduplication of already-sent events;
- personal reconciliation that queues invitations/status reminders, completed game/Elo changes and betting results without requiring Player Cabinet to be opened;
- betting-open notifications to linked eligible spectators, excluding the ten seated players and canonical judge;
- organizer notification recipients are explicit (`ORGANIZER_NOTIFICATION_IDS` / `ORGANIZER_CHAT_ID`); `ADMIN_IDS` and `BACKUP_ADMIN_ID` are not silently reused unless the dedicated backup opt-in is enabled;
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

## Intentionally incomplete / deferred

- External online acquiring/SBP remains intentionally disabled pending provider/product decision.
- Multi-city/multi-club expansion is not a current priority.
- Manual guests can be added while forming a game without fabricating an RSVP. Completed-game seat identity corrections are explicit organizer actions that preserve gameplay by seat and rerun dependent calculations; no date/nickname-based historical rewrite is allowed.
- Historical official awards/photos from before the application remain organizer-curated data-entry/import work; they are not inferred from nicknames, fake tournaments or synthetic games.
- Large refactor-only cleanup is paused unless it fixes a concrete bug or enables requested work.