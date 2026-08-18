# Repository workflow

This file is the mandatory starting point for AI-assisted work in this repository.

## Fast session startup

Before ordinary code work:

1. Fetch/sync the latest intended remote branch (normally `main`).
2. Read `docs/PROJECT_STATE.md`.
3. Review only the last 5–10 commits on `main` unless deeper history is needed.
4. If the requested feature is known, use `docs/FEATURE_MAP.md` for the first-hop files.
5. If the task starts from a symptom/error, use `docs/ERROR_PLAYBOOK.md` before widening discovery.
6. If the term/path is still unclear and a local working copy is available, run `npm run project:find -- "<query>"` and read only the highest-scoring 3–8 files first.
7. Use `docs/ARCHITECTURE.md` when the task genuinely spans subsystems or the feature map is insufficient.
8. Read `docs/BUSINESS_RULES.md` when the change touches Mafia/game/product rules.
9. Read `docs/RUNBOOK.md` for verification, deployment, DB, integration or recovery work.
10. When a local working copy is available, `npm run project:status` gives a read-only context snapshot.

Do **not** re-audit the entire repository at the start of every task. `docs/PROJECT_STATE.md` is the canonical high-level handoff; widen discovery only when targeted code contradicts it or the requested change genuinely spans subsystems.

`docs/live-club-roadmap.md` is historical planning material, not the source of truth for current completion.

## Source-of-truth precedence

- Latest remote code/mounts: implementation truth.
- Latest green CI: build/test truth.
- `docs/BUSINESS_RULES.md`: user-approved domain/product behavior.
- `docs/PROJECT_STATE.md`: current high-level feature status and next queue.
- `docs/FEATURE_MAP.md`: fast feature-to-file routing.
- `docs/ERROR_PLAYBOOK.md`: symptom-to-layer routing.
- `docs/ARCHITECTURE.md`: broader subsystem navigation map.
- Git history/merged PRs: completed technical transitions.
- Old chat summaries and old roadmap checkboxes must not override newer Git state.

Before any code or data changes, fetch and fast-forward-sync the current branch with its upstream remote. Treat the latest remote commit as the source of truth and preserve all user changes made through Google AI Studio; never replace them with older chat, local, database snapshot, or asset versions.

## Working style

- Do one targeted discovery pass, then keep a compact file map instead of rescanning the repository.
- Prefer the sequence `FEATURE_MAP/ERROR_PLAYBOOK -> project:find if needed -> exact source files`, not repeated repository-wide searches.
- Prefer one focused branch/PR per purpose.
- Treat a working branch as single-writer by default. Do not let ChatGPT, AI Studio or another agent push competing edits to the same branch at the same time. If the branch head moves unexpectedly, reconcile that change before writing again instead of racing it.
- Do not open a normal review PR at the start of active iteration. Prefer `fresh main -> working branch -> focused edits/tests -> PR -> one full CI -> merge`. If a PR must exist while work is still in progress, keep it as a draft so heavy CI stays skipped until it is ready for review.
- While iterating, run only directly relevant focused tests. Do not run the full Vitest suite, production build or Playwright after every small edit.
- Once the changed file set is known and a local checkout is available, run `npm run project:affected -- <changed files>` to rank likely tests and surface risk flags. Treat it as a heuristic, not a replacement for full CI.
- Use `npm run project:verify:fast` for the cheap project-wide safety pass (release audit + typecheck + lint) after a meaningful batch of edits; keep behavior-specific testing focused.
- Before merge, rely on the repository's full CI gates; never weaken tests or TypeScript to force green.
- If full CI fails, inspect the exact failed job first. Return the PR to draft while making multi-step repairs when practical, run the smallest relevant check, then mark it ready only when the repair is coherent so full CI runs again once.
- If tooling forces several sequential commits to an already-open PR, avoid triggering full CI for every half-fix. Prefer batching locally; when that is impossible, use GitHub-supported CI-skip commit markers only for intermediate commits and ensure the final substantive commit triggers CI normally.
- Do not stack unrelated changes on a red `main`.
- If a test unexpectedly fails, inspect the exact failure before rerunning; do not rerun repeatedly until green.
- Never delegate an implementation request back to AI Studio and never substitute prompt-writing for repository changes when repository access is available.
- Do not infer that a file is unused because its name includes `legacy`, `old`, `V2`, etc. Confirm imports, route mounts and build transforms.

## Fast local commands

- `npm run project:status` — branch/SHA/handoff/Render config snapshot; read-only.
- `npm run project:find -- "events calendar"` — ranked source/test/doc search over tracked text files.
- `npm run project:find -- "401 organizer" --json` — machine-readable search results.
- `npm run project:affected -- src/path/a.ts src/path/b.ts` — changed-file risk flags + likely focused tests.
- `npm run project:verify:fast` — release audit + typecheck + lint; no full Vitest/build/Playwright.
- `npm run project:verify` — complete web verification before merge.

## Documentation maintenance

Durable project state belongs in Git, not only in chat.

After a significant change, update the relevant handoff document in the same PR when practical:

- `docs/PROJECT_STATE.md` — feature status, current queue, important architecture/deploy cautions.
- `docs/FEATURE_MAP.md` — only when durable feature ownership/first-hop paths change.
- `docs/ERROR_PLAYBOOK.md` — only when a recurring diagnostic path changes or a new high-value failure mode is learned.
- `docs/ARCHITECTURE.md` — subsystem ownership, entry points, route mounts.
- `docs/BUSINESS_RULES.md` — only when an approved rule/product decision changes.
- `docs/RUNBOOK.md` — only when the safe work/verify/deploy process changes.

Do not update `PROJECT_STATE`'s “Last verified main” to an unmerged branch SHA. A verified-main marker means that exact `main` commit passed standard CI.

## Canonical SQLite data

- The only repository SQLite snapshot allowed as canonical is `mafia_crm.checkpoint.sqlite.gz.b64`, described by `mafia_crm.checkpoint.meta.json`.
- The canonical current tournament snapshot is the version that matches the current tournament avatar manifest (`src/lib/playerAvatarManifest.ts`) and the verified current tournament results. Do not restore older `*.bak*`, `bak_game7`, `bak_game8`, legacy SQLite copies, or arbitrary local DB files over it.
- A non-empty active runtime database always wins over repository bootstrap snapshots. Never overwrite, reset, clean, restore, or replace an existing runtime DB during Git sync/import.
- Repository checkpoints are bootstrap/recovery artifacts only when the runtime DB is absent or zero-length, unless the user explicitly requests a verified data restore.
- If several DB candidates exist, compare current-tournament markers before choosing: current avatar coverage and the verified tournament placements for Матроскина, Денди, and Богданчик. A candidate with missing avatars or stale placements is non-canonical.
- Never commit raw runtime SQLite databases or ad-hoc `.bak` copies. If a new canonical checkpoint is intentionally produced, create it from the verified active runtime DB using the repository checkpoint workflow and update its metadata together.

### Development / AI Studio checkpoint cycle

This Git checkpoint flow is for development and Google AI Studio only. A production runtime database lives on the server and uses separate server backups; production data must not be synchronized through Git checkpoints.

Use the guarded commands:

- `npm run checkpoint:git-export` — locate the configured active runtime DB, refuse if it is missing/empty, create a consistent SQLite online backup, verify it, and update only `mafia_crm.checkpoint.sqlite.gz.b64` plus `mafia_crm.checkpoint.meta.json` with checksum, creation time and schema marker.
- `npm run checkpoint:git-import` — validate encoding, checksum, schema marker and SQLite integrity, then import only when the configured runtime DB is absent or zero-length. There is no force/overwrite path for a non-empty runtime DB.

Short AI Studio cycle: `fetch/fast-forward -> preserve non-empty runtime -> work -> export verified runtime -> commit checkpoint + metadata + related avatar changes`.

## Final verification

During iteration, prefer focused tests plus `npm run project:verify:fast` when a cheap project-wide pass is useful.

The default complete web verification is available as:

- `npm run project:verify`

It runs release data-safety audit, strict TypeScript, ESLint, the full Vitest suite and production build.

Run the complete verification only when the change is coherent and ready for review/merge, not after every small edit. GitHub CI remains authoritative and also checks Python bot syntax and Playwright smoke. See `docs/RUNBOOK.md` for the exact release/runtime sequence.
