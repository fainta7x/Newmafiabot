# 2LA Noire — Sports Mafia Club Platform

Web application, organizer CRM and Live Game judge workspace for the 2LA Noire sports-Mafia club.

## AI / developer handoff — start here

Do not reconstruct the project from old chats or historical roadmaps.

Read in this order:

1. [`AGENTS.md`](AGENTS.md) — mandatory assistant/developer work contract.
2. [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md) — current project/release/deploy state and next queue.
3. Last 5–10 commits on remote `main`.
4. [`docs/FEATURE_MAP.md`](docs/FEATURE_MAP.md) — known feature -> first-hop files.
5. [`docs/ERROR_PLAYBOOK.md`](docs/ERROR_PLAYBOOK.md) — symptom/error -> diagnostic layer.
6. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — subsystem ownership and runtime topology when needed.
7. [`docs/BUSINESS_RULES.md`](docs/BUSINESS_RULES.md) — approved Mafia/product rules.
8. [`docs/RUNBOOK.md`](docs/RUNBOOK.md) — verification, CI, deployment, DB and recovery procedure.
9. [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) — durable visual contract.

Historical files such as `docs/live-club-roadmap.md`, old integration narratives and dated release notes are not sources of truth for current completion.

Read-only local context:

```bash
npm run project:status
npm run project:status -- --json
```

The CI handoff gate uses:

```bash
npm run project:status -- --check --json
```

## Current stack

- React 19 + TypeScript 6 + Vite 8.
- Tailwind CSS 4.
- Express 5 Node API.
- Database wrapper with **remote Turso as the current production-primary storage when Turso credentials are configured**, and local `better-sqlite3` SQLite as fallback/development storage.
- Python Telegram bot integrated through REST/API paths.
- Telegram WebApp and VK integrations.
- Vitest + mobile Playwright.
- GitHub Actions CI + CodeQL + Gitleaks.
- Manual Render deployment.

For exact current versions and release state, use `package.json` + `docs/PROJECT_STATE.md`, not this overview.

## Database safety

The authoritative backend selection is implemented in `src/db/index.ts`:

- both `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` -> remote Turso;
- neither -> local SQLite fallback;
- only one -> startup error.

A non-empty runtime database always wins over repository bootstrap/checkpoint data.

Repository checkpoint files:

- `mafia_crm.checkpoint.sqlite.gz.b64`
- `mafia_crm.checkpoint.meta.json`

They are bootstrap/recovery artifacts, not production synchronization.

Never restore/import/reset a production/runtime database as part of an ordinary Git sync or Render deploy. Read `AGENTS.md` + `docs/RUNBOOK.md` before DB/recovery work.

## Development

Environment:

```bash
cp .env.example .env
```

Install:

```bash
npm install
```

Run development server:

```bash
npm run dev
```

Focused/fast project verification:

```bash
npm run project:verify:fast
```

Complete web verification before merge:

```bash
npm run project:verify
```

GitHub CI remains the authoritative final gate and additionally runs Python syntax and mobile Playwright coverage.

## Main areas

- `src/components/player/` — Player Cabinet and player flows.
- `src/components/crm/` — organizer CRM and Live Game visual/runtime bridges.
- `src/components/LiveGameEngine/` — judge game engine components/models.
- `src/server/` — Express routes/services/integrations.
- `src/db/` — database wrapper, Turso adapter, schema/recovery logic.
- `src/tests/` — Vitest coverage.
- `e2e/` — isolated browser evidence/smoke tests.
- `docs/` — canonical project guidance plus historical/reference material.

Use `docs/FEATURE_MAP.md` and `docs/ARCHITECTURE.md` instead of guessing from filenames.

## Organizer auth

Player mode is for player cabinet/event/game functions. Organizer mode is protected by server authentication and permissions; mutating organizer APIs require the correct organizer session/authority.

## Deployment

`render.yaml` defines the Render service and manual deployment model. A green GitHub `main` is **not** proof that the same SHA is deployed.

Deployment sequence lives only in `docs/RUNBOOK.md`; current deploy/storage state lives only in `docs/PROJECT_STATE.md`.
