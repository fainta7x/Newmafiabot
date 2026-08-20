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

`fresh main -> small named branch -> focused edits/tests -> PR -> full CI -> merge -> verify main`

Do not stack unrelated work on a red `main`.

### Single-writer branch rule

A working branch has one active writer by default. ChatGPT, Google AI Studio and another agent must not make competing edits on the same branch at the same time.

Before each new write batch, compare the branch head with the head you last read. If it moved unexpectedly:

1. stop writing;
2. inspect the new commit(s);
3. preserve valid newer work;
4. reconcile the file map/plan;
5. only then continue.

Do not race another writer by repeatedly overwriting the same files.

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

### Per-request PR budget

For assistant-driven repository work, one user message/request has a hard budget of **at most 3 PRs**.

Rules:

1. Count PR work against the user message that requested the batch.
2. After the third PR, stop code/doc changes and stop waiting/polling for additional CI as part of that same request.
3. Give a compact handoff: which PRs were completed/opened, their current verification state, and the next unresolved item.
4. Continue the next PR or next visual-fix batch only after a new user message.
5. Do not evade the limit by creating extra stacked PRs for newly discovered polish inside the same request.
6. Multiple coherent commits inside one PR are allowed, but one PR must not become an endless CI/visual-repair loop. Batch related fixes before another full CI run; defer expanding follow-up work to the next request when necessary.

This budget exists to keep long assistant runs responsive and recoverable. Blocking correctness/data-safety problems take priority within the three-PR budget; lower-priority polish is deferred first.

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

## 6. Staged verification during implementation

Verification has three levels. Do not jump to the most expensive level after every edit.

### Level A — focused behavior check

After a small code change, run only the directly relevant test/file/request. Examples:

```bash
npx vitest run src/tests/playerAvatars.test.ts
npx vitest run src/tests/example.test.ts -t "specific behavior"
```

Use `npm run project:affected -- <changed files>` to identify likely focused tests when needed.

If a reproduced bug has no regression test, add one when practical.

### Level B — cheap project-wide safety pass

After a coherent batch of edits, or before declaring the implementation locally ready, run:

```bash
npm run project:verify:fast
```

It runs release data-safety audit, strict TypeScript and ESLint. It intentionally does **not** run the full Vitest suite, production build or Playwright.

Use strict TypeScript/lint failures as real failures, not something to suppress.

### Level C — release verification

Run complete verification only when the branch is coherent and ready for review/merge:

```bash
npm run project:verify
```

Then rely on GitHub CI as the authoritative final gate, including Playwright and Python bot syntax.

Avoid repeatedly running the whole suite after every tiny edit.

## 7. PR / CI flow

The default optimization is to avoid starting heavy GitHub CI before active iteration is finished.

Preferred flow:

1. create a focused branch from current green `main`;
2. keep the PR unopened while doing ordinary iteration when practical;
3. use Level A focused checks, then Level B as needed;
4. open the PR only when the change is coherent;
5. let full CI run once;
6. merge only when all required gates are green.

If visibility requires opening the PR early, create it as **draft**. Heavy repository CI is configured to skip draft PRs. Mark it ready for review only after focused verification; the ready-for-review transition triggers full CI.

### When full CI fails

1. inspect the exact failed job/log;
2. identify the smallest failing layer;
3. convert the PR back to draft while a multi-step repair is in progress when practical;
4. run/fix only the relevant focused test first;
5. complete the repair as one coherent batch;
6. mark the PR ready again so full CI runs once on the new head.

Do not repeatedly rerun a red job until it turns green.

If tooling forces several sequential commits to an already-open PR, prefer batching locally. When that is impossible, GitHub-supported CI-skip commit markers may be used **only for intermediate half-fix commits**; the final substantive commit must trigger CI normally.

## 8. Required final CI

The repository CI is authoritative before merge.

Current web gates:

1. `npm ci`
2. `npm run release:audit`
3. `npm run typecheck`
4. `npm run lint`
5. `npm test`
6. `npm run build`

Bot gate:

- Python 3.11 `compileall` over the active bot sources.

Browser gate:

- Playwright mobile smoke after web checks pass.

Do not merge while a required gate is red unless the user explicitly chooses an emergency exception and the risk is understood.

### Flaky test handling

If a test fails on `main` after a green PR:

1. inspect the exact failing test/log;
2. compare whether the same SHA passed previously;
3. rerun only the failed job once if a flake is plausible;
4. inspect code for a real race even if the retry passes;
5. fix the underlying race when one is found.

Do not repeatedly rerun a red job until it turns green without investigation.

## 9. Dependency security

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

## 10. Render deployment

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

## 11. Telegram runtime smoke test

Prefer this order:

1. deploy latest verified `main`;
2. use organizer safe Telegram runtime health check;
3. verify token/API/webhook/bot-service status;
4. if a real send must be tested, use one known test/target recipient;
5. verify the response/status round-trip into the app;
6. inspect outbox/retry state if delivery fails.

Avoid a mass club announcement for generic diagnostics.

See `docs/telegram-runtime-health.md`.

## 12. VK runtime smoke test

Prefer this order:

1. deploy latest verified `main`;
2. use organizer safe VK runtime health check;
3. verify community API identity and stored callback/OAuth state;
4. perform a minimal targeted sync/test only if needed;
5. verify join/respond/reconcile path;
6. avoid public spam or callback repair as a generic health probe.

See `docs/vk-runtime-health.md`.

## 13. Legacy cleanup

Before deleting a legacy-looking file:

1. search imports/re-exports;
2. inspect `src/app.ts` mounts for server routes;
3. inspect Vite/build transforms for variant files;
4. remove/replace dependency in a branch;
5. let strict TypeScript + full tests + build prove no active references remain.

If deletion fails typecheck/build, treat that as evidence of live usage and trace the dependency instead of forcing removal.

## 14. Documentation maintenance

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

## 15. End-of-task handoff

A good handoff contains only what the next session needs:

- merged PR / main SHA;
- CI result;
- what changed;
- what remains unresolved;
- runtime verification still needed;
- any new danger/caution.

Record durable state in the repository instead of relying on a long chat recap.

## 16. Recovery when docs and code disagree

Do not blindly trust either side.

Use this precedence:

1. latest remote code/mounts for implementation truth;
2. latest green CI for build/test truth;
3. explicit user-approved business rules for domain behavior;
4. latest merged PR/commit history for recent transitions;
5. update stale documentation once the discrepancy is understood.

A discrepancy should trigger **targeted reconciliation**, not a full project re-audit.
