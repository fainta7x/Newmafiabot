# 2LA Noire — Current Project State

This file is the canonical **current-state snapshot**. It deliberately does not contain a long chronological history; Git commits and merged PRs own history.

**Status date:** 2026-08-20  
**Latest release record:** PR #121 merged as `ef261b4718ab6c62810daa7a4335b78f5b5afc68`  
**Release gate:** GitHub CI run #947 — green before merge  
**Deploy mode:** Render manual deploy (`autoDeployTrigger: off`)  
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

- Render service: `2la-noire-web-staging`.
- Branch: `main`.
- Region: Frankfurt.
- Plan: Free.
- Deploy: manual.
- Health endpoint: `/api/health`.

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
- games/history/statistics/career/replay;
- rating/Elo/rating periods;
- club/player profiles and avatar support;
- wallet/tokens/shop/betting/manual accounting;
- conduct/judging surfaces;
- speech recording and live-related player flows.

### Organizer CRM

Implemented and connected:

- organizer auth;
- organizer entitlement belongs to a **server-verified canonical player identity** (`player_id`), never to a client-supplied Telegram/VK ID, username or screen name;
- the canonical club-owner player profile is the sole built-in CRM owner and can establish organizer access directly after Telegram or linked VK proves that same player profile — no organizer password is required for that owner account;
- other bot admins, judges and hosts do **not** inherit CRM-owner access automatically;
- a successful organizer-password login can still bind organizer entitlement to another already verified canonical player identity as an explicit fallback/recovery path;
- Player Cabinet shows the organizer-panel entry only when the resolved session has organizer authority;
- Today/command center;
- evenings/calendar/workspace;
- participants/tables/games/protocol workflow;
- player CRM;
- tasks/analytics;
- commerce/admin data;
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
- Don/Sheriff night-check readability;
- eliminated-player identity preservation;
- recovery presentation aligned to the main table;
- death protocol aligned to the cabinet visual language.

The setup/physical role-distribution screen still has older cosmetic styling. It is functional and is **not a release blocker**; polish it only when it is the next requested visual task.

Approved Mafia mechanics remain governed by `docs/BUSINESS_RULES.md`; the design migration must not reinterpret them.

## Integrations

### Telegram

Connected:

- Telegram WebApp/player entry;
- announcement/bot APIs;
- synchronization/outbox paths;
- organizer non-destructive runtime diagnostics.

A green CI run does not prove live bot token/webhook/service health. Verify after deploy when relevant.

### VK

Connected:

- OAuth/callback/join/direct paths;
- organizer runtime diagnostics;
- public join/live endpoints.

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
- full CI only when the PR is ready;
- visual PRs require fresh screenshot review in addition to green CI.

CI currently includes:

- handoff integrity (`project:status --check` etc.);
- production dependency audit;
- release data-safety audit;
- TypeScript;
- ESLint;
- Vitest;
- production build;
- Python bot syntax;
- mobile Playwright;
- CodeQL and Gitleaks workflows.

## Immediate next queue

1. Manually deploy the accepted release lineage from current `main` to Render.
2. Verify `/api/health`, application load/auth and that recent live data/avatars remain present.
3. Prepare the next club evening: create/verify event, registration, announcements and organizer workflow.
4. Fix only concrete bugs found in deployed/runtime use before adding more cosmetic polish.
5. Resume the setup/role-distribution visual cleanup when operational readiness for the evening is secure.

## Mandatory session rule

One user message/request may create at most **3 PRs**. See `AGENTS.md` and `docs/RUNBOOK.md` for the full rule.
