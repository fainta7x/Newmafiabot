# 2LA Noire — Error Playbook

Use this file when work starts from a symptom/error rather than a known feature. Goal: identify the smallest likely failure layer before widening discovery.

Useful commands:

```bash
npm run project:find -- "<visible label / error / route / table>"
npm run project:affected -- <changed files>
npm run project:status
```

## “What is still unfinished?” gives obviously old suggestions

Treat this as a context/documentation problem before inventing new backlog.

1. Read current `docs/PROJECT_STATE.md`.
2. Read latest remote `main` and last 5–10 merged commits.
3. Compare any old/open PR with current code.
4. Remove already-implemented items from the proposed backlog.
5. Respect current user deferrals.

Known examples that are already implemented and must not be presented as missing by default:

- Player Cabinet ↔ Organizer CRM mode switching;
- staff/player music library + judge playlist + in-game music controller.

## UI opens, then closes/resets after refresh/save

Start with component state/effects, URL/deep-link state and parent refresh props. Do not start from the DB unless the server response is actually wrong.

Look for remount keys, effects depending on refreshed arrays/objects, stale closures and selection reset.

For routine CRM attendance/payment rows, prefer local row reconciliation after a successful response rather than reloading the entire evening.

## UI shows stale data after successful mutation

Trace:

`mutation -> server response -> client local reconciliation/invalidation -> render`

Confirm the server returned the new state before changing React state logic.

## “Оплачено” does nothing / payment returns financial_transactions UNIQUE constraint

This is a known high-risk symptom family. Do not delete ledger rows or reset the DB.

Trace both canonical closed-evening paths:

- `src/server/services/closedEveningPaymentService.ts` (`evening_payment_adjustment`);
- `src/server/services/eveningPaymentPricingService.ts` (`evening_pricing_reconcile`).

Check the unique source identity:

`(source_type, source_id, type)`

A valid retry/reconciliation must be idempotent. Existing adjustment rows should be updated/accumulated according to service semantics, not blindly inserted again.

Then verify the UI path that triggered it (`EveningParticipantsWorkboard`, `EveningCloseoutPanel`, dedicated payment panel) and add a regression test with the conflicting adjustment already present.

Never “fix” this by:

- deleting financial history;
- resetting Turso;
- importing a checkpoint;
- weakening the unique constraint without understanding ledger identity.

## 401 / 403

Check exact route middleware and mount order first:

- `src/server/auth.ts`;
- route module;
- `src/app.ts`.

If GET works and POST/PATCH fails, do not assume the whole session is broken.

## 404 / 410 from API

1. Search exact path fragment.
2. Check router-local path.
3. Check mount prefix in `src/app.ts`.
4. Check whether client calls an old/retired API.

`POST /api/games` returning 410 is intentional. Current creation uses evening/tournament protocol flows.

## Existing game cannot save / “cannot change roster of an existing game through protocol”

First determine whether this is a real roster edit or a stale local pending-save identity conflict.

For a stale pending save:

1. keep server roster identity canonical;
2. preserve unsent gameplay/protocol details from the local pending copy;
3. rebase gameplay data **by seat** onto current server participants when safe;
4. expose protocol correction/editing instead of only retry;
5. clear pending local outbox only after successful server confirmation.

Do not globally disable roster protection and do not let stale local `player_id` / `participant_id` overwrite current server identity.

Start with `EveningGamesView`, protocol modal, pending-save helpers and current game update route. Search tests for `pending club game`, `identity recovery`, `final save reliability`.

## Wrong vote / voter becomes unavailable after misclick / Undo does not restore voting

Read `docs/BUSINESS_RULES.md` first.

Expected current behavior:

- a voter can be moved directly from one candidate to another;
- pressing the same voter again on the same candidate may remove the assignment;
- going back from a result restores an editable vote distribution;
- snapshot restore must include per-voter assignments, voting stage/round and candidate context.

First hops:

- `src/components/LiveGameEngine.tsx`;
- `src/components/LiveGameEngine/engineStateModel.ts`;
- `src/components/LiveGameEngine/votingPresentationModel.ts`;
- `src/shared/tournamentVoting.ts`.

Never weaken an approved voting rule just to satisfy a stale test.

## Wrong day speaker / same player starts consecutive circles

Current rule uses the **actual previous starter**, not nominal round number.

Start with:

- `src/components/LiveGameEngine/daySpeechModel.ts`;
- `dayStarterSlot` in engine snapshot/state;
- transition from night to day and actual first available speaker normalization.

Dead/absent seats must be skipped and rotation must wrap 10 -> 1.

## “+30с за 2 фола” behaves incorrectly

Read `BUSINESS_RULES` and start with:

- `src/components/LiveGameEngine/speechExtensionModel.ts`;
- discipline state in `src/lib/gameDiscipline.ts`;
- timer updates in `LiveGameEngine.tsx`.

Check context eligibility, 0/1 starting foul restriction, 1->3 queued third-foul penalty and both `timerMax` + `timeLeft` extension.

## Tournament result / nomination / score is wrong

Trace:

`saved protocol -> calculation/service -> override/award logic -> publication/UI`

Compare source data before patching only the final displayed number.

## Player/data/avatar disappeared or old data returned

Treat this as a data-safety incident until disproven.

Do not assume `DATABASE_PATH` is production DB.

Check:

1. `src/db/index.ts` backend selection;
2. `PROJECT_STATE` / `project:status` production contract;
3. Turso pair configured together;
4. runtime/startup behavior;
5. only then local fallback/checkpoint/avatar storage.

Never restore an old checkpoint over non-empty runtime DB just to make data reappear.

## Deploy happened but app looks old / differs from green main

Check deployment identity before reopening code:

1. current remote `main` SHA;
2. intended release CI;
3. Amvera deployment state/logs;
4. `/api/health`;
5. `/api/health/runtime`;
6. targeted behavior or recent data marker.

Green main != deployed main != runtime verified.

## Deploy appears to lose data

Before any restore:

1. determine selected DB backend from `src/db/index.ts`;
2. confirm Turso pair vs local fallback;
3. check recent live-data markers;
4. inspect startup logs for bootstrap behavior;
5. stop before destructive recovery unless target DB and recovery source are proven.

## Telegram response changes but game choices do not

Treat coarse RSVP and exact game-slot plan as separate state.

Expected behavior:

- going -> all slots selected;
- late/thinking -> no invented exact slot plan;
- declined -> slots cleared;
- manual exact game selection persists through canonical slot-save route.

Check HTTP method/route contract as well as server synchronization. A client POST to a PUT-only canonical save route can look like “nothing happens”.

## Old Telegram evening message turns into only “registration closed”

Do not accept destructive message replacement as archive behavior.

Trace announcement finalization/edit path through:

- `botAnnouncementRoutes.ts`;
- `botTelegramRoutes.ts`;
- Telegram sync/outbox service;
- Python bot edit/send path.

Closed evening history should remain useful in chat.

## Telegram announcement did not arrive

Separate stages:

1. announcement persisted/queued;
2. web outbox/REST bridge attempted delivery;
3. Python bot processed it;
4. Telegram token/webhook/API is live;
5. target can be messaged.

Use `docs/telegram-runtime-health.md`. Do not use club-wide spam as generic diagnostic.

## VK integration fails

Separate config, OAuth/callback, persisted state, live API permissions and requested action. Use `docs/vk-runtime-health.md`.

## Speech recording uploads but does not play later

Check server persistence/readback and browser/local fallback separately. Start with `playerSpeechRecordingRoutes.ts`.

## Token balance / wallet is wrong

Trace ledger entries before editing displayed balance.

First hops:

- `tokenLedgerService.ts`;
- `playerEconomyRoutes.ts`;
- `playerTokensRoutes.ts`;
- `PlayerWalletHub.tsx`.

## Payment provider/button says unavailable

External online acquiring/SBP is intentionally disabled until provider decision. Manual accounting/history is separate functionality.

## Mobile layout breaks in Telegram / keyboard / reduced height

Start with affected screen and viewport/safe-area ownership. For keyboard-specific issues inspect `useMobileKeyboardViewport.ts`.

For Live Game, reproduce with existing Telegram-like browser evidence before changing global geometry.

## TypeScript failure

Use first compiler error, not cascade. Fix source typing rather than disabling checks.

## Vitest failure

1. Read exact assertion/stack.
2. Run that file/test.
3. Determine deterministic regression vs state/timing leak.
4. Fix cause.
5. Run affected tests.
6. Use full CI when repair batch is coherent.

## Playwright failure

1. Inspect exact browser/server failure.
2. Reproduce smallest relevant state.
3. Distinguish expectation drift from UI/product regression.
4. Fix focused cause.
5. After green, inspect screenshots visually.

## Full CI cancelled repeatedly

Check for commits landing while the same PR workflow runs. Stop parallel writers, finish coherent repair, then run final CI once the head is stable.

## Production build fails after tests pass

Inspect Vite/esbuild import/export/static-asset/environment boundaries. Test success does not replace production build verification.

## Dependency/security warning

Use current lockfile/tree. Confirm package is actually present. Never use `npm audit fix --force` blindly.

## Unknown symptom

1. Search exact visible text/error.
2. Read top 3–8 hits.
3. Identify layer: UI, API/auth, service/rule, persistence, integration/runtime or deploy.
4. Reproduce smallest focused test/request.
5. Use `project:affected` after edits.
6. Use full CI only when change is ready.
