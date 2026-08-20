# 2LA Noire — Error Playbook

Use this file when work starts from a symptom/error rather than a known feature. Goal: identify the smallest likely failure layer before widening discovery.

Useful commands:

```bash
npm run project:find -- "<visible label / error / route / table>"
npm run project:affected -- <changed files>
npm run project:status
```

## UI opens, then closes/resets after refresh/save

Start with component state/effects, URL/deep-link state and parent refresh props. Do not start from the DB unless the server response is actually wrong.

Look for remount keys, effects depending on refreshed arrays/objects, stale closures and selection reset.

## UI shows stale data after successful mutation

Trace:

`mutation -> server response -> client refresh/invalidation -> render`

Confirm the server returned the new state before changing React state logic.

## 401 / 403

Check the exact route middleware and mount order first:

- `src/server/auth.ts`;
- route module;
- `src/app.ts`.

If GET works and POST/PATCH fails, do not assume the whole session is broken.

## 404 / 410 from API

1. Search exact path fragment.
2. Check router-local path.
3. Check mount prefix in `src/app.ts`.
4. Check whether the client calls an old/retired API.

`POST /api/games` returning 410 is intentional. Current creation uses evening/tournament protocol flows.

## Wrong vote / foul / removal / PPK / game outcome

Read `docs/BUSINESS_RULES.md` first.

Then trace Live Game state transition and persisted protocol, not only UI labels.

First hops:

- `src/components/LiveGameEngine.tsx`;
- `src/components/LiveGameEngine/`;
- `src/shared/tournamentVoting.ts` for voting outcomes;
- exact persisted protocol route/service.

Never weaken an approved rule just to satisfy a stale test.

## Tournament result / nomination / score is wrong

Trace:

`saved protocol -> calculation/service -> override/award logic -> publication/UI`

Compare source data before patching only the final displayed number.

## Player/data/avatar disappeared or old data returned

Treat this as a data-safety incident until disproven.

**Do not start by assuming `DATABASE_PATH` is the production database.**

Check in this order:

1. `src/db/index.ts` backend selection.
2. Expected production contract in `docs/PROJECT_STATE.md` / `npm run project:status`.
3. Whether `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are configured together at runtime.
4. If Turso is active, inspect Turso/runtime behavior and startup logs; local `/tmp` is only fallback.
5. Only when Turso is not active, inspect local `DATABASE_PATH` and filesystem persistence.
6. Inspect startup/bootstrap logs and checkpoint metadata only after identifying the active backend.
7. For avatar-specific issues also inspect player avatar storage/manifest/route behavior.

Never restore an old repository checkpoint over a non-empty runtime DB just to make data reappear.

## Deploy happened but app looks old / differs from green main

Check deployment identity before reopening code:

1. current remote `main` SHA;
2. intended release gate/CI;
3. Render manual deployment state;
4. deployed service health/load;
5. only then investigate application code.

`autoDeployTrigger: off`, so green main does not imply deployed main.

## Deploy appears to lose data

Before any restore:

1. determine selected DB backend from `src/db/index.ts`;
2. confirm Turso pair vs local fallback;
3. check recent live-data markers;
4. inspect startup logs for empty-DB bootstrap messages;
5. stop before destructive recovery unless the target DB and recovery source are proven.

A repository checkpoint is bootstrap/recovery only, not normal production synchronization.

## Telegram announcement did not arrive

Separate stages:

1. announcement persisted/queued;
2. web outbox/REST bridge attempted delivery;
3. Python bot received/processed it;
4. Telegram token/webhook/API is live;
5. target user can be messaged.

Use `docs/telegram-runtime-health.md`. Do not use club-wide spam as a generic diagnostic.

## VK integration fails

Separate:

1. app config;
2. OAuth/callback state;
3. persisted integration state;
4. live group/token permission;
5. requested action.

Use `docs/vk-runtime-health.md`.

## Speech recording uploads but does not play later

Check server persistence/readback and browser/local fallback separately. Start with `playerSpeechRecordingRoutes.ts`, then find UI callers with `project:find`.

## Token balance / wallet is wrong

Trace ledger entries before editing displayed balance.

First hops:

- `src/server/services/tokenLedgerService.ts`;
- `playerEconomyRoutes.ts`;
- `playerTokensRoutes.ts`;
- `PlayerWalletHub.tsx`.

## Payment provider/button says unavailable

Check product state first. External online acquiring/SBP is intentionally disabled until an explicit provider decision. Manual accounting/history is separate real functionality.

## Mobile layout breaks in Telegram / keyboard / reduced height

Start with the affected screen and stable viewport/safe-area ownership. For keyboard-specific issues inspect `useMobileKeyboardViewport.ts`.

For Live Game, reproduce with the existing Telegram-like Playwright evidence before changing global geometry.

## TypeScript failure

Use the first compiler error, not the cascade. Fix source typing rather than adding broad `any` or disabling typecheck.

## Vitest failure

1. Read the exact assertion/stack.
2. Run that file/test once.
3. Determine deterministic regression vs timing/state leak.
4. Fix cause.
5. Run affected tests.
6. Use full CI only when the repair batch is coherent.

## Playwright failure

1. Inspect exact browser/server failure.
2. Reproduce the smallest relevant state.
3. Distinguish test expectation drift from real UI/product regression.
4. Fix with a focused assertion/scenario first.
5. After green, inspect screenshots visually; green execution alone is not visual acceptance.

## Full CI cancelled repeatedly

Check whether commits are landing while the same PR workflow runs.

If yes:

1. stop parallel writers;
2. finish the repair coherently;
3. avoid triggering heavy CI for every half-fix;
4. run final CI once the head is stable.

## Production build fails after tests pass

Inspect Vite/esbuild import/export/static-asset/environment boundaries. `npm test` success does not replace production build verification.

## Dependency/security warning

Use the current lockfile/tree. Confirm the vulnerable package is actually present. Never use `npm audit fix --force` blindly.

## Unknown symptom

1. Search exact visible text/error.
2. Read top 3–8 hits.
3. Identify layer: UI, API/auth, service/rule, persistence, integration/runtime or deploy.
4. Reproduce with the smallest focused test/request.
5. Use `project:affected` after edits.
6. Use full CI only when the change is ready.
