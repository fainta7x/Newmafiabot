# 2LA Noire — AI work contract

This file is the mandatory starting point for AI-assisted work in this repository. It defines **how the assistant must work**. It must not duplicate detailed project state, architecture or business rules.

## 1. Mandatory startup

For every new chat/session that touches the repository:

1. Fetch the latest remote `main`.
2. Read this file.
3. Read `docs/PROJECT_STATE.md`.
4. Review only the last 5–10 commits on `main` unless deeper history is necessary.
5. Use `docs/FEATURE_MAP.md` for known features or `docs/ERROR_PLAYBOOK.md` for symptoms/errors.
6. Read `docs/ARCHITECTURE.md` only when the task spans subsystems or ownership is unclear.
7. Read `docs/BUSINESS_RULES.md` before changing Mafia/game/product behavior.
8. Read `docs/RUNBOOK.md` for CI, deployment, database, recovery or integration work.
9. Before reading any binary/compressed/database/Base64 artifact, read `docs/BINARY_ARTIFACT_SAFETY.md` and use a byte-safe local/materialized path instead of injecting the payload into chat/model context.
10. When a local checkout is available, run `npm run project:status`; use `--check --json` for machine-readable verification.

Do **not** rebuild project context primarily from old chat history. Old chats and historical roadmaps are secondary evidence only.

When the user asks “what remains / what should we do next”, do **not** answer from remembered backlog alone. Reconcile `PROJECT_STATE` with current `main` first. An old open PR, old roadmap item or old chat task is **not** unfinished work merely because it is still visible; confirm that the requested behavior is actually absent from current code before proposing it.

## 2. Source-of-truth precedence

Use this order when sources disagree:

1. latest remote code/mounts — implementation truth;
2. latest green CI for the exact SHA — build/test truth;
3. `docs/BUSINESS_RULES.md` — user-approved domain behavior;
4. `docs/PROJECT_STATE.md` — current product/deploy state and next queue;
5. `docs/ARCHITECTURE.md` — subsystem ownership and runtime topology;
6. `docs/FEATURE_MAP.md` / `docs/ERROR_PLAYBOOK.md` — navigation aids;
7. merged PR/commit history — recent transitions;
8. historical roadmap/release notes — history only;
9. old chats and stale open PR descriptions — never override newer Git state.

If docs contradict current code, do a **targeted reconciliation**, update the stale doc in the same workstream, and do not continue with two competing interpretations.

## 3. One fact, one owner

Do not copy mutable facts into several documents.

- Current SHA, deployed/not-deployed state, active production storage, current queue -> `docs/PROJECT_STATE.md`.
- Work/verification/deploy procedure -> `docs/RUNBOOK.md`.
- Subsystem ownership/runtime topology -> `docs/ARCHITECTURE.md`.
- Visual contract -> `docs/DESIGN_SYSTEM.md`.
- Game/product rules -> `docs/BUSINESS_RULES.md`.
- Feature-to-file routing -> `docs/FEATURE_MAP.md`.

Other docs should link to the owner instead of restating mutable facts.

## 4. Working style

- Perform one targeted discovery pass, then keep a compact file map.
- Prefer `FEATURE_MAP/ERROR_PLAYBOOK -> exact source files -> focused tests`.
- Never infer that `legacy`, `old`, `V2`, `Base`, etc. means unused; confirm imports/mounts/build transforms.
- Never infer that an old/open PR is still needed; compare its intended behavior with current `main` first.
- Preserve newer user/AI Studio changes. A working branch has one writer by default.
- If a branch head moves unexpectedly, stop and reconcile before writing again.
- Never delegate implementation back to AI Studio when repository access is available.
- Do not substitute prompt-writing for requested repository work.
- **Ask before starting new product work (owner rule, 2026-09-29).** Without asking you may fix bugs, clarify wording, and finish what the owner asked for in the current conversation. Before starting anything else — a new feature or queue item from `docs/PROJECT_STATE.md`, a new screen, a new integration, even one listed as «next» — tell the owner in one or two plain sentences what you propose and why, and wait for a «да». A queue or a handoff list is a plan to discuss, not permission to build. Autonomous routine runs follow the same rule: fix and verify, but propose new features instead of building them.
- **Digest of changes for players (owner rule, 2026-10-05).** Keep the list «Player-facing changes not yet announced» in `docs/PROJECT_STATE.md` up to date: add a short plain-words line whenever a merged change alters what players can do or see (new or changed screens, features, rules, wording they notice). Fixes, internal work and anything invisible to players do not go on it. After roughly ten merged PRs, or sooner when something notable lands, ask the owner whether to publish a digest — offer a short draft. «Да» → publish it (the club's public channel, or hand over the finished text if the app has no way to post it) and clear the published lines; «ещё подождём» → keep collecting and ask again later. Never publish without the owner's «да». Owner, 2026-10-10: no newsletter-style digest to the club channel for now; the list stays as raw material for a possible in-app «Что нового» notice, which is proposed to the owner before it is built.
- Record every new idea, request or open question from the owner in `docs/PROJECT_STATE.md` (current queue or «Waiting on the owner») in the same session, even if it is not built now. Ideas that live only in chat get lost.

## 4a. Anti-stall protocol — mandatory for bug fixes and UI work

This is a **workflow contract**, not a promise that external CI or deployments will finish instantly. Detailed test commands and failure triage live in [`docs/RUNBOOK.md`](docs/RUNBOOK.md) under **Focused debugging / anti-stall loop**.

1. **Define one observable failure first.** Record the exact reproduction, expected/actual outcome, first suspect layer, evidence (screenshot/error/failed test), and one acceptance check. Separate an actual app bug from a broken test fixture or selector.
2. **Trace the real action path before editing.** For a nonresponsive button, inspect click interception/overlays, disabled state, handler, state transition, persistence/API and completion callback. For game rules, consult `docs/BUSINESS_RULES.md`; a test must not redefine the rules.
3. **Patch the smallest owner.** Keep the proven live-game UI, card geometry and production behavior unchanged when fixing training-only UI. Do not redesign a working layout to accommodate a test.
4. **Test in layers, not full CI on every tweak.** Start with the one focused Vitest/spec or typecheck of the affected code. For browser interaction, run the shortest relevant Playwright flow at 360/390 px and inspect failure artifacts. Only after a coherent change passes focused checks should broad required CI run. Do not manually rerun the entire workflow without a new cause-based fix.
5. **No blind retries.** After **two unsuccessful fixes of the same symptom**, stop editing, re-examine the actual runtime/fixture/logs and name a new root-cause hypothesis. Do not merely relax an assertion, force-click, invent new production behavior or keep committing variants.
6. **No CI polling loop.** Record the PR, exact head SHA, workflow/job URL and current state. **Hard stop:** after one unchanged CI status recheck with no other useful work, end this turn with the exact pending status; do not keep calling the same tool. Resume only when there is a new user turn or genuinely new information. Check once when a result can reasonably have changed; if still queued/running, do other useful work or hand off an explicit *pending verification* status. Do not issue dozens of near-identical status requests or suggest you are working in the background.
7. **Communicate results, not activity.** Give concise progress only when there is a genuine new finding, fix or test result. Never call a feature *fixed*, *merged*, *deployed* or *verified* based on code edits alone. If blocked, say precisely where and what next check is needed.
8. **Stop with a reproducible handoff.** If the same issue remains unresolved after focused attempts or external CI is still running, provide: branch/PR and SHA, passed checks, exact failing test + cause (known/unknown), the next single step, and whether `main`/runtime changed. Respect the 3-PR budget below.

**Important:** don't confuse `main` merged, Amvera deployed, and runtime-verified. An isolated screenshot or green build proves neither all interactions nor deployment. Documentation-only changes should be verified by reading the committed diff rather than repeatedly running the entire gameplay E2E suite.

## 5. PR budget — hard rule (GPT/Codex only)

**Scope (owner decision 2026-10-04):** this budget applies to the GPT/Codex assistant only. It does **not** apply to Claude — the owner lifted it for Claude. Claude still keeps PRs coherent, runs each to green CI and does not loop on screenshot/fix/CI cycles.

For **one user message/request**, create at most **3 pull requests total**.

- After the third PR, stop repository changes and CI polling.
- Give a short handoff: what is done, what remains, what is blocked.
- Continue only after the user's next message.
- Prefer fewer PRs when one coherent PR is sufficient.
- Do not evade the limit by creating several branches without PRs for the same work.
- One PR may contain several coherent commits, but it must not become an endless `screenshot -> fix -> full CI -> fix -> full CI` loop.

## 6. Branch / CI discipline

Default flow:

`fresh green main -> focused branch -> focused checks -> coherent PR -> fast CI -> merge -> verify main`

During iteration:

- run only directly relevant tests;
- use `npm run project:affected -- <changed files>` when useful;
- use `npm run project:verify:fast` after a meaningful batch;
- do not run or wait for Playwright unless the user explicitly requests browser verification, the change is visual/live-game/browser-specific, or this is an explicit release gate.

Before merge:

- the required non-browser CI is authoritative for ordinary PRs;
- Broad Playwright suites remain outside the ordinary merge gate. The user-approved UI preview workflow automatically runs focused static mobile checks on relevant PR updates, including drafts; see docs/UI_PREVIEW.md.
- use the manual Playwright workflow only when the user explicitly requests it, the change needs browser/visual validation, or release verification requires it;
- never weaken TypeScript/tests to force green;
- inspect the exact failing job before rerunning;
- for visual work, **green CI is not visual approval**: inspect fresh Playwright screenshots when browser verification is explicitly requested.

## Amvera access and asynchronous deploy checks

The assistant has configured browser automation access to the Amvera project for this repository and may:

- inspect the current Amvera project status and logs;
- start a manual build/deploy of the latest synchronized repository revision;
- verify the deployed runtime with the application health endpoints and a focused WebApp check.

A manual Amvera build/deploy is an external runtime action, but it is authorized when it is part of the user's requested repository verification or release workflow. Do not ask the user to start the deploy if the configured Amvera access is available.

Amvera builds can take a long time. After starting a build/deploy:

1. Do not wait synchronously for the build to finish.
2. Record that the build was started and continue with local/repository verification or end the turn.
3. On the next relevant user request, perform one status check only: inspect the Amvera project state, check the latest build/application log for errors, and call `/api/health` (plus `/api/health/runtime` when relevant).
4. If the previous build is still running, do not start another build. Report the current status and continue with other useful work.
5. Only after the build is no longer running, perform focused live WebApp verification. Distinguish clearly between `green main`, `deployed main`, and `runtime verified`.

Do not expose Amvera credentials, tokens, session data or internal control URLs in chat.

## Mobile-first Telegram WebApp contract

Mobile Telegram WebApp is the primary release target. Treat desktop as a secondary layout, not the baseline.

- Design and review every new or changed screen first at approximately 390 CSS px wide inside the Telegram WebApp viewport.
- Check narrow widths, Telegram safe areas, fixed/sticky panels, bottom navigation, scroll containers, and the on-screen keyboard before considering the change complete.
- Keep important content and judge/CRM actions inside the usable viewport; do not rely on desktop hover, wide tables, or tiny controls.
- Every fixed overlay must be centered and width-bounded on mobile, respect the bottom safe area, and never clip its actions off-screen.
- For live-game controls, explicitly verify role distribution, music controls, timer controls, player identities, and the primary next action on a phone-sized screen.
- A green build or test run is not mobile approval: visual/browser evidence must be inspected when the change affects layout or interaction.

## 7. Database safety

Production data is more important than repository convenience.

- The only supported runtime database is persistent SQLite on Amvera.
- Canonical production storage is `/data/mafia_crm.sqlite`.
- The password-protected in-app sandbox uses `/data/mafia_crm.test.sqlite` inside the same Amvera application, selected only by a signed test-session cookie.
- Turso is retired. Never add or use `TURSO_DATABASE_URL` or `TURSO_AUTH_TOKEN`; the server rejects them.
- The sandbox database must never bootstrap from the production checkpoint or use the same file path as production.
- Repository checkpoint files are production bootstrap/recovery artifacts only.
- A non-empty runtime database always wins over repository checkpoint/bootstrap data.
- Never reset, restore, replace, clean or overwrite production/runtime data during normal Git/deploy work.

Canonical repository checkpoint files:

- `mafia_crm.checkpoint.sqlite.gz.b64`
- `mafia_crm.checkpoint.meta.json`

Use only guarded checkpoint commands documented in `docs/RUNBOOK.md`. For read-only inspection of these or any other binary artifacts, also follow `docs/BINARY_ARTIFACT_SAFETY.md`.

## 8. Documentation maintenance — required

Durable changes must be recorded in Git, not only in chat.

In the same PR when practical:

- update `PROJECT_STATE` when feature status, current queue, verified main, deployment/storage assumptions or release state changes;
- update `ARCHITECTURE` when entry points, ownership or runtime topology changes;
- update `RUNBOOK` when safe work/deploy/recovery procedure changes;
- update `DESIGN_SYSTEM` only when the durable visual contract changes;
- update `BUSINESS_RULES` only after explicit user-approved product/rule change;
- update `FEATURE_MAP` only when first-hop ownership changes;
- **record every audit or bug hunt in `docs/AUDIT_LOG.md` in the same session, before fixing** (scope, each finding with file and one-line defect, status open/fixed/wontfix). Findings that exist only in chat or in a context summary are lost.

Do not maintain detailed chronological completed-work lists in multiple docs. Git history is the history.

When a previously planned feature becomes implemented, remove or reclassify the stale backlog entry in `PROJECT_STATE` in the same workstream. Do not leave “to build” instructions for a subsystem that already exists.

## 9. End-of-task handoff

A good handoff contains only:

- PR/merge/main SHA;
- CI result;
- what changed;
- what remains;
- runtime verification still needed;
- one explicit caution if any.

Before claiming the project is ready to deploy, distinguish:

- `green main`;
- `deployed main`;
- `runtime verified`.

These are three different states.
