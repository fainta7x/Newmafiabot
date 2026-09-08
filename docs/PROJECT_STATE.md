# 2LA Noire — Current Project State

This file is the canonical **current-state snapshot**. It deliberately does not contain a long chronological history; Git commits and merged PRs own history.

**Status date:** 2026-09-08

**Latest release record:** the current Git baseline includes the completed organizer/player/Live Game UX audit work through PR #268. The OBS Live Game broadcast bridge is implemented in current code and still requires deployment/runtime verification before it may be called live.

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

**Important:** the known open PR outside current `main` is draft PR #246, which is separate scoped work for manual club players/guests and historical lineup repair. It is not part of the completed UX audit and must not be mixed into unrelated fixes. Old closed PR descriptions are not backlog; always compare historical work with current `main` before treating it as unfinished product work.

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
- club/player profiles and avatars;
- wallet/tokens/shop/betting/manual accounting;
- judging/conduct surfaces and speech recording;
- exactly two personal music slots in the player profile;
- staff/judge music library and playlist;
- judge game launcher and in-game music controller.

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
- commerce/admin data;
- Telegram/VK/system diagnostics;
- music administration/context links.

Recent reliability/UX work includes:

- CRM startup renders after overview/evenings are ready instead of waiting for the full player aggregate; slow startup requests are measured in the browser console;
- CRM overview is a read-only path; canonical payment reconciliation remains on game/payment mutation paths instead of rerunning across historical debts on every open/resume;

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

The requested broad CRM/cabinet/Live Game usability audit has been completed in current `main`. Do not resurrect old redesign roadmaps as backlog. Future UX work should start from a newly reproduced issue, new user feedback, or a deliberate new design request.

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
- synchronization/outbox paths;
- organizer runtime diagnostics;
- independent GitHub Actions runtime monitor with Telegram outage/recovery notifications when secrets are configured;
- weekly Friday calendar/announcement reconciliation.

Green CI does not prove live bot token/webhook/deployed SHA.

### VK

Connected:

- OAuth/callback/join/direct paths;
- organizer runtime diagnostics;
- public join/live endpoints;
- Friday publication through the weekly announcement reconciliation.

Runtime credentials and callback state must be checked when a requested flow depends on them.

## Recent real-world validation

The latest real club evening reported by the user completed without a core Live Game failure after the recent game-flow fixes. The remaining complaints were mostly CRM convenience/reliability issues; the requested follow-up audit has since addressed the confirmed Player Cabinet navigation/information architecture, CRM organizer workflow, RSVP truth, mobile density, rating-entry and Live Game voting/readability issues in focused regression-tested PRs.

This real-world success is useful evidence, but it is not a substitute for targeted regression tests or runtime verification after a new deploy. The next meaningful validation step is a manual pass against the current merged `main` after deployment.

## Intentionally incomplete / deferred

- External online acquiring/SBP remains intentionally disabled pending provider/product decision.
- Multi-city/multi-club expansion is not a current priority.
- Manual guests can be added while forming a game without fabricating an RSVP. Completed-game seat identity corrections are explicit organizer actions that preserve gameplay by seat and rerun dependent calculations; no date/nickname-based historical rewrite is allowed.
- Large refactor-only cleanup is paused unless it fixes a concrete bug or enables requested work.
