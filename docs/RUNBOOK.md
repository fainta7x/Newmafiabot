# 2LA Noire — Work / Verification / Deploy Runbook

This file defines **procedure only**. Current feature/deploy facts belong in `docs/PROJECT_STATE.md`; architecture ownership belongs in `docs/ARCHITECTURE.md`.

## 1. Start of work

1. Fetch latest remote `main`.
2. Read `AGENTS.md`.
3. Read `docs/PROJECT_STATE.md`.
4. Review last 5–10 `main` commits.
5. Use `FEATURE_MAP` or `ERROR_PLAYBOOK` for targeted discovery.
6. Read `BUSINESS_RULES` only for game/product behavior.
7. Run `npm run project:status` when a local checkout exists.

Do not re-audit the repository by default.

## 2. Hard PR budget

For one user message/request:

- maximum **3 PRs**;
- after PR #3, stop repository writes and CI polling;
- provide a short handoff and wait for the user's next message;
- prefer 1 coherent PR where possible;
- never hide extra work in unreviewed parallel branches to bypass this limit.

## 3. Default Git workflow

Preferred sequence:

`fresh green main -> focused branch -> targeted discovery -> focused checks -> coherent PR -> full CI once -> visual/runtime review if relevant -> merge -> verify main`

Single-writer rule:

- one active writer per branch;
- if ChatGPT/AI Studio/user moves the branch unexpectedly, stop and reconcile before continuing;
- never overwrite newer valid work with an older local/chat state.

## 4. Verification levels

### Level A — focused

Use the smallest relevant test/request while iterating.

Examples:

```bash
npx vitest run src/tests/playerAvatars.test.ts
npx vitest run src/tests/example.test.ts -t "specific behavior"
npm run project:affected -- <changed files>
```

### Level B — cheap project safety

After a coherent batch:

```bash
npm run project:verify:fast
```

This is release audit + TypeScript + ESLint, without full Vitest/build/Playwright.

### Level C — release verification

When the PR is coherent and ready:

```bash
npm run project:verify
```

Then GitHub CI is authoritative for the final gate, including Python and mobile Playwright.

Do not run Level C after every small edit.

## 5. Full CI failure handling

When a required job fails:

1. inspect the exact failed job/log;
2. identify the smallest failing layer;
3. fix/test that layer first;
4. batch related repair commits when possible;
5. trigger full CI again only when the repair is coherent.

Do not repeatedly rerun a red job hoping it becomes green.

For a plausible flake, one targeted retry is acceptable after inspecting the failure.

## 6. Visual work acceptance

Green Playwright means the scenario executed; it does **not** mean the UI looks correct.

For visual PRs:

1. run focused browser evidence;
2. inspect the generated screenshots yourself;
3. explicitly check clipping, overlap, lost player identity, unreadable text, bad hierarchy, wrong phase colour, viewport overflow and Telegram safe-area problems;
4. fix visible bugs before starting the next visual stage;
5. only then consider the visual stage accepted.

Do not use CSS ellipsis/hidden overflow merely to make a screenshot/test fit when it hides information the judge needs.

## 7. Database safety

### Backend selection

The authoritative selection logic is `src/db/index.ts`.

- If both `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` exist, production uses remote Turso.
- If neither exists, the local `DATABASE_PATH` SQLite fallback is used.
- If only one Turso value exists, startup must fail rather than silently choose another backend.

Never decide data persistence from `render.yaml`'s `DATABASE_PATH` alone.

### Runtime precedence

A non-empty runtime database always wins over repository checkpoint data.

Never overwrite, reset, clean, restore or replace an existing production/runtime DB during ordinary Git/deploy work.

### Repository checkpoint

Canonical recovery/bootstrap files:

- `mafia_crm.checkpoint.sqlite.gz.b64`
- `mafia_crm.checkpoint.meta.json`

Use only:

```bash
npm run checkpoint:git-export
npm run checkpoint:git-import
```

The checkpoint is not a production synchronization mechanism.

Before destructive data work, explicitly establish target DB, reason, backup/recovery path and user approval.

## 8. Render deployment

Render is manual; green `main` is not the same as deployed `main`.

Before deploy:

1. identify the exact intended `main` SHA;
2. confirm its release/CI gate;
3. check `npm run project:status` / `PROJECT_STATE` for the expected production storage contract;
4. do not restore/import checkpoint data as part of a normal deploy;
5. trigger Manual Deploy.

After deploy:

1. verify `/api/health`;
2. verify application load and organizer/player auth as appropriate;
3. verify one or two recent live-data markers that could reveal a wrong DB backend (for example latest evening and recent avatars);
4. run non-destructive Telegram/VK health diagnostics when relevant;
5. only then perform a targeted external round-trip if needed.

Do not perform a mass club announcement as a generic smoke test.

## 9. Telegram runtime verification

Preferred order:

1. latest intended main deployed;
2. organizer Telegram health check;
3. verify token/API/webhook/bot-service status;
4. if send testing is necessary, use one known target;
5. verify app/outbox response state.

See `docs/telegram-runtime-health.md`.

## 10. VK runtime verification

Preferred order:

1. latest intended main deployed;
2. organizer VK health check;
3. verify API identity and callback/OAuth state;
4. minimal targeted sync only if needed;
5. verify join/respond/reconcile path.

See `docs/vk-runtime-health.md`.

## 11. Dependency/security work

Use read-only diagnostics first:

```bash
npm audit --json
npm ls <package>
```

- distinguish production vs development findings;
- prefer compatible patched updates;
- never use `npm audit fix --force` blindly;
- do not repair vulnerabilities from an obsolete branch/tree.

## 12. Legacy cleanup

Before deleting a legacy-looking file:

1. search imports/re-exports;
2. inspect `src/app.ts` route mounts;
3. inspect Vite/build transforms;
4. remove/replace on a focused branch;
5. let TypeScript/tests/build prove the dependency is gone.

Names are not proof of dead code.

## 13. Documentation responsibility

Do not duplicate mutable state.

- `PROJECT_STATE` — current status, production/deploy state, current queue.
- `ARCHITECTURE` — subsystem/runtime topology.
- `FEATURE_MAP` — first-hop file routing.
- `BUSINESS_RULES` — approved game/product behavior.
- `DESIGN_SYSTEM` — durable visual contract.
- this file — procedure.
- `AGENTS.md` — assistant work contract and precedence.

When one of these facts changes, update its owner in the same PR when practical.

## 14. End-of-task handoff

Report only:

- PR/merge/main SHA;
- CI result;
- what changed;
- unresolved work;
- runtime verification still needed;
- one explicit caution if applicable.

Always distinguish:

- **green main**;
- **deployed main**;
- **runtime verified**.
