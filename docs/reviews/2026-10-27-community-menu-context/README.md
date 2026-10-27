# Community / Progress — nested menu context

Base5420b3e (#1067). Owner asked for the next stage; the complete control map in15 owners was reviewed and MC01–MC05 recorded before app edits. This continues agreed context/clarity behavior; rating names/grouping/formulas, awards and privacy stay unchanged.

| Finding | Before | Result |
| --- | --- | --- |
| MC01 Rating | Season/Metrics → Connections → Rating resets to Elo | Last rating route returns, including after remount; explicit addresses win |
| MC02 Activity | Archive → Connections → Activity resets to Form | Last Activity view returns, separated by viewer; legacy links retain their defaults |
| MC03 Metric search | Old query remains after choosing a metric; Escape does nothing | Fresh search after selection, clear without changing metric, Escape/selection return focus to the trigger; no automatic phone keyboard popup |
| MC04 Public awards | Another player’s profile says “Мои награды / Мои цели” | “Награды игрока / Достижения”; own profile wording unchanged, public selection remains read-only |
| MC05 Role list | Long name becomes ellipsis; returned total invisible | Whole identity and shown/total, same existing rows/sample sizes/values |

## Actual before / after

Synthetic isolated cabinet/profile previews with complete app stylesheet parity. Same data, viewport390×844 and action sequence. Original reproduction routes/query/public labels are in before.json. The metric/role harness has3 existing named metrics and one long-nickname row with a total40; these are deliberate test responses, not real player results or proof of all37 metric definitions.

| View/action | Before | After |
| --- | --- | --- |
| Return to Rating | [Elo reset](before-rating.png) | [Season preserved](after-rating.png) |
| Return to Activity | [Form reset](before-activity.png) | [Archive preserved](after-activity.png) |
| Roles list | [truncated name](before-roles.png) | [whole name and extent](after-roles.png) |
| Public awards | [self wording](before-public-awards.png) | [viewed-player wording](after-public-awards.png) |

All eight images inspected. The after role-list scenario explicitly scrolls the row into view if needed; both images show the same complete row and selector state.

## Verification and limits

17 focused component/structure cases pass. Four browser cases pass at360×640,390×844,1366×768,1440×900, covering six states each: remembered season, archive, metric search/clear/Escape, roles and public awards/achievements (24 clean audits). Direct-link priority, remount/viewer isolation and no write from public achievement choice are also checked. Existing tests were only repeated after their relevant test-type correction.

A390px audit incorrectly paired the invisible continuation of a multiline paragraph below a scroll clip with footer text. A focused paired self-test reproduced it before the change: clipped case failed, actual visible overlap passed detection. The pairwise guard now requires both elements at their visible intersection; all11 detector self-tests pass, including actual overlap, truncation and covered buttons. No thresholds changed or new exception added. This fixes the detector instead of reshaping an already correctly clipped page.

TypeScript and changed-source lint pass. Release safety audit2464 and dependency guard0cycles/0violations pass. Required CI on the published commit remains the merge gate. No authorized production walkthrough, production write, real invitation or Amvera synchronization/deploy was performed. Previous #1067 is merged and its actual UI2252 screenshots were inspected; this candidate is separate.
