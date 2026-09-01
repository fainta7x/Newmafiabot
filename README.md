# 2LA Noire — Sports Mafia Club Platform

Web application, organizer CRM, Player Cabinet and Live Game judge workspace for the 2LA Noire sports-Mafia club.

## AI / developer handoff — start here

Do not reconstruct the project from old chats, historical roadmaps or old open PR descriptions.

Read in this order:

1. [`AGENTS.md`](AGENTS.md) — mandatory assistant/developer work contract.
2. [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md) — current product/release/deploy state and current queue.
3. Last 5–10 commits on remote `main`.
4. [`docs/FEATURE_MAP.md`](docs/FEATURE_MAP.md) — known feature -> first-hop files.
5. [`docs/ERROR_PLAYBOOK.md`](docs/ERROR_PLAYBOOK.md) — symptom/error -> diagnostic layer.
6. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — subsystem ownership/runtime topology when needed.
7. [`docs/BUSINESS_RULES.md`](docs/BUSINESS_RULES.md) — approved Mafia/product rules.
8. [`docs/RUNBOOK.md`](docs/RUNBOOK.md) — verification, CI, deployment, DB and recovery procedure.
9. [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) — durable visual contract.

Historical files such as dated release candidates, old roadmaps and old integration narratives are not sources of truth for current completion.

An old open PR is also not automatically backlog. Compare its intended behavior with current `main` before proposing it as unfinished work.

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

- React + TypeScript + Vite.
- Tailwind CSS.
- Express Node API.
- Database wrapper with **remote Turso as production-primary storage when both Turso credentials are configured**, and local `better-sqlite3` SQLite as fallback/development storage.
- Python Telegram bot integrated in the combined production container.
- Telegram WebApp and VK integrations.
- Vitest + mobile Playwright evidence suites.
- GitHub Actions CI + CodeQL + Gitleaks.
- **Canonical deployment: combined Docker application on Amvera** (nginx + Node + Python bot).

For exact current versions and release state, use `package.json` + `docs/PROJECT_STATE.md`.

## Product shape

Current product is one connected system:

- **Player Cabinet** under `/player/*`;
- **Organizer CRM** under `/admin/*`;
- bidirectional Player/Organizer mode switching for authorized organizers;
- evening announcements, RSVP and exact game-slot planning;
- attendance, payments, closeout and debt accounting;
- conducted Live Game and protocol correction/recovery;
- ratings/Elo, statistics, wallet/tokens/betting;
- player personal music slots, staff/judge music library and in-game music controller;
- Telegram/VK integrations.

Do not treat Player↔CRM integration or the music subsystem as “not built” without first identifying a concrete missing behavior in current code.

## Database safety

Authoritative backend selection lives in `src/db/index.ts`:

- both `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` -> remote Turso;
- neither -> local SQLite fallback;
- only one -> startup error.

A non-empty runtime database always wins over repository bootstrap/checkpoint data.

Repository checkpoint files:

- `mafia_crm.checkpoint.sqlite.gz.b64`
- `mafia_crm.checkpoint.meta.json`

They are bootstrap/recovery artifacts, not production synchronization.

Never restore/import/reset production/runtime data as part of an ordinary Git sync, bug fix or deploy. Read `AGENTS.md` + `docs/RUNBOOK.md` before DB/recovery work.

## Development

Environment:

```bash
cp .env.example .env
```

Install:

```bash
npm install
```

Run:

```bash
npm run dev
```

Fast project verification:

```bash
npm run project:verify:fast
```

Full local non-browser verification when useful:

```bash
npm run project:verify
```

GitHub CI is the authoritative ordinary merge gate. Mobile Playwright is preserved as a separate/manual browser-verification path and is run when the change actually needs browser/visual evidence.

## Main areas

- `src/components/player/` — Player Cabinet and player flows.
- `src/components/crm/` — Organizer CRM and evening/game workflow.
- `src/components/LiveGameEngine.tsx` + `src/components/LiveGameEngine/` — judge game engine/state/models.
- `src/components/JudgeGameMusicController.tsx` — conducted-game music playback control.
- `src/server/` — Express routes/services/integrations.
- `src/db/` — database wrapper, Turso adapter, schema/recovery logic.
- `src/tests/` — Vitest coverage.
- `e2e/` — isolated browser evidence/smoke tests.
- `docs/` — canonical project guidance plus historical/reference material.

Use `docs/FEATURE_MAP.md` and `docs/ARCHITECTURE.md` instead of guessing from filenames.

## Organizer auth

Player mode is for player cabinet/event/game functions. Organizer mode is protected by server authentication and canonical organizer authority. Mutating organizer APIs require the correct organizer session/permission.

## Deployment

The canonical production target is the combined Amvera Docker application. `render.yaml` is retained legacy configuration, not the current primary deploy target.

A green GitHub `main` is **not** proof that the same SHA is deployed, and a deployed SHA is not automatically runtime verified.

Deployment procedure lives in `docs/RUNBOOK.md`; current deploy/storage/release state lives in `docs/PROJECT_STATE.md`.
