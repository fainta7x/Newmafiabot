# PROJECT-AUDIT-001 — Phase 4 functional audit matrix

Status: initial automated-evidence pass  
Parent: #330  
Phase issue: #346

This document deliberately separates **automated evidence** from **deployed runtime verification**. A feature is not marked runtime PASS solely because tests exist.

## Status legend

Automated evidence:
- **COVERED** — meaningful integration/E2E/regression coverage exists.
- **PARTIAL** — important units are tested, but the full product flow is not.
- **GAP** — no meaningful automated flow coverage found in the current test inventory.

Runtime:
- **NOT YET VERIFIED** — no live production claim is made in this pass.
- Later passes will use PASS / PARTIAL / FAIL only after deployed verification.

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

Telegram and VK now have durable publication/delivery state and focused regression coverage. Remaining lifecycle issues are tracked separately:
- #344 close/cancel finalization;
- #345 obsolete/shadowed VK paths.

## Current functional risks

### A. Active dual-generation Telegram shell

The current compact shell is canonical-first, but old Python handlers are still mounted. Old messages/callback buttons can therefore potentially invoke legacy business writes even when the current main menu no longer exposes them.

Tracked in #342.

### B. Completed-game editing has two generations

Canonical WebApp protocol/editing is tested. Legacy Python `handlers/profile.py` still contains extensive game-history editing callbacks backed by the legacy DB.

Until those callbacks are retired or bridged, completed-game correction is classified PARTIAL rather than fully clean.

### C. Tokens/betting/shop have legacy overlap

Canonical betting/token ledger has good automated coverage, but old Python bet/shop handlers still exist and use bot-local state. The canonical WebApp flow needs a full E2E pass before this area can be called clean.

### D. Backup restore is not yet proven against a real production snapshot

The repository now has an isolated restore verifier, but Phase 4 still needs one real snapshot generated by the deployed backup worker to be tested through that verifier. No production DB replacement is required.

## Runtime verification queue

After the next deployment containing the current audit fixes, verify these in a non-destructive order:

1. `/api/health` and `/api/health/runtime`.
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

The next code-oriented audit slice should focus on **legacy callback containment**:

- identify legacy write callback prefixes from old Telegram messages;
- fail closed or redirect those that now duplicate canonical CRM behavior;
- keep only required compatibility/registration/read-only commands;
- add contract tests preventing current bot entrypoints from mutating `mafia_crm.db` business state.

After that, perform the first deployed runtime verification pass and update this matrix from NOT YET VERIFIED to PASS/PARTIAL/FAIL with evidence.
