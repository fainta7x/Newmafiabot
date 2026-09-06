# UI preview and mobile evidence

The preview uses real application components and in-memory E2E fixtures. It never starts Node API/Python workers or opens Turso/SQLite. It is a visual and interaction workbench, not a production integration check.

## Build

Run from the repository root:

    node scripts/buildUiPreview.mjs

Output: temp/ui-preview. The allowlisted pages are evening roster/payments, Live Game and Player Cabinet. The gallery supports phone sizes 390×713 and 360×640, plus a desktop frame. Reload resets the page fixtures. revision.json records the source commit and dirty state. CSP restricts requests to the preview's own origin. Runtime uploads, database checkpoints and production avatars are not copied.

## Automatic checks

.github/workflows/ui-preview.yml runs for relevant pull_request opened/synchronize/reopened/ready_for_review events, including drafts. It uses read-only repository permission, no production secrets and a static Vite server. It builds the preview, then runs:

    cd e2e
    npx playwright test --config playwright-preview.config.mjs

Artifacts (14 days):
- ui-preview-site: exact built pages and source revision.
- ui-preview-evidence: mobile screenshots and failure traces.

The focused test covers the currently mounted evening roster/payments and the gallery. It does not replace the broader manual CRM/Live Game suites. Existing unrelated CRM failures remain tracked in PROJECT_STATE.

Before claiming visual approval, download the artifact for the intended PR run, check its source SHA, and inspect the actual images. Follow BINARY_ARTIFACT_SAFETY for ZIP downloads.

## Private hosted copy and agent access

The owner-private Sites copy is a snapshot built from this repository; generated bundles must never be edited by hand. Rebuild here and copy temp/ui-preview into the same Sites checkout's dist directory, preserving its .openai/hosting.json identity. Follow Sites hosting to commit, push, package and update that Site. GitHub automatically builds artifacts/screenshots; publishing the private Site is a separate agent action, not an unattended GitHub deployment.

For agent-side interactive checks, use Sites' supervised preview and the control-browser skill. Do not open loopback URLs in the cloud browser; use only the address prescribed by the Sites environment instructions. The deployed private URL is for the user; it is not reachable from the agent browser.

Do not add production credentials, user sessions or real database copies to this preview.
