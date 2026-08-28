# 2LA Noire — Current Project State

This file is the canonical **current-state snapshot**. It deliberately does not contain a long chronological history; Git commits and merged PRs own history.

**Status date:** 2026-08-28

**Latest release record:** PR #186 merged as `30126aaf013285ea8688cecaf4f4dcc6d6cdf483`

**Release gate:** PR #186 checks passed before merge

**Deploy mode:** Amvera combined Docker application; deployment/runtime verification remains separate from Git merge

**Live deployment:** must be verified separately after manual deploy; Git merge/CI does not prove deployed SHA

The **actual current main SHA belongs to Git**, not this document. Always read it from remote `main` / `npm run project:status`; do not add a mutable “Current main” field here.

## Current source-of-truth model

- Code/current SHA: latest remote `main`.
- Current product/deploy/storage state: this file.
- Work procedure: `AGENTS.md` + `docs/RUNBOOK.md`.
- Runtime topology: `docs/ARCHITECTURE.md`.
- Feature routing: `docs/FEATURE_MAP.md`.
- Game/product rules: `docs/BUSINESS_RULES.md`.
- Visual contract: `docs/DESIGN_SYSTEM.md`.
- Old roadmaps/release notes: historical only.

If this file contradicts current code, inspect the targeted implementation and update this file rather than keeping both interpretations alive.

## Production/runtime

### Hosting

- Canonical production target: one Amvera Docker application built from `main`.
- Public origin: `https://2la-noire-chagina7x.waw0.amvera.tech`.
- The container runs nginx, Node web/API and the integrated Python Telegram bot under Supervisor.
- `/api/health` is shallow liveness; `/api/health/runtime` is the safe deep Turso/bot/Telegram check after the monitoring release is deployed.
- Legacy Render service `2la-noire-web-staging` is suspended/retained only as historical configuration, not the canonical combined runtime.
- The separate `fainta7x/mafiabot` repository is a legacy bot copy and is not the source selected for the combined deployment.

### Database — important

The DB wrapper in `src/db/index.ts` owns backend selection.

**Current production-primary path:** remote **Turso** when both secrets are configured:

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`

When those two values exist, the application uses Turso and does not use local `DATABASE_PATH` as the primary data store. Existing non-empty Turso data wins over repository checkpoint data.

**Fallback/local path:** `DATABASE_PATH`. On the current Free Render blueprint this is `/tmp/2la-noire-web-staging/mafia_crm.sqlite`. `/tmp` is not the production source of truth when Turso is configured.

**Checkpoint:** `mafia_crm.checkpoint.sqlite.gz.b64` + metadata are bootstrap/recovery artifacts. They are never normal production synchronization and must never overwrite a non-empty runtime database.

Production persistence through previous Render deploys, including post-2026-08-09 games/avatar changes, is consistent with the Turso production path introduced on 2026-08-11 and subsequently made CRM/event/token compatible.

## Current application state

### Player application

Implemented and connected:

- authentication/session;
- canonical Player Cabinet shell and dashboard;
- events/calendar/registration;
- rolling regular-Friday calendar keeps registration available roughly 35 days ahead;
- games/history/statistics/career/replay;
- rating/Elo/rating periods;
- club/player profiles and avatar support;
- wallet/tokens/shop/betting/manual accounting;
- conduct/judging surfaces;
- speech recording and live-related player flows.
- Profile is the single self-service identity surface (avatar, personal data and exactly two personal music slots); it uses the canonical `/api/player/me` identity.
- Conduct is the single host/judge workspace for assigned games, game launch and the persistent staff music library; its music pane has the addressable route `/player/conduct/music`.

### Organizer CRM

Implemented and connected:

- organizer auth;
- organizer entitlement belongs to a **server-verified canonical player identity** (`player_id`), never to a client-supplied Telegram/VK ID, username or screen name;
- the canonical club-owner player profile is the sole built-in CRM owner and can establish organizer access directly after Telegram or linked VK proves that same player profile — no organizer password is required for that owner account;
- other bot admins, judges and hosts do **not** inherit CRM-owner access automatically;
- a successful organizer-password login can still bind organizer entitlement to another already verified canonical player identity as an explicit fallback/recovery path;
- Player Cabinet shows the organizer-panel entry only when the resolved session has organizer authority;
- Player Cabinet and Organizer CRM expose a shared bidirectional mode switch in top chrome; switching context does not log the user out;
- Today/command center;
- evenings/calendar/workspace;
- nested `Ещё` tools have addressable `/admin/more/:tool` routes so browser/Telegram back navigation restores the actual tool rather than only the CRM root;
- regular Friday evenings are reconciled automatically for the next 35 days without immediately publishing external posts;
- the upcoming Friday becomes due for Telegram channel/group publication, initial eligible personal Telegram invitations and VK publication every Monday at 19:00 Moscow; retries are idempotent and delayed wake-ups catch up safely;
- every regular Friday receives a high-priority organizer close-out task due Saturday 19:00 Moscow;
- close-out is optimized for attendance, walk-ins, payment/debt and games; unpaid attended players may close as debt, and missing/unfinished game statistics may be explicitly waived without blocking the evening forever;
- participants/tables/games/protocol workflow;
- player CRM;
- CRM `Игроки` is the single organizer-facing player work card: it owns access/roles, CRM notes and the rare token/Elo/manual-achievement corrections. `Данные и настройки` retains club-wide catalogs and expert data, not a separate player editor.
- tasks/analytics;
- commerce/admin data;
- persistent organizer music library with uploaded tracks and Yandex links, player-slot inclusion in evening pools, and live role-deal/night controls;
- Telegram/VK/system diagnostics.

### Live Game

The canonical Player Cabinet visual language has been rolled through the Live Game release chain merged in PR #118.

Current judge workspace includes:

- canonical dark shell and center HUD;
- phase-aware day/night/voting hierarchy;
- 10 distinct seat identities;
- quick nominations/fouls and contextual player action sheet;
- foul/technical-foul/removal/PPK presentation;
- compact event journal with Undo;
- voting, revote and table-decision readability fixes;
- ordinary voting and «поднять / оставить» use player seat cards for judge input instead of synthetic center voter controls;
- mandatory unmarked votes stay visually unassigned until the judge finalizes the last candidate, when the approved last-candidate rule is applied;
- Don/Sheriff night-check readability;
- eliminated-player identity preservation;
- recovery presentation aligned to the main table;
- death protocol aligned to the cabinet visual language;
- setup and physical role distribution aligned to the same judge-first cabinet hierarchy, with the start action prioritized and music/speech recording kept as secondary controls.

Approved Mafia mechanics remain governed by `docs/BUSINESS_RULES.md`; the design migration must not reinterpret them.

## Integrations

### Telegram

Connected:

- Telegram WebApp/player entry;
- announcement/bot APIs;
- synchronization/outbox paths;
- organizer non-destructive runtime diagnostics;
- public non-destructive aggregated runtime diagnostics and an independent five-minute GitHub Actions monitor that can notify trusted Telegram recipients on outage/recovery transitions after repository secrets are configured;
- existing 30-minute public-router refresh is also the heartbeat that reconciles the rolling Friday calendar and due weekly announcement; the reconciler is safe to rerun.

A green CI run does not prove live bot token/webhook/service health. Verify after deploy when relevant.

### VK

Connected:

- OAuth/callback/join/direct paths;
- organizer runtime diagnostics;
- public join/live endpoints;
- direct Friday-evening publication is part of the same Monday weekly announcement reconciliation.

Live credentials/callback state must be checked at runtime when the requested flow depends on them.

## Intentionally incomplete / paused

- External online acquiring/SBP remains intentionally disabled pending provider/product decision.
- Multi-city/multi-club expansion is not a current product priority.
- Large refactor-only cleanup is paused unless it fixes a concrete bug or enables requested product work.
- Live Game CSS consolidation is technical debt, not a release requirement.

## Verification model

During work:

- focused tests first;
- `npm run project:verify:fast` after a coherent batch when useful;
- ordinary PRs use the fast non-browser merge gate;
- Playwright runs only through the manual workflow when explicitly requested or needed for release verification;
- visual PRs require fresh screenshot review when browser verification is requested.

The ordinary merge-blocking CI includes:

- handoff integrity (`project:status --check` etc.);
- production dependency audit;
- release data-safety audit;
- TypeScript;
- ESLint;
- Vitest;
- production build;
- Python bot syntax;
- combined production container health;
- CodeQL and Gitleaks workflows.

Browser verification is preserved in `.github/workflows/playwright-manual.yml` and is not part of the ordinary PR merge gate.

## Immediate next queue

1. Deploy the latest intended `main` to the combined Amvera application without importing, resetting or replacing Turso data.
2. Verify `/api/health`, `/api/health/runtime`, Telegram webhook state, Mini App opening, passwordless owner CRM entry and recent live-data markers.
3. Configure the Amvera shallow startup/liveness probe and native failure email from `docs/RUNBOOK.md`.
4. Configure the GitHub Actions monitoring bot secrets, send the manual test notification and confirm the five-minute workflow is armed.
5. Verify the rolling Friday calendar and the next due Telegram/VK weekly announcement state without sending duplicate smoke announcements.

## Mandatory session rule

One user message/request may create at most **3 PRs**. See `AGENTS.md` and `docs/RUNBOOK.md` for the full rule.
