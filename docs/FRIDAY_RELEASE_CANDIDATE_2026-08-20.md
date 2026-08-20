# Friday release candidate — 2026-08-20

This document records the release gate for the Friday 2LA Noire club evening.

## Candidate

- Release PR: #118
- Target branch: `main`
- Candidate lineage: accepted stacked design chain #90–#118
- Previous stacked-tip verification: full CI + mobile Playwright green on `09b42fa3faa584465cc2ba280591b9f40081f74f`

## Included

- canonical Player Cabinet visual foundation and remaining player surfaces;
- Organizer CRM cabinet migration;
- Live Game shell, center HUD, seat identity and judge quick actions;
- voting/table-decision/night readability fixes;
- compact journal with Undo and contextual player actions;
- eliminated-player identity and voting identity fixes;
- canonical recovery presentation;
- death protocol cabinet presentation.

## Release safety boundary

This release does not intentionally change approved Mafia/game rules, API contracts, or database contents. It must not restore, reset, replace, or migrate the active runtime database as part of deployment.

The setup/role-distribution screen still has cosmetic legacy styling. It is functional and is explicitly deferred as a post-Friday visual polish item rather than a release blocker.

## Gate

Merge into `main` only after the new head created by this release note passes all required GitHub CI gates, including web checks, Python syntax and mobile Playwright.

After merge, verify the exact `main` SHA before manual Render deployment and verify `/api/health` after deploy.
