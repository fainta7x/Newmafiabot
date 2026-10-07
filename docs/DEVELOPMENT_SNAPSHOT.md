# Weekly development database copy

## Purpose and boundary

A read-only SQLite online backup feeds a **new**, reviewed SQLite database for realistic development checks. This is a development projection, not a backup/restore mechanism or a full production clone. Never load it into production or the shared in-app sandbox.

Retained data: players' game levels/stages/Elo/token balances; evenings, tables, RSVP/attendance/payment totals; club game seats and reviewed structured protocol facts; tournaments, participants, seats, numeric results/best moves; rating periods. Real IDs become fresh per-export HMAC pseudonyms (integer club game IDs remain local game numbers). Relationships survive inside one copy, but player identifiers change between copies. Nicknames, names, titles and venues become synthetic labels. Exact dates and gameplay statistics remain useful for development: this is pseudonymisation, not a claim that people cannot be inferred from public match history.

Removed: contacts, external account IDs, birthdays, real nicknames, avatars, raw text/messages/notes, URLs, secrets/sessions, payments/provider credentials, music, raw JSON and unknown tables. A reviewed projection preserves only the listed numeric/enum facts from structured club protocols; legacy free-text protocols and active draft protocols are removed. This means detailed chronology, invitations, delivery/payment-provider history, achievements, cosmetics, poker state and other non-retained screens require synthetic fixtures. Token balances remain, the transaction journal does not.

Policy owner: `src/server/services/anonymizedSnapshotPolicy.ts` (reviewed columns and DDL) and `anonymizedSnapshotService.ts` (value rules). No production SQL/DDL, triggers, views or indexes are copied into the export. New columns in retained tables abort export even when empty; unreviewed enum values, bad dates/JSON or broken foreign keys also abort. Unknown tables contribute no schema or data. Do not replace this with a denylist or relax failures to make a job pass.

The source connection is used only by SQLite's online backup. All reads/sanitisation happen in a private temporary directory; every exit cleans it. The fresh output passes `foreign_key_check` and `integrity_check` before gzip download. No snapshot can overwrite the source database.

## Configuration and first run

1. Generate a fresh random export key (at least 32 characters, e.g. `openssl rand -hex 32`). Set **DEVELOPMENT_SNAPSHOT_KEY** in Amvera and the same value in GitHub Actions secrets. This key grants only the snapshot endpoint; bot/read/organizer credentials are rejected.
2. Generate a separate 32-byte AES key (`openssl rand -hex 32`). Set **DEVELOPMENT_SNAPSHOT_ENCRYPTION_KEY** in GitHub Actions secrets. Keep a secure developer copy for local decryption. It is not needed by Amvera. Never paste either key into issues/chat or commit it.
3. Set GitHub Actions variable **DEVELOPMENT_SNAPSHOT_URL** to the HTTPS application base URL (fallback: `PLAYER_APP_URL`). Do not put credentials/query parameters in the URL.
4. Deploy the exporter revision; without a strong export key it returns 503, and without the right scoped header it returns 401.
5. Manually run **Weekly encrypted development snapshot**. Confirm success and the encrypted artifact/manifest before treating weekly collection as active. A green application CI does not mean the production exporter is deployed/configured.

Schedule: Mondays at 05:17 Europe/Moscow (02:17 UTC). Manual dispatch is available. A single job runs at once; no dependency installation is needed. Artifact retention is 14 days. The workflow has read-only repository permission and does not commit database files. Missing secrets or an unavailable/unreviewed exporter fail explicitly, without an artifact.

GitHub artifacts in this public repository contain **only AES-256-GCM encrypted gzip** plus bounded metadata (version/date/checksum/bytes/table names/counts). No plaintext SQLite/gzip, credential, salt or key is uploaded. Downloads reject redirects, non-gzip responses, inconsistent metadata/checksums and oversized/decompression-bomb payloads. Credentials/payloads are never printed.

## Local use

Follow `docs/BINARY_ARTIFACT_SAFETY.md`: download artifact ZIP as bytes, list entries, extract locally. Do not fetch it as text/Base64.

```bash
# Set DEVELOPMENT_SNAPSHOT_ENCRYPTION_KEY through your secure local environment.
node scripts/developmentSnapshot.mjs decrypt development.sqlite.gz.enc temp/local-development.sqlite
# Check the fresh local copy; never substitute a production path.
sqlite3 temp/local-development.sqlite 'PRAGMA integrity_check; PRAGMA foreign_key_check;'
```

Decryption authenticates every byte and refuses an existing output file or canonical runtime filenames. Use an isolated local environment with no bot/VK/OBS/payment credentials and no announcement workers; this projection is not an import into the live app. Open it read-only for SQL diagnostics. New migrations on a local working copy may change calculated values; the exported file itself is not canonical production state.

## Operational errors

- HTTP 503: configure/deploy the scoped export key.
- HTTP 401: GitHub/Amvera export keys differ, or wrong header.
- HTTP 429: a previous export is still building; no overlapping export.
- HTTP 500: review the exporter schema/value policy or source FK integrity in an isolated environment; no data was exported. Never print raw rows or weaken privacy checks.
- Downloader failure: verify URL/secrets and exporter availability. No plaintext files are produced and existing artifact files are not overwritten.
- Lost AES key: older artifacts cannot be recovered. Rotate the key and create a new export; never replace it with the export credential.
