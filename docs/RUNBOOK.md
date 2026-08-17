# 2LA Noire — Work / Verification / Deploy Runbook

This runbook defines the default way to work on the repository safely and efficiently.

The goal is to avoid two bad extremes:

- repeatedly re-auditing the entire repository before every task;
- making a fast local change without proving it is safe in the real project.

## 1. Start of a new chat or work session

Read in this order:

1. `AGENTS.md`
2. `docs/PROJECT_STATE.md`
3. last 5–10 commits on remote `main`
4. `docs/ARCHITECTURE.md`
5. `docs/BUSINESS_RULES.md` only when the task touches game/product rules
6. files/tests directly related to the requested task

Then run/use `npm run project:status` when a working copy is available.

### Do not do by default

Do **not** begin an ordinary task by:

- cloning/re-reading every route;
- rebuilding the entire roadmap from chat history;
- inspecting every CRM/player/tournament component;
- re-running full CI before any edit;
- restoring/importing database snapshots;
- assuming an old roadmap checkbox is current.

Widen discovery only if targeted files contradict the state/architecture docs or the requested change spans multiple subsystems.

## 2. Git source of truth

Before code/data changes:

- fetch current remote state;
- base work on the latest intended remote branch (normally `main`);
- preserve newer user/AI Studio changes;
- never overwrite current work with an older chat snapshot.

For assistant-driven repository work, prefer:

`fresh main -> small named branch -> focused commits -> PR -> full CI -> merge -> verify main`

Do not stack unrelated work on a red `main`.

## 3. Discovery pass

Perform one targeted discovery pass and keep a compact mental/file map for the task.

Recommended sequence:

1. find active UI entry point;
2. find client API call;
3. find mounted server route in `src/app.ts`;
4. find service/DB path;
5. find focused tests;
6. inspect only adjacent files needed for side effects.

Do not infer that a file is dead because it contains `Legacy`, `V2`, `old`, etc. Confirm active imports/mounts/build transforms first.

## 4. Change size

Prefer small PRs with one clear purpose.

Good examples:

- fix one race + regression test;
- add one safe integration diagnostic;
- remove one proven-unused wrapper;
- document one architecture transition.

Avoid mixing:

- DB restore + UI redesign;
- Elo formula rewrite + dependency upgrades;
- deployment changes + unrelated refactor;
- mass legacy deletion based only on filenames.

## 5. Database safety

This is a critical rule.

### Runtime database precedence

A non-empty runtime DB always wins over repository bootstrap/checkpoint data.

Never overwrite, reset, clean, restore or replace an existing runtime DB during normal Git/deploy work.

### Repository checkpoint

Canonical repository checkpoint files:

- `mafia_crm.checkpoint.sqlite.gz.b64`
- `mafia_crm.checkpoint.meta.json`

They are bootstrap/recovery artifacts, not normal production synchronization.

Use only guarded commands:

- `npm run checkpoint:git-export`
- `npm run checkpoint:git-import`

Never commit raw runtime SQLite DBs or ad-hoc backup copies.

Before a destructive restore/migration, explicitly establish:

- target DB;
- reason;
- backup/recovery path;
- expected current tournament/player markers;
- that the user actually requested destructive data work.

## 6. Iteration testing

While implementing:

- run focused test(s) for the changed behavior;
- add a regression test for a reproduced bug when practical;
- use strict TypeScript errors as real failures, not something to suppress;
- do not weaken tests just to make CI green.

Avoid repeatedly running the whole suite after every tiny edit.

## 7. Required final CI

The repository CI is authoritative before merge.

Current web gates:

1. `npm ci`
2. `npm run release:audit`
3. `npm run typecheck`
4. `npm test`
5. `npm run build`

Bot gate:

- Python 3.11 `compileall` over the active bot sources.

Do not merge while a required gate is red unless the user explicitly chooses an emergency exception and the risk is understood.

### Flaky test handling

If a test fails on `main` after a green PR:

1. inspect the exact failing test/log;
2. compare whether the same SHA passed previously;
3. rerun only the failed job once if a flake is plausible;
4. inspect code for a real race even if the retry passes;
5. fix the underlying race when one is found.

Do not repeatedly rerun a red job until it turns green without investigation.

## 8. Dependency security

Use read-only diagnostics first:

- `npm audit --json`
- `npm ls <package>`

Rules:

- verify the vulnerable dependency exists in the **current** lockfile;
- distinguish direct vs transitive dependency;
- prefer compatible patched updates;
- do not use `npm audit fix --force` blindly;
- major upgrades require compatibility testing;
- do not fix vulnerabilities from an obsolete diagnostic branch/tree.

A permanent CI audit gate is useful only if it represents the current dependency tree and does not introduce known unavoidable false positives.

## 9. Render deployment

Repository config:

- `render.yaml`
- service: `2la-noire-web-staging`
- branch: `main`
- health path: `/api/health`
- `autoDeployTrigger: off`

Therefore:

**Green GitHub `main` != deployed production/staging build.**

When deployment access is available:

1. verify the exact green `main` SHA intended for deployment;
2. trigger the manual Render deploy;
3. verify `/api/health`;
4. verify application load/auth as appropriate;
5. run safe integration runtime checks;
6. only then perform a targeted real external round-trip if necessary.

Do not modify or restore production data merely because a new deploy starts with DB/bootstrap logic; runtime DB safety rules still apply.

## 10. Telegram runtime smoke test

Prefer this order:

1. deploy latest verified `main`;
2. use organizer safe Telegram runtime health check;
3. verify token/API/webhook/bot-service status;
4. if a real send must be tested, use one known test/target recipient;
5. verify the response/status round-trip into the app;
6. inspect outbox/retry state if delivery fails.

Avoid a mass club announcement for generic diagnostics.

See `docs/telegram-runtime-health.md`.

## 11. VK runtime smoke test

Prefer this order:

1. deploy latest verified `main`;
2. use organizer safe VK runtime health check;
3. verify community API identity and stored callback/OAuth state;
4. perform a minimal targeted sync/test only if needed;
5. verify join/respond/reconcile path;
6. avoid public spam or callback repair as a generic health probe.

See `docs/vk-runtime-health.md`.

## 12. Legacy cleanup

Before deleting a legacy-looking file:

1. search imports/re-exports;
2. inspect `src/app.ts` mounts for server routes;
3. inspect Vite/build transforms for variant files;
4. remove/replace dependency in a branch;
5. let strict TypeScript + full tests + build prove no active references remain.

If deletion fails typecheck/build, treat that as evidence of live usage and trace the dependency instead of forcing removal.

## 13. Documentation maintenance

Update `docs/PROJECT_STATE.md` in the same PR when a significant task changes:

- feature status;
- current next queue;
- architecture ownership;
- integration/deployment assumptions;
- major technical debt status;
- an important product decision.

Update `docs/ARCHITECTURE.md` when entry points/mounts/subsystem ownership changes.

Update `docs/BUSINESS_RULES.md` only when the user-approved rule/product decision changes.

Update this runbook when the safe operational process itself changes.

## 14. End-of-task handoff

A good handoff contains only what the next session needs:

- merged PR / main SHA;
- CI result;
- what changed;
- what remains unresolved;
- runtime verification still needed;
- any new danger/caution.

Record durable state in the repository instead of relying on a long chat recap.

## 15. Recovery when docs and code disagree

Do not blindly trust either side.

Use this precedence:

1. latest remote code/mounts for implementation truth;
2. latest green CI for build/test truth;
3. explicit user-approved business rules for domain behavior;
4. latest merged PR/commit history for recent transitions;
5. update stale documentation once the discrepancy is understood.

A discrepancy should trigger **targeted reconciliation**, not a full project re-audit.
