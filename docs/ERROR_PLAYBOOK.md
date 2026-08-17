# 2LA Noire — Error Playbook

Use this when the task starts from a symptom rather than a known feature. Goal: identify the smallest likely failure layer before widening discovery.

Useful commands:

```bash
npm run project:find -- "<visible label / error / route / table>"
npm run project:affected -- <changed files>
```

## UI opens correctly, then closes/resets after refresh or save
Start with component effects/state synchronization, URL/deep-link state and parent refresh props. Do not start from DB unless server data is actually wrong.

Typical first hops:
- `src/components/player/PlayerEventsCalendar.tsx`
- active shell/hub component that owns the section
- exact API callback that triggers refresh

Look for: effects depending on refreshed arrays/objects, `setSelected(null)`, route normalization, stale closure, remount keys.

## UI shows stale data after successful mutation
Trace mutation -> response -> client refresh/invalidation -> rendering. Confirm server returned the new state before changing React state logic.

For organizer data start from `src/components/OrganizerCRM.tsx` / `EveningWorkspace.tsx`; for player data start from the active player hub plus the exact `/api/player/*` route.

## 401 / 403
Check exact route auth middleware and mount order first:
- `src/server/auth.ts`
- `src/server/routes/authRoutes.ts`
- route module
- `src/app.ts`

If GET works and POST/PATCH fails, do not assume session is globally broken.

## 404 from API
1. Search the exact path fragment with `project:find`.
2. Check router-local path.
3. Check mount prefix in `src/app.ts`.
4. Check whether client calls old/retired API.

`POST /api/games` returning 410 is intentional; current game creation must use evening/tournament protocol workflows.

## Wrong game vote / foul / removal / PPK behavior
Read `docs/BUSINESS_RULES.md` first. Then trace Live Game state transition and persisted protocol, not only UI labels.

First hops:
- `src/components/LiveGameEngine.tsx`
- `src/components/LiveGameEngine/`
- `src/components/game/`
- game/protocol route/service found by `project:find`

Never weaken an approved rule to satisfy an existing test; decide whether implementation or test is stale.

## Tournament result / nomination / score looks wrong
Trace: saved protocol -> calculation/service -> override/award logic -> publication/UI. Compare source data before patching final output.

Search:
```bash
npm run project:find -- "tournament award result nomination"
```

Also inspect relevant `drizzle/` migration/ensure schema when persisted fields appear missing.

## Player disappeared / old data returned / avatars rolled back
Treat as data-safety incident until disproven.

Check:
- active runtime DB path
- startup/bootstrap logs
- checkpoint version/metadata
- `src/lib/playerAvatarManifest.ts`
- `AGENTS.md` canonical DB rules
- `docs/RUNBOOK.md`

Never restore an old repository DB/checkpoint over a non-empty runtime DB just to make data reappear.

## Telegram announcement did not arrive
Separate stages:
1. announcement persisted/queued;
2. outbox/REST bridge produced delivery attempt;
3. Python bot received/processed it;
4. Telegram token/webhook/API is live;
5. target user can be messaged.

First hops: `eveningAnnouncementRoutes.ts`, `botAnnouncementRoutes.ts`, `telegramSyncOutboxService.ts`, `bot_announcement_api.py`, `bot_telegram_api.py`.

Use `docs/telegram-runtime-health.md` for safe live diagnosis. Repository CI cannot prove token/webhook/deployed SHA.

## VK integration fails
Separate:
1. app config;
2. OAuth/callback state;
3. persisted integration state;
4. live group/token permission;
5. requested action.

First hops: `integrationRoutes.ts`, `vkRuntimeHealthService.ts`, `vkJoin*`, `vkDirectIntegrationRouter.ts`.

Use `docs/vk-runtime-health.md`; do not test by public spam.

## Speech recording uploads but does not play later
Check server persistence/readback and local fallback separately. Start with `playerSpeechRecordingRoutes.ts`, then find UI callers with:

```bash
npm run project:find -- "speech recording audio"
```

## Token balance / wallet is wrong
Trace ledger entries before editing displayed balance.

First hops:
- `src/server/services/tokenLedgerService.ts`
- `playerEconomyRoutes.ts`
- `playerTokensRoutes.ts`
- `PlayerWalletHub.tsx`

Use `npm run project:affected -- src/server/services/tokenLedgerService.ts` for focused test suggestions.

## Payment button/provider says unavailable
Check product state before treating as bug. External online acquiring/SBP is intentionally disabled. Manual payment accounting/history/outstanding amount is separate functionality.

## CRM loses route/scroll after navigation
Start from organizer route parsing/return context/refresh handling in `src/components/OrganizerCRM.tsx`, then the active CRM child. Do not rewrite backend routing unless URL/API is actually wrong.

## Mobile layout breaks only when keyboard opens
Start with `src/hooks/useMobileKeyboardViewport.ts` and the affected CRM/player component. Reproduce viewport/scroll behavior before changing global layout.

## TypeScript CI failure
Use the first compiler error, not the cascade. Fix source typing rather than adding broad `any` or disabling typecheck. Check recent changed imports/request types first.

## Vitest failure
1. Read exact failing assertion/stack.
2. Run only that test/file once.
3. Determine deterministic regression vs flaky timing/state leak.
4. Fix cause; do not loop reruns until green.
5. Run affected tests, then full CI.

## Production build fails after tests pass
Inspect Vite/esbuild import/export/static asset differences, environment-only references and server bundle boundaries. `npm test` success is not enough; `npm run build` is mandatory.

## Render behaves differently from green main
Check deployment identity first. `render.yaml` has `autoDeployTrigger: off`, so green main may not be deployed. Confirm deployed SHA/config/secrets before reopening code that passed CI.

## Dependency/security warning
Use the current `package-lock.json` only. Confirm the package is actually present with current install/tree before changing versions. Never use `npm audit fix --force` blindly.

## Unknown symptom
1. Search exact user-visible text/error: `npm run project:find -- "..."`.
2. Read top 3–8 hits.
3. Identify layer: UI state, API/auth, service/rule, persistence/schema, integration/runtime, deploy.
4. Reproduce with the smallest focused test/request.
5. After edits use `npm run project:affected -- <files>`.
6. Full `npm run project:verify` + GitHub CI before merge.
