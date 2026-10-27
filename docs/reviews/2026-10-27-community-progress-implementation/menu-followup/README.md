# Community / Progress — menu continuation

Owner: «продолжай, и улучшай эти менюшки дальше». Same PR #1067; previous full plan stays included. Main1cd10bd (#1061) is preserved. Baseline is30793f6 plus that main, with the same complete app stylesheet order used for both sides. Both sides use the same synthetic fixture, viewport, disclosure and action path; these are real browser images, not a production/player-data walkthrough.

- Community destinations are all visible: three above/two below on phones; club stories use2×2, with full words.
- Career/Awards reopen the last nested view, including after remount; canonical URLs and existing filters remain.
- Identity/tabs remain outside the profile main scroller. Content stays between the fixed cabinet bars, including a shorter viewport; no partially covered action behind the footer.
- Wide detailed statistics again span the working width (399.6→1070px at1366px). Detailed statistics remain open. Long team names wrap; graphics/rewards/rating meanings stay.
- Fixed the exact CI findings: team-load recovery test verifies retry; pair scenarios navigate through Pairs; the statistics width assertion stays strict. Harnesses load app CSS in app order; removed one identical unreachable fixture case. The layout detector and thresholds are unchanged.

| View / action | Before | After |
| --- | --- | --- |
| Community / Pairs,390×844 | [before](before-club.png) | [after](after-club.png) |
| My Team,390×844 | [before](before-team.png) | [after](after-team.png) |
| Roles → Connections → Career,390×844 | [Games reset](before-return.png) | [Roles restored](after-return.png) |
| Open statistics,1366×768 | [narrow column](before-statistics.png) | [full working width](after-statistics.png) |

All eight images inspected. The statistics comparison uses the same “scroll details into view” action; the new main scroller keeps the complete menus above it, so vertical composition changes intentionally. `checks.json` records the selected subview/width measurements.

Verification:20 focused component/style-parity cases; final15 profile cases after the scroller correction;13 affected preview cases (old pair/continuity/desktop checks plus shorter viewport); final five menu/layout/short-viewport cases with53 clean audits. Four required sizes:360×640,390×844,1366×768,1440×900. The audit includes real nonzero profile scrolling, content width and returning to nested views. TypeScript, changed-source lint and release safety audit2452 pass. Test route is part of automatic UI preview. Required CI on the published SHA remains a separate merge gate. No production write, real invitation or Amvera sync/deploy was performed.
