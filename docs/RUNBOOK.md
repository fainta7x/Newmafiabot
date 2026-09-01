# 2LA Noire — Work / Verification / Deploy Runbook

This file defines **procedure only**. Current feature/deploy facts belong in `docs/PROJECT_STATE.md`; architecture ownership belongs in `docs/ARCHITECTURE.md`.

## 1. Start of work

1. Fetch latest remote `main`.
2. Read `AGENTS.md`.
3. Read `docs/PROJECT_STATE.md`.
4. Review the last 5–10 merged `main` commits.
5. Use `FEATURE_MAP` or `ERROR_PLAYBOOK` for targeted discovery.
6. Read `BUSINESS_RULES` for game/product behavior.
7. Run `npm run project:status` when a local checkout exists.

Do not re-audit the whole repository by default.

### Planning / backlog hygiene

When the user asks what remains or what to build next:

1. start from current `PROJECT_STATE` and latest `main`;
2. treat open PRs and old roadmap/chat items as **candidates only**;
3. verify that the behavior is actually missing before presenting it as backlog;
4. remove/reclassify items already implemented;
5. respect explicit user deferrals even when an old PR says “next pass”.

A stale open PR is not a product requirement. In particular, old stacked UI PRs and historical CRM roadmap PRs may remain visible after their functionality has been superseded.

## 2. Hard PR budget

For one user message/request:

- maximum **3 PRs**;
- after PR #3, stop repository writes and CI polling;
- provide a short handoff and wait for the user's next message;
- prefer 1 coherent PR where possible;
- never bypass the limit with parallel branches.

## 3. Default Git workflow

Preferred sequence:

`fresh green main -> focused branch -> targeted discovery -> focused checks -> coherent PR -> required CI -> merge -> verify main`

Single-writer rule:

- one active writer per branch;
- if ChatGPT/AI Studio/user moves the branch unexpectedly, stop and reconcile before continuing;
- never overwrite newer valid work with an older local/chat state.

## 4. Verification levels

### Level A — focused

Use the smallest relevant test while iterating.

Examples:

```bash
npx vitest run src/tests/closedEveningPaymentCompatibility.test.ts
npx vitest run src/tests/example.test.ts -t "specific behavior"
npm run project:affected -- <changed files>
```

### Level B — cheap project safety

After a coherent batch:

```bash
npm run project:verify:fast
```

This is release audit + TypeScript + ESLint without full Vitest/build/Playwright.

### Level C — release verification

When the change is coherent and a full local release gate is useful:

```bash
npm run project:verify
```

The ordinary PR merge gate is authoritative for non-browser checks.

### Playwright policy

Playwright is separate from the ordinary merge gate.

Run `.github/workflows/playwright-manual.yml` only when:

- the user explicitly asks for browser verification;
- a visual/live-game/browser-specific change needs it;
- a release verification request requires browser evidence.

Use the smallest relevant suite: `smoke`, `crm`, `live-game`, or `all`.

Green Playwright execution is not visual approval; inspect screenshots for clipping, overlap, hierarchy, player identity and mobile safe-area problems.

## 5. CI failure handling

When a required job fails:

1. inspect the exact failed job/log;
2. identify the smallest failing layer;
3. fix/test that layer first;
4. batch related repair commits;
5. trigger full CI again only when the head is coherent.

Do not repeatedly rerun red jobs hoping they become green.

## 6. Database safety

### Backend selection

`src/db/index.ts` is authoritative.

- Both `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` -> remote Turso.
- Neither -> local SQLite fallback.
- Only one -> startup must fail.

Never infer production persistence from `DATABASE_PATH` or `render.yaml` alone.

### Runtime precedence

A non-empty runtime database always wins over repository checkpoint data.

Never overwrite, reset, clean, restore or replace an existing production/runtime DB during ordinary Git/deploy/bug-fix work.

### Repository checkpoint

Canonical recovery/bootstrap files:

- `mafia_crm.checkpoint.sqlite.gz.b64`
- `mafia_crm.checkpoint.meta.json`

Use guarded commands only:

```bash
npm run checkpoint:git-export
npm run checkpoint:git-import
```

The checkpoint is not production synchronization.

Before destructive data work, establish target DB, reason, backup/recovery path and explicit user approval.

## 7. Financial/payment incident procedure

Payment bugs are ledger/data-safety work.

If the UI says “nothing happened” or SQLite/Turso reports a unique constraint on `financial_transactions`:

1. inspect the server response/error before changing optimistic UI;
2. trace the exact payment/reconciliation service;
3. inspect `source_type`, `source_id`, `type` and the unique-key contract;
4. make retries idempotent with the intended UPSERT/accumulation semantics;
5. add a regression test with an already-existing ledger adjustment;
6. **never delete ledger rows, reset Turso or import a checkpoint to clear the conflict**.

Canonical closed-evening paths are documented in `ARCHITECTURE` / `FEATURE_MAP`, especially:

- `closedEveningPaymentService.ts`;
- `eveningPaymentPricingService.ts`.

After a payment fix, verify both the dedicated payments surface and the ordinary participant/workboard action path if both can trigger the same server behavior.

## 8. Pending game-save recovery procedure

If a conducted game exists but final save/retry reports a roster conflict:

1. do not disable server roster-protection globally;
2. compare current server roster with stale local pending-save identities;
3. preserve server `player_id` / `participant_id` as canonical;
4. rebase unsent gameplay/protocol detail by seat when safe;
5. keep the pending game editable in correction mode;
6. clear local outbox state only after successful server confirmation.

Do not mutate production game identity by guessing from an old browser payload.

## 9. Combined Amvera deployment

Canonical target: one Docker application from `fainta7x/Newmafiabot` `main` running nginx + Node + Python bot.

Required runtime contract includes:

- `NODE_ENV=production`;
- `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` together;
- `DATABASE_BOOTSTRAP_FROM_CHECKPOINT=true` with existing non-empty Turso still winning;
- `SEED_DEMO_DATA=false`;
- `ORGANIZER_PASSWORD`, `JWT_SECRET`, `BOT_API_SECRET`;
- `TELEGRAM_BOT_TOKEN`;
- `USE_WEBHOOK=true`;
- `WEBHOOK_URL=https://<amvera-domain>`;
- `BOT_API_BASE_URL=https://<amvera-domain>`;
- `PLAYER_APP_URL=https://<amvera-domain>`;
- `BOT_SERVICE_URL=http://127.0.0.1:8081`;
- configured Telegram destination/admin and VK/Gemini secrets where used.

Do not configure local SQLite as production-primary while the Turso pair is present. Do not import a checkpoint during an ordinary deploy.

### After every meaningful deploy

1. identify the exact intended `main` SHA;
2. verify Amvera deployment logs show web/bot/nginx running;
3. verify `/api/health` -> HTTP 200 / `status=ok`;
4. verify `/api/health/runtime` -> HTTP 200 and deep dependencies healthy;
5. verify Telegram webhook points to `<amvera-domain>/webhook` when Telegram changed or deployment identity is uncertain;
6. open the Mini App and confirm current player/evening data when relevant;
7. verify one or two recent Turso-backed data markers;
8. run a **targeted behavior check for the bug just fixed** (for example payment mark/unmark after a payment release), not a generic destructive smoke test.

Only after these checks may a release be called **runtime verified**.

### Amvera probes

Use shallow startup/liveness only:

```yaml
startupProbe:
  httpGet:
    path: /api/health
    port: 8080
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 30
livenessProbe:
  httpGet:
    path: /api/health
    port: 8080
  periodSeconds: 30
  timeoutSeconds: 5
  failureThreshold: 3
```

Do not point Kubernetes liveness/readiness at `/api/health/runtime`; external Turso/Telegram degradation must remain observable without forcing the web app into a restart loop.

Enable Amvera failure email as a secondary alert channel.

### Independent GitHub → Telegram monitor

Actions secrets:

- `TELEGRAM_MONITOR_BOT_TOKEN`;
- `TELEGRAM_MONITOR_CHAT_IDS`.

Optional variable if the public origin changes:

- `RUNTIME_MONITOR_BASE_URL`.

Use the manual test-notification input after configuration and leave the scheduled monitor enabled. See `docs/telegram-runtime-health.md`.

## 10. Telegram runtime verification

Preferred order:

1. intended `main` deployed;
2. public deep runtime health;
3. organizer Telegram health;
4. token/API/webhook/internal bot-service state;
5. one known target if send testing is necessary;
6. verify app/outbox/response state.

Do not use a club-wide announcement as a smoke test.

When testing RSVP behavior, verify coarse response and exact game-slot plan separately.

When closing an evening, verify the old Telegram announcement/history remains useful and is not overwritten by only “registration closed”.

## 11. VK runtime verification

Preferred order:

1. intended `main` deployed;
2. organizer VK health;
3. API identity/callback/OAuth state;
4. minimal targeted sync if needed;
5. join/respond/reconcile path.

See `docs/vk-runtime-health.md`.

## 12. Legacy Render

Render configuration remains historical/fallback. It is not the canonical combined runtime.

If rollback to legacy hosting is ever required, keep Turso unchanged; hosting rollback is not data rollback.

## 13. Dependency/security work

Use read-only diagnostics first:

```bash
npm audit --json
npm ls <package>
```

- distinguish production vs development findings;
- prefer compatible patched updates;
- never use `npm audit fix --force` blindly;
- do not merge Dependabot merely because it is open; run project CI and inspect breaking-risk packages.

## 14. Legacy/stale PR cleanup

Before using an old open PR as work:

1. read its original base/head intent;
2. compare the intended behavior with current `main`;
3. if current main already implements/supersedes it, mark it historical rather than adding it to backlog;
4. only revive/rebase it when a concrete missing behavior remains.

Before deleting legacy-looking source files, also confirm imports, route mounts and build transforms. Names are not proof of dead code.

## 15. Documentation responsibility

- `PROJECT_STATE` — current product/deploy state and queue.
- `ARCHITECTURE` — subsystem/runtime ownership.
- `FEATURE_MAP` — first-hop routing.
- `BUSINESS_RULES` — approved game/product behavior.
- `ERROR_PLAYBOOK` — symptom-first diagnostics.
- `DESIGN_SYSTEM` — durable visual contract.
- this file — procedure.
- `AGENTS.md` — assistant work contract/precedence.

When a planned feature is completed, update/remove its stale backlog state. Do not leave old instructions that tell future sessions to rebuild an already-existing subsystem.

## 16. End-of-task handoff

Report:

- PR/merge/main SHA;
- CI result;
- what changed;
- unresolved work;
- runtime verification still needed;
- one caution if applicable.

Always distinguish:

- **green main**;
- **deployed main**;
- **runtime verified**.
