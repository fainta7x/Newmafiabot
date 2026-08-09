# Repository workflow

Before any code or data changes, fetch and fast-forward-sync the current branch with its upstream remote. Treat the latest remote commit as the source of truth and preserve all user changes made through Google AI Studio; never replace them with older chat, local, database snapshot, or asset versions.

## Iteration workflow

- Treat the current Git branch and working tree as authoritative; preserve user changes and runtime data.
- Do one initial upstream sync/fetch and one targeted discovery pass, then keep a compact file map instead of rescanning the repository.
- Make the complete implementation in one focused pass; use only directly relevant focused tests while working.
- Run one final `typecheck`, one final production `build`, and one final Preview/visual-QA pass unless a specific failure requires a single retry.
- Do not repeatedly restart Preview, refetch Git, rerun full suites, or regenerate the same PNG without a concrete failure to investigate.
- Never delegate an implementation request back to AI Studio and never substitute prompt-writing for repository changes.
