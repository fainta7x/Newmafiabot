# 2LA Noire — Current Project State

This file is the canonical **current-state snapshot**. It deliberately does not contain a long chronological history; Git commits and merged PRs own history.

**Status date:** 2026-09-04

**Latest release record:** the current Git baseline includes organizer/player operations through PR #237. The OBS Live Game broadcast bridge is implemented in current code and still requires deployment/runtime verification before it may be called live.

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

**Important:** the open PR list is clean as of this snapshot. Old closed PR descriptions are not backlog; always compare historical work with current `main` before treating it as unfinished product work.

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

- quick attendance/payment row actions update in place instead of refreshing the whole workspace;
- attendance/payment counters open focused queues; roster search covers the entire evening and clearing it restores the selected queue;
- active in-progress evenings accept existing database players who arrived without prior registration;
- closed-evening payment edits remain available through the canonical payment service;
- repeated payment/pricing reconciliation is idempotent and must not create duplicate financial ledger rows;
- closeout distinguishes planned response from factual attendance.

A broader CRM UX redesign is **deferred by current user preference**. Do not start it automatically just because old PR #174 or old roadmap text mentions it.

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

- roles hidden by default with manual reveal;
- phase-aware day/night/voting flow;
- voting order fitted into the fixed mobile center cell without nested scrolling;
- editable vote assignment: a voter can be moved directly between candidates, and undo restores an editable voting state;
- repeated split/revote speeches only once per unchanged disputed set;
- player actions and fouls available throughout active play where appropriate, including direct removal/PPK after a player leaves the table and PPK after removal;
- night shot/Don/Sheriff markers scoped to their actual subphase;
- consistent Undo snapshots across voting, zero round and best-move/protocol overlays;
- actual day-starter rotation based on the previous **actual** starter, skipping absent/dead seats;
- `+30с за 2 фола` during an eligible current speech after zero round;
- protocol/best-move announcement buffers increased by five seconds;
- local session recovery.

The club launcher also publishes a dedicated OBS Browser Source overlay:

- one stable secret URL for the main broadcast channel;
- a transparent 1920×1080 HUD with the current game number, ten player identities, roles and alive/out status;
- ordered nominations, with the nominating seat where available;
- voter-to-candidate assignments only after the judge fixes the voting result; partial collection is never shown;
- transient server relay only: the phone remains the recoverable Live Game source and timer ticks are not written to Turso.

Known low-priority technical tail: a bare `LiveGameEngine` render without the normal controlled `rolesHidden` prop still has an internal visible-role fallback. The real club launcher passes the controlled hidden state, so this is cleanup rather than a current club blocker.

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

The latest real club evening reported by the user completed without a core Live Game failure after the recent game-flow fixes. The remaining complaints were mostly CRM convenience/reliability issues, which have since received targeted fixes (instant row actions, walk-in player add, pending game recovery and payment reconciliation).

This real-world success is useful evidence, but it is not a substitute for targeted regression tests or runtime verification after a new deploy.

## Intentionally incomplete / deferred

- External online acquiring/SBP remains intentionally disabled pending provider/product decision.
- Multi-city/multi-club expansion is not a current priority.
- Broad CRM UX redesign is deferred until the user asks to resume it.
- Large refactor-only cleanup is paused unless it fixes a concrete bug or enables requested work.
- Live Game CSS consolidation is technical debt, not a release requirement.
- Bare-engine role-visibility fallback cleanup is low priority because the canonical club launcher already starts hidden.

## Current backlog rule

Do **not** reconstruct backlog from old chat summaries or old PR descriptions.

For a fresh planning request:

1. read this file and latest remote `main`;
2. review the last 5–10 merged commits;
3. inspect currently open PRs only as candidates, not as truth;
4. remove anything already implemented in current code;
5. present only genuinely missing, deferred or newly requested work.

As of this snapshot, these items are explicitly **not** backlog:

- “connect Player Cabinet and CRM” — done;
- “build the music database/player” — done;
- “make Live Game basically usable” — done; future work must name a concrete remaining issue.

## Immediate next queue

1. Verify deployment of the latest intended `main` on Amvera.
2. Verify `/api/health`, `/api/health/runtime` and the OBS path `phone Live Game -> relay -> Browser Source` without exposing the secret URL in public logs/screenshots.
3. Configure OBS Browser Source at 1920×1080 and inspect a real setup/day/vote/night sequence before the first public stream.
4. If planning new work, derive a **fresh backlog from current main**, not from the August roadmap.
5. Resume CRM UX redesign only when the user explicitly chooses it.

## Verification model

Ordinary PR merge gate:

- project handoff integrity;
- production dependency audit;
- release data-safety audit;
- TypeScript;
- ESLint;
- Vitest;
- production build;
- Python bot syntax;
- combined production container;
- CodeQL;
- Gitleaks.

Playwright/browser verification is separate and should be used when visual/browser behavior requires it.

## Mandatory session rule

One user message/request may create at most **3 PRs**. See `AGENTS.md` and `docs/RUNBOOK.md`.
