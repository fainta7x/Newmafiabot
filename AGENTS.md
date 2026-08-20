# 2LA Noire — AI work contract

This file is the mandatory starting point for AI-assisted work in this repository. It defines **how the assistant must work**. It must not duplicate detailed project state, architecture or business rules.

## 1. Mandatory startup

For every new chat/session that touches the repository:

1. Fetch the latest remote `main`.
2. Read this file.
3. Read `docs/PROJECT_STATE.md`.
4. Review only the last 5–10 commits on `main` unless deeper history is necessary.
5. Use `docs/FEATURE_MAP.md` for known features or `docs/ERROR_PLAYBOOK.md` for symptoms/errors.
6. Read `docs/ARCHITECTURE.md` only when the task spans subsystems or ownership is unclear.
7. Read `docs/BUSINESS_RULES.md` before changing Mafia/game/product behavior.
8. Read `docs/RUNBOOK.md` for CI, deployment, database, recovery or integration work.
9. When a local checkout is available, run `npm run project:status`; use `--check --json` for machine-readable verification.

Do **not** rebuild project context primarily from old chat history. Old chats and historical roadmaps are secondary evidence only.

## 2. Source-of-truth precedence

Use this order when sources disagree:

1. latest remote code/mounts — implementation truth;
2. latest green CI for the exact SHA — build/test truth;
3. `docs/BUSINESS_RULES.md` — user-approved domain behavior;
4. `docs/PROJECT_STATE.md` — current product/deploy state and next queue;
5. `docs/ARCHITECTURE.md` — subsystem ownership and runtime topology;
6. `docs/FEATURE_MAP.md` / `docs/ERROR_PLAYBOOK.md` — navigation aids;
7. merged PR/commit history — recent transitions;
8. historical roadmap/release notes — history only;
9. old chats — never override newer Git state.

If docs contradict current code, do a **targeted reconciliation**, update the stale doc in the same workstream, and do not continue with two competing interpretations.

## 3. One fact, one owner

Do not copy mutable facts into several documents.

- Current SHA, deployed/not-deployed state, active production storage, current queue -> `docs/PROJECT_STATE.md`.
- Work/verification/deploy procedure -> `docs/RUNBOOK.md`.
- Subsystem ownership/runtime topology -> `docs/ARCHITECTURE.md`.
- Visual contract -> `docs/DESIGN_SYSTEM.md`.
- Game/product rules -> `docs/BUSINESS_RULES.md`.
- Feature-to-file routing -> `docs/FEATURE_MAP.md`.

Other docs should link to the owner instead of restating mutable facts.

## 4. Working style

- Perform one targeted discovery pass, then keep a compact file map.
- Prefer `FEATURE_MAP/ERROR_PLAYBOOK -> exact source files -> focused tests`.
- Never infer that `legacy`, `old`, `V2`, `Base`, etc. means unused; confirm imports/mounts/build transforms.
- Preserve newer user/AI Studio changes. A working branch has one writer by default.
- If a branch head moves unexpectedly, stop and reconcile before writing again.
- Never delegate implementation back to AI Studio when repository access is available.
- Do not substitute prompt-writing for requested repository work.

## 5. PR budget — hard rule

For **one user message/request**, create at most **3 pull requests total**.

- After the third PR, stop repository changes and CI polling.
- Give a short handoff: what is done, what remains, what is blocked.
- Continue only after the user's next message.
- Prefer fewer PRs when one coherent PR is sufficient.
- Do not evade the limit by creating several branches without PRs for the same work.
- One PR may contain several coherent commits, but it must not become an endless `screenshot -> fix -> full CI -> fix -> full CI` loop.

## 6. Branch / CI discipline

Default flow:

`fresh green main -> focused branch -> focused checks -> coherent PR -> one full CI -> screenshot/runtime review if relevant -> merge -> verify main`

During iteration:

- run only directly relevant tests;
- use `npm run project:affected -- <changed files>` when useful;
- use `npm run project:verify:fast` after a meaningful batch;
- avoid full Vitest/build/Playwright after every tiny edit.

Before merge:

- full repository CI is authoritative;
- never weaken TypeScript/tests to force green;
- inspect the exact failing job before rerunning;
- for visual work, **green CI is not visual approval**: inspect fresh Playwright screenshots for clipping, overlap, lost identity, bad hierarchy and wrong mobile geometry.

## 7. Database safety

Production data is more important than repository convenience.

- The current production-primary database is **remote Turso** when both `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are configured.
- The local `DATABASE_PATH` SQLite file is a fallback/local path, not proof of production storage ownership.
- Repository checkpoint files are bootstrap/recovery artifacts only.
- A non-empty runtime database always wins over repository checkpoint/bootstrap data.
- Never reset, restore, replace, clean or overwrite production/runtime data during normal Git/deploy work.
- Never infer that a Render deploy resets data solely because `render.yaml` contains `/tmp`; first inspect the DB selection logic in `src/db/index.ts` and current project state.

Canonical repository checkpoint files:

- `mafia_crm.checkpoint.sqlite.gz.b64`
- `mafia_crm.checkpoint.meta.json`

Use only guarded checkpoint commands documented in `docs/RUNBOOK.md`.

## 8. Documentation maintenance — required

Durable changes must be recorded in Git, not only in chat.

In the same PR when practical:

- update `PROJECT_STATE` when feature status, current queue, verified main, deployment/storage assumptions or release state changes;
- update `ARCHITECTURE` when entry points, ownership or runtime topology changes;
- update `RUNBOOK` when safe work/deploy/recovery procedure changes;
- update `DESIGN_SYSTEM` only when the durable visual contract changes;
- update `BUSINESS_RULES` only after explicit user-approved product/rule change;
- update `FEATURE_MAP` only when first-hop ownership changes.

Do not maintain detailed chronological completed-work lists in multiple docs. Git history is the history.

## 9. End-of-task handoff

A good handoff contains only:

- PR/merge/main SHA;
- CI result;
- what changed;
- what remains;
- runtime verification still needed;
- one explicit caution if any.

Before claiming the project is ready to deploy, distinguish:

- `green main`;
- `deployed main`;
- `runtime verified`.

These are three different states.
