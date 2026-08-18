# 2LA Noire — Current Project State

> Canonical handoff document for the current state of the project.
> Read this after `AGENTS.md` before doing repository-wide discovery.
>
> **Last verified main:** `5d760155cf5ab20b7ac3c2e961b65201d0bfbfd6`
> **Verified CI:** GitHub Actions CI run #635 — success on 2026-08-17.
> **Current main observed before this branch:** `da6e95d1dd234184013af2372b06706ac35a797a`.
> **Status date:** 2026-08-18.

`Last verified main` is intentionally conservative: only move it to an exact merged `main` SHA after that same SHA has passed the standard CI. A PR-head success is not enough.

## Source of truth

1. Latest remote `main` is the source of truth for code.
2. This file is the source of truth for high-level functional state and next work.
3. `docs/BUSINESS_RULES.md` is authoritative for user-approved Mafia rules and product decisions.
4. `docs/ARCHITECTURE.md` and `docs/FEATURE_MAP.md` are navigation maps, not substitutes for reading files involved in a change.
5. `docs/RUNBOOK.md` defines standard verification/deploy/recovery workflow.
6. `docs/ERROR_PLAYBOOK.md` is the fast error-triage guide.
7. Historical roadmaps are planning material only; Git history/merged PRs are authoritative for completed technical changes.

New sessions should start from `AGENTS.md` + this file + the last 5–10 main commits and targeted navigation commands instead of re-auditing the repository.

## Current platform

Full-stack application for the 2LA Noire sports Mafia club:

- React `19.2.x` + TypeScript `6.0.x` player application and organizer CRM.
- Express `5.2.x` + TypeScript API.
- SQLite through `better-sqlite3` / repository DB wrapper.
- Python Telegram bot connected through REST endpoints.
- Telegram WebApp and VK integrations.
- Vite `8.2.x` build tooling and Vitest `4.1.x` tests.
- ESLint `10.8.x`, Tailwind CSS `4.x`, Zod `4.x`.
- Isolated Playwright browser smoke tests.
- GitHub Actions CI with CodeQL and Gitleaks security workflows.
- Render deployment configuration with manual deployment trigger.
- Node.js 24 LTS pinned consistently in local/CI/Render configuration.

The previous React 18 -> 19, Express 4 -> 5, TypeScript 5 -> 6 and Vite 5 -> 8 migration queue is complete. Do not reopen those migrations from old roadmap text.

The architecture is intentionally evolutionary: do not rewrite to another framework/database merely to follow newer trends. Modernize components in isolated, verified PRs and preserve current product behavior/data safety.

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

`PlayerHistoryStatsView.tsx` is the active embedded history/statistics view inside `PlayerGamesHub`; it is not a second player cabinet.

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

Live Game is being modularized without rule changes. Current durable boundaries are:

- `setupMode.ts` — setup routing / managed-engine markers;
- `setupRoles.ts` — setup role translation, distribution validity and physical-role assignments;
- `setupState.ts` — setup seat/player/role transforms and start-validation only; React setters, snapshot/start side effects, discipline initialization and transition to zero night remain in `LiveGameEngine.tsx`;
- `daySpeechModel.ts` — day-speech rotation/order, next-speaker selection and the pure spoken-seat state transform. Snapshot, timer start/stop and discipline-driven speech duration remain in `LiveGameEngine.tsx`;
- `nightTargetModel.ts` — shot-target lookup/toggle, Don/Sheriff check-result mapping and first-killed-best-move eligibility only. Night transitions, kill resolution, protocol marker writes, logs and timers remain in `LiveGameEngine.tsx`;
- `timerModel.ts` — CenterPanel timer duration/deadline/remaining calculations;
- `votingPresentationModel.ts` — CenterPanel vote-display assignments/remaining-vote and table-decision presentation arithmetic only;
- `seatPresentationModel.ts` — SeatCard grid position, border-priority and current-vote presentation only; seat actions/fouls/removal remain in `SeatCard.tsx`;
- `engineStateModel.ts` — shared engine stage/snapshot schema, initial empty-player/discipline factories, exact snapshot cloning and legacy restore-default normalization. React setters, history/undo orchestration and localStorage persistence remain in `LiveGameEngine.tsx`.

Voting outcomes remain owned by `src/shared/tournamentVoting.ts`; do not move or reinterpret outcome rules into presentation helpers during cleanup.

`POST /api/games` is intentionally retired with HTTP 410. Use evening/tournament protocol workflows instead of restoring the old endpoint. Tests that require the retired create-game contract are obsolete unless deliberately rewritten against the current workflow.

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
- Production/runtime data safety has priority over cleanup, naming or dependency work.

## Project navigation and verification

- `AGENTS.md` — mandatory entry point.
- `docs/PROJECT_STATE.md` — live state/queue.
- `docs/ARCHITECTURE.md` + `docs/FEATURE_MAP.md` — subsystem/feature navigation.
- `docs/BUSINESS_RULES.md` — approved domain/product rules.
- `docs/RUNBOOK.md` + `docs/ERROR_PLAYBOOK.md` — safe work and triage.
- `npm run project:status` — read-only environment/context snapshot.
- `npm run project:find -- "<query>"` — targeted feature lookup.
- `npm run project:affected -- <files>` — affected-area guidance.
- `npm run project:verify` — release audit + typecheck + ESLint + Vitest + production build.
- `npm run test:browser` — isolated Playwright mobile smoke.

CI/security gates include production dependency audit, handoff integrity, release data-safety audit, TypeScript, ESLint, active Vitest suite, production build, Python bot syntax, Playwright smoke, CodeQL and Gitleaks.

Playwright is intentionally non-destructive: it uses a disposable SQLite DB and must not mutate production/runtime data.

## Dependency/security maintenance

- CI blocks high/critical vulnerabilities in production dependencies with `npm audit --omit=dev --audit-level=high`.
- Dependabot handles routine weekly npm/GitHub Actions updates; major behavioral migrations remain explicit.
- Never use `npm audit fix --force` blindly.
- CodeQL scans JavaScript/TypeScript and Python.
- Gitleaks scans full Git history read-only for leaked credentials/tokens.
- A full-tree `npm ci` may report development-tree findings even while the explicit production dependency audit is green; describe those separately and do not claim zero vulnerabilities without checking.

## Intentionally incomplete / paused

### Online payments

Accounting/payment history, token packages and payment-intent scaffolding exist, but external online acquiring/SBP remains intentionally disabled. A provider/product decision is required before implementation.

### Runtime deployment verification

Repository CI cannot prove live Render secrets, callbacks or that the latest `main` is deployed. `render.yaml` has `autoDeployTrigger: off`; green `main` does not imply live deployment.

## Known cleanup / architecture debt

Treat names as evidence to inspect, not proof that a file is dead.

- `src/components/player/PlayerHistoryStatsView.tsx` is active implementation content for the History/Statistics sections.
- `src/components/LiveGameEngine/GeneralSetupPhase.tsx` is the active non-club setup path for tournament/autonomous Live Game flows; do not treat it as dead fallback code.
- `vitest.config.ts` still has project-specific deferred test-name exclusions. Revisit them one scenario at a time; do not simply delete the regex to make the suite look cleaner.
- Live Game styling has accumulated several additive `V2`/`V3`/`V4`/`V5`/`V6`, `Polish`, `Refine` and `Fix` CSS layers. Consolidate only with focused visual/browser verification.
- Several files are very large and expensive to reason about, especially `GameProtocolModal.tsx`, tournament route modules, `LiveGameEngine.tsx`, `SeatCard.tsx`, tournament export logic and large Python bot handlers. Split one module per PR without behavior changes.
- Large route Base modules such as `eveningsRoutesBase.ts`, `gamesRoutesBase.ts` and `tournamentsRoutesBase.ts` require route-by-route tracing; do not mechanically collapse them just because smaller Base layers were removable.

## Recently completed

Newest relevant technical work:

- `da6e95d` — extracted Live Game day-speech rotation/order, next-speaker selection and spoken-seat transform to `daySpeechModel.ts`, preserving snapshot, timer start/stop and discipline-driven speech duration/30-second behavior in the engine.
- `9b7390c` — extracted club Live Game setup seat/player/role transforms and start validation to `setupState.ts`, preserving snapshot/start side effects, discipline initialization, localStorage cleanup and the transition to zero night.
- `9433954` — extracted exact Live Game snapshot cloning and legacy restore-default normalization to `engineStateModel.ts`, preserving localStorage shape, React setter ownership, undo/history behavior and zero/false fallback semantics.
- `6c58354` — extracted Live Game engine state schema and initial empty-player/discipline factories to `engineStateModel.ts`, reusing the canonical `LiveGameEngineProps` and leaving snapshot mutation/handlers unchanged.
- `8d55acb` — extracted SeatCard grid position, border-priority and current-vote presentation to `seatPresentationModel.ts`, preserving seat actions/fouls/removal and current automatic-vote presentation behavior.
- `04bb62e` — extracted CenterPanel voting-display/remaining-vote/table-decision presentation arithmetic to `votingPresentationModel.ts`, preserving mandatory last-candidate voting and keeping `tournamentVoting.ts` authoritative for outcomes.
- `0453686` — extracted CenterPanel timer duration/deadline/remaining/identity arithmetic to `timerModel.ts`, preserving 30-second revote speech and 20-second first-killed best-move behavior.
- `5d41fa1` — made `GeneralSetupPhase` use shared setup marker/role models while preserving role-distribution vs complete-setup semantics.
- `c0bf2f7` — extracted shared Live Game setup role translation and complete 6/1/2/1 setup validation for club setup.
- `5f4900b` — extracted Live Game setup-mode routing / managed-engine marker selection.
- `e63dd04` — extracted organizer auth/shared snapshot/resume-refresh lifecycle to `useOrganizerCrmSession`.
- `8884b8c` — extracted organizer `/admin/...` routing/path model from `OrganizerCRM`.
- `9df23e2` — split rating-table fetching/rendering from `PlayerRatingHub` into `PlayerRatingTable`.
- `5f0bd34` — extracted player-cabinet navigation normalization/grouping to a pure tested model.
- `0bccaca` — renamed the active non-club Live Game setup from misleading `LegacySetupPhase` naming to `GeneralSetupPhase` and synced the project handoff.
- `27105bd` — renamed the active player-self API implementation from misleading `Legacy` naming to `playerSelfCoreRoutes.ts` without behavior changes.
- `120bf66` — isolated the unique public avatar-data route and removed shadowed legacy public route implementations while keeping public free-form signup retired.
- `737722d` — collapsed `participantRoutesBase.ts`, preserving the active DELETE handler and removing the shadowed duplicate PATCH.
- `4d2e757` — made `EveningsList.tsx` the canonical implementation and removed the obsolete `.v2` compatibility layer.
- `258d7f4` — retired two checkpoint tests tied to the old injectable exporter API while retaining active checkpoint/recovery coverage.
- `cd8a6af` — consolidated Vite configuration into the single active typed config while preserving VK transforms.
- `56f309e` — removed the retired whole-file CRM test suite and synced the canonical handoff with the current stack/cleanup queue.
- `d8e6553` — repository hygiene: removed generated project dump, obsolete one-off legacy DB scripts and old write-access artifact; future generated project-context dump ignored.
- `2b98048` — Vite toolchain upgrade to 8.2 plus Vitest/Playwright isolation; CI/build/browser smoke restored.
- `23ab30e` — faster iteration workflow: focused checks during work, full CI/security only for ready-to-merge changes.
- `5d76015` — read-only Gitleaks full-history scanning.
- `3b3ffca` — CodeQL for JavaScript/TypeScript and Python.
- `0d78901` — isolated Playwright mobile smoke with disposable SQLite DB.
- `affc485` — ESLint 10 flat-config correctness gate.
- `6f39348` — Node.js 24 LTS alignment across local tooling, CI and Render.
- `ba3130d` — blocking high/critical production dependency audit.
- `f1f605b` — project navigation/error-triage tooling and CI checks.
- `34b77da` — durable project handoff system.

## Current work / next queue

The current modernization target is **clarity and maintainability without business-rule or data-model churn**. Continue from the first unresolved item unless a newer explicit user request supersedes it:

1. Continue Live Game modularization after the night-target/check calculation boundary: audit one additional coherent handler family in `LiveGameEngine.tsx`, prove its dependencies and current behavior with focused coverage, then extract only that family in its own PR. Keep voting, discipline and night state-transition side effects isolated unless that specific family is audited first.
2. Finish repository/test hygiene: remove only proven-dead excluded tests/artifacts; audit each remaining `vitest.config.ts` test-name exclusion individually.
3. Consolidate the Live Game CSS patch stack without changing geometry/behavior; use focused visual/browser verification.
4. Split other high-complexity modules one at a time, especially `GameProtocolModal.tsx` and tournament route modules, after the current Live Game pass.
5. Audit the remaining large Base route modules route-by-route before any consolidation; preserve unique handlers and current registration/auth/data-safety behavior.
6. Keep Python bot cleanup separate from web refactors; confirm imports/runtime entry points before deleting historical modules.
7. Deploy a verified `main` to Render manually when deployment access is available, then run non-destructive runtime health checks before targeted integration round-trips.
8. Real online payment/SBP integration only after explicit provider decision.

Do not mix production DB/migration changes into cleanup-only PRs.

## Handoff rule

Update this file with significant changes to functional status, next queue, architecture decisions, deployment assumptions or dangerous areas. `Last verified main` must reference a merged main SHA that passed standard CI. A following docs-only/cleanup merge may temporarily make this field lag; use Git history plus `npm run project:status` to reconcile rather than re-auditing the repository.
