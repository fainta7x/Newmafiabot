# Friday release record — 2026-08-20

> **Historical release record only.** Do not use this file for current project/deploy/storage status. Current state lives in `docs/PROJECT_STATE.md`; deploy procedure lives in `docs/RUNBOOK.md`.

## Release

- Release PR: #118
- Target: `main`
- Merged main SHA: `9fdbaaf812280180b395688ea112303645d75ea2`
- Accepted design lineage: stacked migration #90–#118
- Integration head before merge: `b86c9003178ac2ce5f672992175f3b0bd3653faa`
- Integration GitHub CI: run #943 — green before merge

## Included

- canonical Player Cabinet visual foundation and remaining player surfaces;
- Organizer CRM cabinet migration;
- Live Game shell, center HUD, seat identity and judge quick actions;
- voting/table-decision/night readability fixes;
- compact journal with Undo and contextual player actions;
- eliminated-player and voting identity fixes;
- canonical recovery presentation;
- death protocol cabinet presentation.

## Safety boundary

The release does not intentionally change approved Mafia/game rules or replace/reset production data.

Production data backend selection is owned by `src/db/index.ts`; current production/storage status is documented only in `docs/PROJECT_STATE.md`.

The setup/physical role-distribution screen retains older cosmetic styling. It is functional and was intentionally not treated as a release blocker.

## Deployment note

Render deployment is manual. Merge/green CI does not prove live deployment; follow `docs/RUNBOOK.md` and update `PROJECT_STATE` when runtime deployment is verified.
