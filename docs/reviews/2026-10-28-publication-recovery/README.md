# AR02: publication recovery verification

Owner approved the full recovery review before implementation. Base: merged #1080 / `7ee72738`.

One candidate covers the public posting paths and shared reschedule sender. No production writes, real notifications, deployment, Elo/payment/award rule changes or historical result reopening.

- Durable acceptance tests exercise concurrent claims, timeout/5xx, malformed success, missing/wrong IDs, incomplete albums, rate limits/Retry-After, permanent rejection, result-write failure, late replies after manual decisions, stale/duplicate decisions, frozen replay and per-channel success.
- Isolated cutover runs twice and keeps terminal club results and personal queues. New route tests verify organizer auth, required explicit absence confirmation, stale version409, actor audit and image-byte redaction.
- Connected producer cases cover today/cancel/reschedule, game/evening/public/season summaries, MVP prompts/runoff/results, tournament announcements/game follow-ups/results, poker/custom and personal routing. Successful Telegram fixtures now include actual IDs; historical tests requiring 5xx/crash resend now assert a hold. A separate MVP regression forbids photo→text fallback after a503.
- TypeScript, ESLint, dependency boundaries (zero cycles/violations), release data-safety audit, smoke19 and production build pass locally. Required remote exact-head CI remains the merge gate.
- Four browser flows at360×640,390×844,1366×768,1440×900 exercise queue, manual acceptance, absence confirmation and completion; each state passes the shared automatic layout/text detector. The page is registered in the whole-app audit and preview build.

Actual baseline screenshot uses main `7ee72738` in a detached checkout with the same fixture/styles; candidate screenshots use the implemented component. Screenshots were inspected. Local browser: Chromium153 supplied by an isolated npm package because the standard Playwright archive was unavailable; CI uses its configured Chrome. Fonts: repository CI font config.

[Before,390px](before-390.png) · [After,390px](after-390.png) · [Absence confirmation,390px](confirmation-390.png)

Limits: public health200 is not deployment or production-flow verification. No exactly-once claim is possible across an unacknowledged third-party API. Unknown outcomes require a real organizer channel check. Legacy holds without saved payload only release the original publisher; closed historical sources remain closed.
