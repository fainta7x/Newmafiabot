# Isolated E2E role profiles

The browser suite can open the real player cabinet and organizer CRM without Telegram, VK, Turso, or production data.

## How it works

Playwright starts the app with:

- `NODE_ENV=test`
- `PLAYWRIGHT_E2E=1`
- `E2E_TEST_MODE=1`
- an isolated SQLite file at `e2e/../temp/playwright-e2e.sqlite`

The test-only endpoint `POST /api/auth/e2e/profile` accepts `player` or `organizer`. It is available only when all three test flags above are present; production and normal development return 404.

The player fixture uses the stable id `e2e-player`, nickname `[TEST] Игрок`, ELO 1200 and 100 test tokens. The organizer fixture creates only an in-memory signed organizer session. Test writes are confined to the isolated E2E SQLite database and are discarded with the test workspace.

## Run locally

From the repository root:

```bash
npm ci
cd e2e && npm ci
cd ..
npm run test:e2e:smoke
```

The complete Playwright suite also includes `e2e/tests/role-profiles.spec.mjs`. On failure, screenshots, traces and other browser evidence are uploaded by GitHub Actions as `playwright-mobile-evidence`.

## Safety contract

- Never enable `E2E_TEST_MODE` in Amvera, Render, or another production runtime.
- Never point the E2E runner at Turso or another shared database.
- These profiles are for visual and navigation checks only; they are not real club accounts and must not be shown to players.
- A green test run proves the local role flows render; it does not prove that the deployed Amvera runtime is on the same commit.
