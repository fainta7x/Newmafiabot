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

`fresh green main -> focused branch -> targeted discovery -> focused checks -> coherent PR -> fast CI -> merge -> verify main`

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

When the PR is coherent and release verification is explicitly requested:

```bash
npm run project:verify
```

The ordinary PR merge gate covers the non-browser checks. Playwright is separate and must be started only when browser/release verification is required:

```bash
npm run test:e2e:smoke
```

Do not run Level C or Playwright after every small edit.

### Playwright policy

- Ordinary implementation requests must not run or wait for Playwright.
- Browser tests remain preserved and must not have their assertions weakened.
- Run `.github/workflows/playwright-manual.yml` from GitHub Actions when the user explicitly asks for browser verification, a visual/live-game change needs it, or a release gate is requested.
- Select the smallest relevant suite: `smoke`, `crm`, `live-game`, or `all`.
- Inspect the exact failed job and artifact before deciding whether a retry is appropriate.

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

## 8. Combined Amvera deployment

The Amvera target uses one application and one repository (`fainta7x/Newmafiabot`), not separate paid web and bot applications.

Before the first deploy:

1. rotate any Telegram token that has appeared in a public repository;
2. create one Docker application from this repository;
3. use a European Amvera region;
4. select a runtime with at least 1 GB RAM for the combined Node, Python and nginx processes;
5. create the free HTTPS domain before finalizing `WEBHOOK_URL` and `PLAYER_APP_URL`;
6. copy existing secret values from the previous runtime rather than generating a second integration identity.

Required runtime variables:

- `NODE_ENV=production`;
- `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` together;
- `DATABASE_BOOTSTRAP_FROM_CHECKPOINT=true` (existing non-empty Turso still wins);
- `SEED_DEMO_DATA=false`;
- `ORGANIZER_PASSWORD`, `JWT_SECRET`, `BOT_API_SECRET`;
- rotated `TELEGRAM_BOT_TOKEN`;
- `USE_WEBHOOK=true`;
- `WEBHOOK_URL=https://<amvera-domain>`;
- `BOT_API_BASE_URL=https://<amvera-domain>`;
- `PLAYER_APP_URL=https://<amvera-domain>`;
- `BOT_SERVICE_URL=http://127.0.0.1:8081`;
- current Telegram destination/admin values and current VK/Gemini secrets where configured.

Do not configure `DATABASE_PATH` as production-primary when the Turso pair is present. Do not import a repository checkpoint during an ordinary migration.

After deploy:

1. verify the application deployment log shows `web`, `bot` and `nginx` in running state;
2. verify public `/api/health` returns HTTP 200 with `status=ok`;
3. verify public `/api/health/runtime` returns HTTP 200 with all three checks set to `ok`;
4. verify organizer Telegram health reports the bot service at the internal URL and compares the webhook with public `WEBHOOK_URL`;
5. verify the Telegram webhook points to `<amvera-domain>/webhook`;
6. open the Mini App from Telegram and confirm player identity/current evening data;
7. verify one organizer-only targeted Telegram action, not a mass announcement;
8. verify recent Turso-backed data markers before retiring the Render services.

### Amvera restart and email alerts

In the application's Kubernetes probes form, use a shallow startup/liveness probe only:

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

Amvera injects this native Kubernetes YAML into the deployment. An invalid probe can prevent the project from starting, so paste it exactly and verify the next deployment log. Do not point liveness/readiness at `/api/health/runtime`: external Turso or Telegram degradation must not take the whole web application out of service.

In the same application Settings, enable failure notifications to the account email and set a reasonable daily maximum/minimum interval. Amvera sends these only after its own healthy/error timing conditions; they are a backup to the external Telegram monitor, not a replacement.

### Independent GitHub → Telegram alerts

1. create a separate monitoring bot in BotFather and press **Start** in that bot from every recipient account;
2. GitHub repository → Settings → Secrets and variables → Actions → Secrets → add `TELEGRAM_MONITOR_BOT_TOKEN`;
3. add `TELEGRAM_MONITOR_CHAT_IDS` with trusted numeric IDs separated by commas; reuse intended IDs from the current production `ADMIN_IDS` value rather than printing them in logs;
4. only if the public domain changes, add Actions variable `RUNTIME_MONITOR_BASE_URL` with the new HTTPS origin;
5. GitHub → Actions → Production runtime monitor → Run workflow → enable the test-notification input;
6. confirm all recipients receive the test and the workflow is green;
7. leave the five-minute schedule enabled. It creates one public GitHub incident issue per outage and closes it automatically on recovery.

The monitor uses a standard GitHub-hosted runner and is independent of the Amvera container. The repository is public, so this standard-runner usage is free under the current GitHub Actions billing model. Scheduled workflows can be delayed by GitHub and can be disabled after long repository inactivity; Amvera email remains the secondary channel.

See `docs/telegram-runtime-health.md` for endpoint contracts and alert transition behavior.

Rollback: keep the Render configuration intact until all checks pass. If the new runtime fails, restore the old Telegram webhook URL and stop the Amvera container; never restore or replace Turso data as part of hosting rollback.

## 9. Legacy Render deployment

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

## 10. Telegram runtime verification

Preferred order:

1. latest intended main deployed;
2. public deep runtime health check;
3. organizer Telegram health check;
4. verify token/API/webhook/bot-service status;
5. if send testing is necessary, use one known target;
6. verify app/outbox response state.

See `docs/telegram-runtime-health.md`.

## 11. VK runtime verification

Preferred order:

1. latest intended main deployed;
2. organizer VK health check;
3. verify API identity and callback/OAuth state;
4. minimal targeted sync only if needed;
5. verify join/respond/reconcile path.

See `docs/vk-runtime-health.md`.

## 12. Dependency/security work

Use read-only diagnostics first:

```bash
npm audit --json
npm ls <package>
```

- distinguish production vs development findings;
- prefer compatible patched updates;
- never use `npm audit fix --force` blindly;
- do not repair vulnerabilities from an obsolete branch/tree.

## 13. Legacy cleanup

Before deleting a legacy-looking file:

1. search imports/re-exports;
2. inspect `src/app.ts` route mounts;
3. inspect Vite/build transforms;
4. remove/replace on a focused branch;
5. let TypeScript/tests/build prove the dependency is gone.

Names are not proof of dead code.

## 14. Documentation responsibility

Do not duplicate mutable state.

- `PROJECT_STATE` — current status, production/deploy state, current queue.
- `ARCHITECTURE` — subsystem/runtime topology.
- `FEATURE_MAP` — first-hop file routing.
- `BUSINESS_RULES` — approved game/product behavior.
- `DESIGN_SYSTEM` — durable visual contract.
- this file — procedure.
- `AGENTS.md` — assistant work contract and precedence.

When one of these facts changes, update its owner in the same PR when practical.

## 15. End-of-task handoff

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
