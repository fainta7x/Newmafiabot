# PROJECT-AUDIT-001 — Phase 4 functional audit matrix

Status: automated-evidence pass complete; first deployed runtime foundation probe verified  
Parent: #330  
Phase issue: #346

This document deliberately separates **automated evidence** from **deployed runtime verification**. A feature is not marked runtime PASS solely because tests exist.

## Status legend

Automated evidence:
- **COVERED** — meaningful integration/E2E/regression coverage exists.
- **PARTIAL** — important units are tested, but the full product flow is not.
- **GAP** — no meaningful automated flow coverage found in the current test inventory.

Runtime:
- **NOT YET VERIFIED** — the individual product flow has not yet been exercised against the deployed app.
- **PASS / PARTIAL / FAIL** are assigned only after deployed verification of that flow.

## Deployed runtime evidence — pass 1

On 2026-09-21, after hotfix #365 was merged, the current `scripts/runtimeMonitor.mjs` was executed from an isolated audit branch against the canonical production URL.

Evidence:
- GitHub Actions run `35576257748` completed successfully;
- the repository/runtime-monitor URL variables were empty, so the script used its canonical Amvera default target;
- Telegram alert-delivery secrets were intentionally absent;
- the script logged `Telegram notifications are not armed; runtime probing and GitHub incidents remain active.`;
- it then logged `Runtime is healthy.`.

Because `probeRuntime()` only returns healthy when both `/api/health` and `/api/health/runtime` pass, this is direct deployed evidence that the public web health endpoint and the runtime readiness checks for database, bot service and Telegram were healthy at that time.

This verifies the **runtime foundation**, not the 24 user/product flows below. Those remain NOT YET VERIFIED until each flow is exercised.

## Initial matrix

| # | Product flow | Automated evidence | Runtime | Main evidence / notes |
|---|---|---|---|---|
| 1 | New player registration | COVERED | NOT YET VERIFIED | `playerRegistration.test.ts`, onboarding service/UI/routing tests |
| 2 | Existing player Telegram linkage | PARTIAL | NOT YET VERIFIED | registration/link API coverage exists; legacy compatibility path still active |
| 3 | VK linkage / owner settings | COVERED | NOT YET VERIFIED | `vkPlayerAuth*`, `vkPlayerCabinetAccess`, `vkUnifiedIdentity`, `vkAccessOperational` |
| 4 | Player Cabinet profile | COVERED | NOT YET VERIFIED | premium profile integration/showcase/privacy/navigation tests |
| 5 | Player events / RSVP / exact slots | COVERED | NOT YET VERIFIED | `playerEveningSlotRouteHotfix`, `telegramRsvpSlotSync`, `organizerEveningSlots`, event calendar tests |
| 6 | Organizer CRM player management | COVERED | NOT YET VERIFIED | current CRM smoke, onboarding organizer, player access/profile tests |
| 7 | Evening create/edit/roster | COVERED | NOT YET VERIFIED | E2E CRM evening/roster specs + creation/roster tests |
| 8 | Arrival / attendance / payment | COVERED | NOT YET VERIFIED | canonical evening state, pricing/payment/debt/CRM-PAY tests |
| 9 | Telegram publish/update/reminders | COVERED | NOT YET VERIFIED | publishing, roster, notification, runtime health tests; spam boundary fixed in #339 |
| 10 | VK publish/update | COVERED | NOT YET VERIFIED | publishing, wall editor, live refresh integration status tests |
| 11 | Full normal Live Game | COVERED | NOT YET VERIFIED | Live Game E2E suite + flow/state/setup tests |
| 12 | Fouls / technical fouls / PPK / removal | COVERED | NOT YET VERIFIED | discipline, exited-player actions, speech extension, Live Game flow regressions |
| 13 | Voting / revote / night transitions | COVERED | NOT YET VERIFIED | voting, revote, night target, death protocol tests |
| 14 | Final-save failure + recovery | COVERED | NOT YET VERIFIED | `liveFinalSaveFailureRecovery`, pending/emergency/table-decision recovery tests |
| 15 | Completed-game correction | PARTIAL | NOT YET VERIFIED | protocol editors/correction models exist; legacy Python edit callbacks remain a competing historical surface |
| 16 | Evening closeout / settlement | COVERED | NOT YET VERIFIED | `eveningCloseout`, `eveningSettlement`, CRM closeout E2E |
| 17 | Rating / Elo / history | COVERED | NOT YET VERIFIED | Elo history/seed/rating-period/player rating tests; legacy Python stats still coexist |
| 18 | Tournament setup / protocol / results / awards | COVERED | NOT YET VERIFIED | tournament validation/voting/results/export/awards/evening tests |
| 19 | Tokens / betting / shop | PARTIAL | NOT YET VERIFIED | token/betting lifecycle covered; legacy Python bets/shop remain mounted, canonical shop flow needs full E2E |
| 20 | Personal Telegram/VK notifications | COVERED | NOT YET VERIFIED | Telegram notifications integration, VK message outbox/channel routing tests |
| 21 | OBS / live broadcast | COVERED | NOT YET VERIFIED | live broadcast + overlay/state integration tests |
| 22 | Backup + isolated restore | PARTIAL | NOT YET VERIFIED | backup verifier exists and contract tests protect wiring; real production-generated snapshot restore drill still required |
| 23 | Mobile Telegram WebApp viewport / keyboard | COVERED | NOT YET VERIFIED | Telegram viewport, keyboard, compact Live Game E2E/tests |
| 24 | Legacy Telegram shell cannot fork canonical state | COVERED | NOT YET VERIFIED | canonical /admin, registration write removal and guard-first containment cover stale legacy write families; source-retained handlers await deployed verification |

## Strongest covered areas

### Live Game

Live Game currently has the densest automated coverage in the repository:
- normal phase flow;
- setup and role assignment;
- voting/revote;
- death/night targeting;
- fouls/discipline;
- recovery after failed save;
- pending state recovery;
- mobile/compact layout;
- broadcast/overlay plumbing.

This makes it a good candidate for targeted refactor after the functional runtime pass because behavior is comparatively well protected.

### Evening/CRM

Evening creation, roster, exact slots, pricing, attendance, settlement and closeout have broad unit/integration/E2E coverage.

The main remaining risk is not lack of tests but interaction with:
- automation workers;
- Telegram/VK publication lifecycle;
- legacy Python booking/payment state.

### Integrations

Telegram and VK now have durable publication/delivery state and focused regression coverage. The two Phase 3 lifecycle follow-ups are now completed:
- #344 finalizes Telegram/VK evening publications on close/cancel;
- #345 retires the shadowed legacy VK publishing paths.

## Current functional risks

### A. Legacy Telegram source remains, but current write entrypoints are contained

The legacy Python handler source and `mafia_crm.db` still exist for compatibility/rollback evidence, but current and stale Telegram business-write entrypoints are intercepted by the retirement guard before legacy routers.

This containment is documented in `PROJECT_AUDIT_001_LEGACY_DB_CONTAINMENT.md` and completed through #357, #359, #362, #363 and #364. Runtime deletion of the old source/tables is a later Phase 7 task, not a current source-of-truth blocker.

### B. Completed-game correction still lacks a full deployed canonical flow check

Canonical WebApp protocol/editing is tested, and stale legacy Python game-edit callbacks are now blocked before they can mutate the legacy DB. The remaining reason for classifying completed-game correction as PARTIAL is the lack of one end-to-end deployed canonical correction verification.

### C. Tokens/betting/shop still need canonical end-to-end verification

Canonical betting/token ledger has good automated coverage, and stale legacy Telegram betting/shop writes are now intercepted. The remaining gap is a complete canonical WebApp E2E/runtime pass, especially for shop behavior and test-mode product boundaries.

### D. Backup restore is not yet proven against a real production snapshot

The repository now has an isolated restore verifier, but Phase 4 still needs one real snapshot generated by the deployed backup worker to be tested through that verifier. No production DB replacement is required.

## Runtime verification queue

Continue deployed verification in this non-destructive order:

1. **DONE 2026-09-21:** `/api/health` and `/api/health/runtime` via runtime-monitor run `35576257748`.
2. Open Player Cabinet as an already-linked player.
3. Open organizer CRM via Telegram `/admin` and `/crm`; both must land in canonical CRM.
4. Open current evening and change one player's exact slot selection; confirm one Telegram post edit and no new post.
5. Confirm existing VK evening post updates in place.
6. Run Telegram/VK safe health checks.
7. Complete a disposable/test-mode Live Game flow if test mode is available.
8. Verify current evening closeout screen without settling a live event.
9. Inspect system-status queue diagnostics.
10. Verify latest production-generated SQLite backup using the isolated restore command.

## Next implementation slice

Legacy callback containment is now complete at current Telegram entrypoints. The next safe code-oriented slice is **Phase 5 release-gate hardening**:

- make the existing `smoke`, `crm`, `live-game`, `telegram`, `vk` and `regression` test groups explicit release-gate evidence;
- keep a non-destructive production health probe separate from deploy/build success;
- preserve the distinction between CI success, deployed Amvera runtime and real user-flow verification;
- after the release gate is explicit, begin targeted refactoring with the best-covered large module, `LiveGameEngine.tsx`, in behavior-preserving PR-sized slices.

No big-bang rewrite and no production DB edits.
