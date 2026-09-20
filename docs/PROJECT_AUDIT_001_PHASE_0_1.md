# PROJECT-AUDIT-001 — Phase 0/1 findings

Status: in progress  
Scope: source-of-truth reset + production/runtime/persistence audit

## Confirmed production topology

Canonical Amvera runtime:

`public HTTPS -> nginx:8080 -> Node web/API:3000`

`public /webhook and /crm/* -> nginx:8080 -> Python bot service:8081`

Supervisor also runs the SQLite backup worker.

## Canonical product database

The current production start contract is explicit in `deploy/start-web.sh`:

- `DATABASE_PATH=/data/mafia_crm.sqlite`;
- `DATABASE_BOOTSTRAP_FROM_CHECKPOINT=true`;
- `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are unset before Node starts.

Therefore the canonical production product DB is:

`/data/mafia_crm.sqlite`

The generic Turso adapter still exists in source, but it is not selected by the canonical Amvera start path. It is legacy/recovery code until Phase 7 proves it can be removed.

## Legacy bot-local database

`deploy/start-bot.sh` still maps Python `mafia_crm.db` to:

`/data/mafia_crm.db`

This is a separate legacy database used by older Python bot code. It is **not** the product source of truth.

Audit risk:

- `database.py` still contains broad legacy business tables/operations;
- this creates a dual-database maintenance surface even though the WebApp product DB is canonical;
- Phase 2 must map which Python paths still genuinely need bot-local persistence and which should be API-backed or removed.

No production-data migration is performed in Phase 0/1.

## Backup findings

Canonical product backups are owned by `deploy/backup-sqlite.cjs`:

- source: `/data/mafia_crm.sqlite`;
- destination: `/data/backups/mafia_crm-<timestamp>.sqlite`;
- default interval: 6 hours;
- default retention: 30 files;
- first run: approximately 2 minutes after worker start.

The worker uses SQLite's backup API, which produces a standalone snapshot even when the source DB is in WAL mode.

### Defect found

The Python bot still scheduled `daily_backup_task()`, but that task targeted the legacy `mafia_crm.db` path and called a non-existent `create_backup_file()` API. It was therefore not a valid product backup path and could fail when first executed.

Phase 0/1 disables starting that misleading legacy backup task. The function itself remains legacy code pending Phase 7 cleanup.

### Backup hardening added

- every newly-created product backup is opened independently and must pass `PRAGMA integrity_check` before it is treated as successful;
- retention cleanup runs only after verification;
- `npm run backup:verify` performs an isolated restore drill by copying a selected backup to a temporary directory, opening only the copy, running `integrity_check`, checking core tables and reporting row counts;
- the restore drill never replaces or writes the live product DB.

## Telegram rolling-deploy finding

The production webhook is a shared external resource, not replica-local state.

A previous deployment race allowed an old replica to delete the webhook after a new replica had already installed it. That was fixed before this audit in PR #329:

- startup sets the canonical webhook without pre-deleting it;
- shutdown does not delete the production webhook.

Phase 1 treats this behavior as part of the runtime contract.

## Documentation drift found

Before this audit, several canonical docs still described Turso as production-primary even though `deploy/start-web.sh` had already switched production to persistent SQLite.

Affected canonical docs included:

- `docs/ARCHITECTURE.md`;
- `docs/PROJECT_STATE.md`;
- `docs/RUNBOOK.md`;
- `docs/ERROR_PLAYBOOK.md`;
- `docs/telegram-runtime-health.md`.

This PR updates those statements to match current main/runtime.

## Current source-of-truth matrix

| Concern | Canonical owner | Status |
| --- | --- | --- |
| Product data | `/data/mafia_crm.sqlite` | canonical |
| Product DB bootstrap | repository checkpoint only when DB missing/empty | recovery-only |
| Product DB backups | `/data/backups/*.sqlite` via Node backup worker | canonical backup |
| Amvera platform snapshots | Amvera `/data` backups | secondary safety layer |
| Python bot local DB | `/data/mafia_crm.db` | legacy, Phase 2 audit required |
| Telegram publication identity | product DB publication tables/outboxes | canonical |
| Telegram webhook | Bot API URL configured by Python startup | shared runtime resource |
| VK publication identity | product DB VK integration/publication state | canonical |
| In-progress Live Game recovery | phone/local scoped state | canonical for unsent in-progress state |
| OBS relay | in-memory Node relay + authenticated publisher | transient, not product persistence |

## Phase 1 unresolved items

Still to verify in the next audit slice:

1. backup freshness visibility/alerting in organizer system status;
2. actual restore drill against a real production-generated backup after deploy;
3. all startup reconciliation jobs for idempotency/cost on a non-empty DB;
4. whether any worker can create duplicate delivery after process restart;
5. Supervisor restart interactions beyond the already-fixed webhook lifecycle;
6. whether Amvera platform snapshots include the nested `/data/backups` directory as expected;
7. exact ownership remaining in Python `mafia_crm.db`.

## Next phase

Phase 2 starts with a database ownership inventory:

- schema/table inventory;
- `ensure*Schema` functions;
- Drizzle migrations;
- application-level one-off migrations/data repairs;
- duplicate/compatibility fields;
- Python bot DB readers/writers;
- Telegram/VK identity linkage;
- transaction and idempotency review.

No broad refactor should start until that map is complete.
