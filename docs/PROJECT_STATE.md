# 2LA Noire — Current Project State

> Canonical handoff document for the current state of the project.
> Read this after `AGENTS.md` before doing repository-wide discovery.
>
> **Last verified main:** `895d41697535e1465e77a6269072906fd83b2db6`
> **Verified CI:** GitHub Actions CI run #597 — success on 2026-08-17.
> **Status date:** 2026-08-17.

## Source of truth

1. Latest remote `main` is the source of truth for code.
2. This file is the source of truth for the high-level functional state and next work.
3. `docs/BUSINESS_RULES.md` is the source of truth for user-approved Mafia rules and product decisions.
4. `docs/ARCHITECTURE.md` is the navigation map, not a substitute for reading the files involved in a change.
5. `docs/RUNBOOK.md` defines the standard verification/deploy/recovery workflow.
6. `docs/live-club-roadmap.md` is historical planning material. Do **not** use its unchecked boxes to infer current implementation status.
7. Git history/merged PRs are the source of truth for completed technical changes. Do not reconstruct completion from old chat summaries when Git can answer it.

## Current platform

Full-stack application for the 2LA Noire sports Mafia club:

- React + TypeScript player application and organizer CRM.
- Express + TypeScript API.
- SQLite through `better-sqlite3` / repository DB wrapper.
- Python Telegram bot connected to the web application through REST endpoints.
- Telegram WebApp integration.
- VK integration.
- GitHub Actions CI.
- Render deployment configuration.

## Implemented and connected

The following areas are present in the current application and should **not** be re-audited from scratch before ordinary feature work:

### Player application

- Authentication and player session.
- Main player cabinet shell.
- Home dashboard.
- Events/calendar and registration flow.
- Game history and statistics.
- Career/recaps/insights.
- Rating, Elo and rating periods.
- Club/player profiles.
- Player profile settings.
- Smart notifications.
- Wallet/tokens.
- Shop/economy.
- Betting.
- Manual evening payments/accounting.
- Free-evening credits.
- Live-only center.
- Game replay.
- Player speech recordings with server persistence and local fallback.
- Player conduct/game-management center.

The old `PlayerCabinetShellLegacy.tsx` wrapper has been removed. `PlayerCabinetV2` is still active content used for game history/statistics and is **not** dead legacy code.

### Organizer application

- Organizer authentication.
- CRM overview.
- Evenings list and evening workspace.
- Participants.
- Table planning/scouting.
- Games/protocol workflow.
- Player CRM.
- Tasks.
- Analytics.
- Commerce/admin data.
- Announcements.
- System status / integration diagnostics.

### Game and tournament workflow

- Live Game engine.
- Evening game workflow.
- Tournament management.
- Protocol imports and protocol editing.
- Judge authority.
- Tournament awards/nominations.
- Tournament results.
- Tournament publication/Telegram support.
- Token settlements.
- Replay.
- Speech recording upload/readback.

`POST /api/games` is intentionally retired with HTTP 410. Use evening/tournament protocol workflows instead of restoring the legacy creation endpoint.

### Integrations

- Telegram integration code is connected.
- Telegram sync outbox worker starts outside tests.
- Organizer-only non-destructive Telegram runtime health check exists.
- VK OAuth/callback/join/direct integration code is connected.
- Organizer-only non-destructive VK runtime health check exists.
- Public join/public live routes exist.

### Data/recovery

- Guarded repository checkpoint export/import flow exists.
- Release data-safety audit exists.
- Runtime DB must never be overwritten by a repository checkpoint when non-empty.
- Startup schema ensure/reconciliation logic is active.

### Quality gates

Current CI blocks merges/pushes on:

- release data-safety audit;
- strict TypeScript typecheck;
- the full Vitest suite with no project-specific exclusions;
- production web/server build;
- Python bot syntax compilation.

## Intentionally incomplete / paused

### Online payments

Real accounting, payment history, amount due/paid/outstanding, token packages, fundraising data and payment-intent scaffolding exist, but external online acquiring/SBP is intentionally disabled.

Do not treat `online_payment_available: false` or provider `paused` as a regression. Enabling a real payment provider is a future product task requiring an explicit provider/configuration decision.

### Runtime deployment verification

Telegram and VK have safe diagnostic endpoints in the application, but repository CI cannot prove live Render secrets, callback state or that the latest `main` has been manually deployed.

`render.yaml` currently has `autoDeployTrigger: off`. A green `main` does **not** imply that Render is running that SHA.

## Known architecture debt / caution areas

- `playerSelfRoutesLegacy.ts` is still mounted through the current player self router and serves real endpoints. Do not delete it based on its name alone.
- Several historical Python bot modules remain active. Confirm imports/runtime calls before cleanup.
- Long historical documentation exists under `docs/`; prefer this file plus the architecture map over old roadmaps for current-state decisions.
- Production/runtime data safety has priority over code cleanup.

## Recently completed

From newest to older:

- `895d416` — keep manually opened event detail open after calendar refresh; regression coverage added.
- `547bf90` — remove obsolete `PlayerCabinetShellLegacy` wrapper; connect history/statistics directly to active content.
- `2709b5e` — extract `PlayerConductCenter` and decouple active cabinet from legacy shell.
- `4a000c2` — add safe VK runtime health check.
- `23adba9` — add safe Telegram runtime health check.
- `8ecd470` — clear strict TypeScript debt and make typecheck blocking.
- `7690bb3` — restore all previously excluded Vitest scenarios.
- Speech-recording server route/persistence work completed immediately before these changes.

## Current work / next queue

When no newer explicit user request supersedes this list, continue from the first unresolved item:

1. Maintain this project-handoff/documentation system and keep it synchronized with significant changes.
2. Re-run a dependency security audit from current `main`; only act on vulnerabilities that exist in the current lockfile. Never use `npm audit fix --force` blindly.
3. Add a permanent high/critical dependency security gate if current dependencies permit it without false positives.
4. Deploy the current verified `main` to Render manually when deployment access is available.
5. Run the safe Telegram runtime health check on the deployed build, then a minimal targeted round-trip test without mass messaging.
6. Run the safe VK runtime health check on the deployed build, then a minimal targeted round-trip test without public spam.
7. Continue legacy cleanup only where current imports/runtime usage prove code is unused.
8. Real online payment/SBP integration only after explicit product/provider decision.

## Handoff rule

At the end of a significant merged task, update this file in the same PR when any of these changed:

- current functional status;
- next queue;
- an important architecture decision;
- a retired/replaced subsystem;
- deployment/runtime assumptions;
- a known dangerous area.

Do not update the `Last verified main` field to a branch commit. Update it only after the merged `main` SHA has passed the standard CI. If the file lags by one documentation-only merge, use Git history plus `npm run project:status` to reconcile it rather than re-auditing the whole repository.
