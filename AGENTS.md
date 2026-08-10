# Repository workflow

Before any code or data changes, fetch and fast-forward-sync the current branch with its upstream remote. Treat the latest remote commit as the source of truth and preserve all user changes made through Google AI Studio; never replace them with older chat, local, database snapshot, or asset versions.

## Canonical SQLite data

- The only repository SQLite snapshot allowed as canonical is `mafia_crm.checkpoint.sqlite.gz.b64`, described by `mafia_crm.checkpoint.meta.json`.
- The canonical current tournament snapshot is the version that matches the current tournament avatar manifest (`src/lib/playerAvatarManifest.ts`) and the verified current tournament results. Do not restore older `*.bak*`, `bak_game7`, `bak_game8`, legacy SQLite copies, or arbitrary local DB files over it.
- A non-empty active runtime database always wins over repository bootstrap snapshots. Never overwrite, reset, clean, restore, or replace an existing runtime DB during Git sync/import.
- Repository checkpoints are bootstrap/recovery artifacts only when the runtime DB is absent or zero-length, unless the user explicitly requests a verified data restore.
- If several DB candidates exist, compare current-tournament markers before choosing: current avatar coverage and the verified tournament placements for Матроскина, Денди, and Богданчик. A candidate with missing avatars or stale placements is non-canonical.
- Never commit raw runtime SQLite databases or ad-hoc `.bak` copies. If a new canonical checkpoint is intentionally produced, create it from the verified active runtime DB using the repository checkpoint workflow and update its metadata together.

## Iteration workflow

- Treat the current Git branch and working tree as authoritative; preserve user changes and runtime data.
- Do one initial upstream sync/fetch and one targeted discovery pass, then keep a compact file map instead of rescanning the repository.
- Make the complete implementation in one focused pass; use only directly relevant focused tests while working.
- Run one final `typecheck`, one final production `build`, and one final Preview/visual-QA pass unless a specific failure requires a single retry.
- Do not repeatedly restart Preview, refetch Git, rerun full suites, or regenerate the same PNG without a concrete failure to investigate.
- Never delegate an implementation request back to AI Studio and never substitute prompt-writing for repository changes.
