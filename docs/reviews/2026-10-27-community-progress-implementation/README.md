# Community / Progress — approved implementation

Owner approved the complete CP01–CP15 plan after [full review](../../UX_COMMUNITY_PROGRESS_REVIEW_2026-10-27.md). Baseline:5a69c78 (#1065); review #1066 mergedfd01527. This candidate implements the entire approved scope in one PR; no new rating, game rule, participation threshold or privacy permission.

| Plan | Implemented behavior |
| --- | --- |
| CP01–02 | Existing profile URLs follow tab clicks; refresh/return restores tab, career filters/page/scroll per viewer/player. Inner club, award, metric, season and match choices are remembered. Only preferences are stored. |
| CP03 | Key results → recent games → analytics and open detailed statistics, with jumps to existing statistics sections. |
| CP04 | Club selector contains Teams, Opposition, Circle and Pairs; existing pair meanings and single-game warning remain. |
| CP05–06 | Personal Players / My Team / Invitations; count, search, clear, remembered list filter/query and canonical profile navigation. Analytics moved to Overview. |
| CP07–08 | Existing metric names are searchable; selected metric/scope survives return. Shown/total count and the separate own row are explicit; sample denominators remain. |
| CP09 | Seasonal accruals and match spotlight open the canonical protocol. Selected period/player/evening/game survive return. Timeline links only for known canonical sources, self-only; no fabricated IDs. |
| CP10–11 | Collection / Goals plus immediate “Оформить профиль” jump to pin controls. Trophy artwork stays. Pin loading, failure, success, slots and three-pin limit are visible. |
| CP12–13 | Game errors differ from successful empty results; failed scope changes explain rollback/retry. Independent recovery for analytics, seasons, GoMafia and connections. Invite inbox/eligibility distinguish temporary errors from actual restrictions. |
| CP14 | Continue the existing guide section/next lesson using device-local guide progress; catalog remains below. |
| CP15 | Hidden public statistics use a neutral message across games/roles/Elo and do not start blocked statistic requests. Server privacy gates unchanged. |

## Evidence

Synthetic isolated previews, same baseline/after fixtures, not a signed-in production walkthrough. Thirteen390px screenshots captured and inspected. The learning fixture uses the same valid existing `judge-conduct` progress in both versions. No real invitation was sent or pin written to production.

| View | Before | After |
| --- | --- | --- |
| Overview | [before](before-overview.png) | [after](after-overview.png) |
| Personal connections | [before](before-connections.png) | [Players](after-connections.png), [My Team](after-my-team.png), [Invitations](after-invitations.png) |
| Awards | [before](before-awards.png) | [Collection/arrange](after-awards.png), [Goals](after-goals.png) |
| Club pairs | [before](before-pairs.png) | [after](after-pairs.png) |
| Learning | [before](before-learning.png) | [after](after-learning.png) |

`checks.json` records exercised browser behaviors: search/no-match/clear, personal task switches, collection/goals, actual cabinet route plus refresh at360/390/1440. Detailed statistics remain open. Existing pre-preview gradient/font artifacts are not claimed as production findings or silently redesigned.

Verification: final affected component batch30/30 (5files); earlier connected batch45/45 (8files), with the affected files repeated after relevant edits only. Showcase API integration4/4, including trusted self-only links. Preview specs4/4: achievement paths/action counters at360/390/1440 and the Telegram profile navigation/filter/owner-actions flow. TypeScript and changed-source lint pass; release audit2436 tracked files pass, dependency guard0cycles/0violations; project context check passes. Required CI on the published SHA is authoritative for merge; preview screenshots prove neither Amvera deployment nor live use. Filled metric/season/match data lacks a full cabinet fixture here; its behavior is also reviewed in source/component tests rather than claimed as a real player-data walkthrough.
