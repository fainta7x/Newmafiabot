# 2LA Noire — Current Project State

> Canonical handoff document for the current state of the project.
> Read this after `AGENTS.md` before doing repository-wide discovery.
>
> **Last verified main:** `4deb6df08601e166fe16440c05007b1cba89bdfd`
> **Verified CI:** GitHub Actions CI run #625 — success on 2026-08-17.
> **Status date:** 2026-08-17.

## Source of truth

1. Latest remote `main` is the source of truth for code.
2. This file is the source of truth for high-level functional state and next work.
3. `docs/BUSINESS_RULES.md` is authoritative for user-approved Mafia rules and product decisions.
4. `docs/ARCHITECTURE.md` and `docs/FEATURE_MAP.md` are navigation maps, not substitutes for reading files involved in a change.
5. `docs/RUNBOOK.md` defines standard verification/deploy/recovery workflow.
6. `docs/ERROR_PLAYBOOK.md` is the fast error-triage guide.
7. Historical roadmaps are planning material only; Git history/merged PRs are authoritative for completed technical changes.

The durable handoff system is active and CI-protected. New sessions should start from `AGENTS.md` + this file + the last 5–10 main commits and targeted navigation commands instead of re-auditing the repository.

## Current platform

Full-stack application for the 2LA Noire sports Mafia club:

- React + TypeScript player application and organizer CRM.
- Express + TypeScript API.
- SQLite through `better-sqlite3` / repository DB wrapper.
- Python Telegram bot connected through REST endpoints.
- Telegram WebApp and VK integrations.
- Vite/Vitest web toolchain.
- GitHub Actions CI.
- Render deployment configuration.
- Node.js `24.18.0` LTS pinned consistently in `.node-version`, CI and Render config.

The current architecture is intentionally evolutionary: do not rewrite to another framework/database merely to follow newer trends. Modernize components in isolated, verified PRs and preserve current product behavior/data safety.

## Implemented and connected

### Player application

- Authentication and player session.
- Main player cabinet shell and dashboard.
- Events/calendar and registration flow.
- Game history/statistics, career/recaps/insights.
- Rating/Elo/rating periods.
- Club/player profiles and profile settings.
- Smart notifications.
- Wallet/tokens, shop/economy and betting.
- Manual evening payments/accounting and free-evening credits.
- Live-only center and game replay.
- Player speech recordings with server persistence and local fallback.
- Player conduct/game-management center.

`PlayerCabinetShellLegacy.tsx` has been removed. `PlayerCabinetV2` remains active content for game history/statistics and is not dead legacy code.

### Organizer application

- Organizer authentication.
- CRM overview, evenings and evening workspace.
- Participants, table planning/scouting and games/protocol workflow.
- Player CRM, tasks and analytics.
- Commerce/admin data and announcements.
- System status / integration diagnostics.

### Game and tournament workflow

- Live Game engine and evening game workflow.
- Tournament management, protocol imports/editing and judge authority.
- Awards/nominations/results/publication support.
- Token settlements, replay and speech recording upload/readback.

`POST /api/games` is intentionally retired with HTTP 410. Use evening/tournament protocol workflows instead of restoring it.

### Integrations

- Telegram integration and sync outbox worker are connected.
- Organizer-only non-destructive Telegram runtime health check exists.
- VK OAuth/callback/join/direct integration is connected.
- Organizer-only non-destructive VK runtime health check exists.
- Public join/public live routes exist.

### Data/recovery

- Guarded repository checkpoint export/import flow exists.
- Release data-safety audit exists.
- Existing non-empty runtime DB must never be overwritten by repository checkpoint bootstrap.
- Startup schema ensure/reconciliation logic is active.

### Project handoff / developer context

- `AGENTS.md` — mandatory entry point.
- `docs/PROJECT_STATE.md` — live state/queue.
- `docs/ARCHITECTURE.md` + `docs/FEATURE_MAP.md` — subsystem/feature navigation.
- `docs/BUSINESS_RULES.md` — approved domain/product rules.
- `docs/RUNBOOK.md` + `docs/ERROR_PLAYBOOK.md` — safe work and triage.
- `npm run project:status` — read-only environment/context snapshot.
- `npm run project:find` — targeted feature lookup.
- `npm run project:affected` — affected-area guidance.
- `npm run project:verify` — standard complete web verification including data-safety audit, typecheck, ESLint, tests and production build.

### Dependency/security maintenance

- CI permanently blocks high/critical vulnerabilities in production dependencies with `npm audit --omit=dev --audit-level=high`.
- The obsolete diagnostic npm-audit PRs have been closed without merge.
- Dependabot is configured for weekly npm and GitHub Actions version updates.
- Automated npm version updates are limited to minor/patch; semver-major migrations stay explicit/manual.
- Never use `npm audit fix --force` blindly.
- GitHub workflow actions are on current Node-24 runtime majors: `actions/checkout@v7`, `actions/setup-node@v7`, `actions/setup-python@v7`.

### Quality gates

Current CI blocks merges/pushes on:

- production dependency high/critical audit;
- project handoff/navigation integrity;
- release data-safety audit;
- strict TypeScript typecheck;
- real ESLint 10 flat-config correctness checks;
- the active Vitest configuration;
- production web/server build;
- Python bot syntax compilation.

The ESLint baseline intentionally focuses on high-signal correctness rules instead of formatting/style churn. Four server sanitizer files have an exact-file `no-control-regex` override because their ASCII control-character ranges are intentional validation behavior; do not broaden that exception globally.

Important: `vite.config.ts` still contains explicit historical/deferred test-file and test-name exclusions. Do not describe the suite as having zero project-specific exclusions until those exclusions are actually removed.

## Intentionally incomplete / paused

### Online payments

Accounting/payment history, token packages and payment-intent scaffolding exist, but external online acquiring/SBP remains intentionally disabled. A provider/product decision is required before implementation.

### Runtime deployment verification

Repository CI cannot prove live Render secrets, callbacks or that the latest `main` is deployed. `render.yaml` has `autoDeployTrigger: off`; green `main` does not imply live deployment.

## Known architecture/tooling debt

- `playerSelfRoutesLegacy.ts` is still mounted and serves real endpoints; do not delete by name alone.
- Historical Python bot modules may still be active; confirm imports/runtime usage before cleanup.
- `tailwindcss` is still declared with an old alpha range while the lockfile currently resolves stable Tailwind 4.3.x and `@tailwindcss/vite` is on the stable v4 line; normalize the manifest/lockfile together in an isolated dependency PR.
- TypeScript, React, Express and Vite are behind current major/stable lines and should be migrated incrementally, never as one bulk upgrade.
- `vite.config.ts` contains historical/deferred test exclusions that should be revisited deliberately.
- Production/runtime data safety has priority over code cleanup or framework upgrades.

## Recently completed

From newest to older:

- `4deb6df` — move CI actions to current Node-24 runtime majors (`checkout@v7`, `setup-node@v7`, `setup-python@v7`).
- `affc485` — real ESLint 10 flat-config correctness gate; fixed the initial high-signal lint findings and added lint to CI/project verification.
- `bd1ef99` — conservative weekly Dependabot version updates; major upgrades remain manual.
- `6f39348` — pin Node.js 24.18.0 LTS across local tooling, CI and Render; full CI compatibility verified.
- `ba3130d` — permanent high/critical production dependency audit gate.
- `f1f605b` — fast project navigation/error-triage tooling and CI checks.
- `34b77da` — durable project handoff system.
- `895d416` — keep manually opened event detail open after calendar refresh.
- `547bf90` — remove obsolete `PlayerCabinetShellLegacy` wrapper.
- `2709b5e` — extract `PlayerConductCenter` and decouple active cabinet from legacy shell.
- `4a000c2` — safe VK runtime health check.
- `23adba9` — safe Telegram runtime health check.
- `8ecd470` — strict TypeScript debt cleared and typecheck made blocking.

## Current work / next queue

The user explicitly requested a modernization pass while preserving the existing application architecture. When no newer explicit request supersedes this list, continue from the first unresolved item:

1. Normalize Tailwind to the stable v4 dependency line and perform dependency housekeeping; update manifest and lockfile together, and remove packages only when imports/runtime prove they are unused.
2. Upgrade TypeScript in a staged PR (prefer current 5.x compatibility first, then TypeScript 6 readiness/migration rather than mixing compiler changes with framework changes).
3. Upgrade React 18.3 to React 19 in an isolated PR with type updates and full UI/integration tests.
4. Upgrade Express 4 to Express 5 in an isolated PR; inspect route/path matching and API behavior before merge.
5. Upgrade Vite 5 to Vite 8/Rolldown in an isolated PR; keep the separate server bundling path explicit until intentionally migrated.
6. Revisit and either restore, replace or explicitly retire the historical/deferred Vitest exclusions.
7. Deploy the current verified `main` to Render manually when deployment access is available.
8. Run safe Telegram runtime health check and then a minimal targeted round-trip without mass messaging.
9. Run safe VK runtime health check and then a minimal targeted round-trip without public spam.
10. Continue legacy cleanup only where current imports/runtime prove code is unused.
11. Real online payment/SBP integration only after explicit provider decision.

Maintaining handoff documents is an ongoing rule, not a separate blocking phase.

## Handoff rule

Update this file with significant changes to functional status, next queue, architecture decisions, deployment assumptions or dangerous areas. `Last verified main` must reference a merged main SHA that passed standard CI. A following docs-only merge may temporarily make this field lag by one commit; use Git history plus `npm run project:status` to reconcile rather than re-auditing the repository.
