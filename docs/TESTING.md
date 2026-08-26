# Test groups and economical verification

The full suites remain the release gate. Focused groups are an iteration aid and never replace GitHub CI.

## Stable groups

Vitest groups are resolved by `src/scripts/runTestGroup.ts` from test filenames. A test may belong to more than one group when it protects multiple boundaries.

- `smoke` — bot health, organizer routing, player cabinet navigation, Live Game setup startup.
- `crm` — organizer/CRM/evening/participant/admin-player flows.
- `live-game` — Live Game, voting, speeches, night actions and game FSM behavior.
- `telegram` — bot, Telegram and announcement integration tests.
- `vk` — VK integration tests.
- `visual` — mobile/layout/geometry/shell/presentation model tests.
- `regression` — reliability, archive, recovery, legacy, restore and closeout bug guards.

Tests that do not match a focused group remain in the normal `npm test` release suite. No tests are deleted or weakened by this classification.

## Commands

- Small coherent change: `npm run project:verify:fast`.
- One feature/test file: `npm run project:verify:feature -- <vitest file-or-name filter>`.
- CRM: `npm run test:crm`.
- Live Game: `npm run test:live-game`.
- Telegram: `npm run test:telegram`.
- VK: `npm run test:vk`.
- Browser smoke only: `npm run test:e2e:smoke`.
- Full local release verification: `npm run project:verify:release`.
- Authoritative merge gate: GitHub CI.

## Playwright classification

- `smoke`: player shell + end-to-end Live Game path.
- `crm`: `crm-*.spec.mjs` organizer surfaces.
- `live-game`: `live-game*.spec.mjs`, including Telegram viewport behavior.
- `visual`: all Playwright specs that assert mobile geometry or screenshots; keep screenshot evidence focused on visual assertions/failures.
- `regression`: scenario specs added for a previously fixed interaction remain in the full suite even if they are not in smoke.

Python bot verification remains syntax compilation in CI plus the Telegram-focused Node/Vitest integration tests; production webhook/token health is runtime verification, not a repository unit test.
