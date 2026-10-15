# Player cabinet — compact task-first composition

Owner correction, 15 October 2026. Supersedes the 14 October graphics-first rollout. Durable visual rules belong to [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md); this file records the screen review and decisions.

Design a player's task and the page composition, not each old block. Combine related information on one neutral surface with spacing/dividers. Keep primary actions visible, detail available and mobile targets at least 44px. Compactness must not come from tiny text, omitted records or hidden primary actions.

## Mounted screen review

| Area / owner | Decision |
| --- | --- |
| Home / `PlayerHomeDashboard` | Next evening primary. Career numbers, latest result and protocol share a group. News, learning and genuine payment/onboarding actions retain their purpose. |
| Soon / `PlayerEventsCalendar` | Keep date/list switch, calendar when selected, real RSVP and slots; calendar is functional graphics. |
| Registration / `PlayerEventSlotDetail`, `PlayerTournamentEveningDetail`, `PlayerCustomEventDetail` | Keep roster, time, choices and confirmation. No cosmetic rewrite of registration/finance. |
| My games / `PlayerHistoryStatsView` | Summary plus grouped tappable history; remove giant role posters and arbitrary binary-result bar heights. Club archive remains complete and secondary. |
| Past evening / `PlayerEveningSummaries` | Team score, personal result, roles and Elo in one report. Facts, awards and standout players share a second group. Protocols become compact actions. |
| One game / `PlayerGameDetail`, `PlayerVisualScenes` | Result and personal outcome share a header. Optional seating map alongside real roster. Keep day/night chronology and one ballot comparison; remove night landscape and duplicate vote graphics. Announced checks stay distinct from actual roles. |
| Community / `PlayerCommunityHub` | Navigation and active content first; poker is a compact secondary entry. |
| Rating Elo / `PlayerRatingTable` | Keep real rank, own position, identity and value; no per-player charts. |
| Rating indicators / `PlayerMetricRatings` | Grouped rows, value/unit and actual action/game count. No bars normalised to the best player: indicators have different directions and meanings. |
| Rating roles / `PlayerRoleTables` | Keep role selector, ranks, denominators and filters; no role posters or universal skill score. |
| Rating seasons / `PlayerRatingPeriods` | Selected season and official standings; no artwork required. |
| Tournaments / `PlayerTournamentResults`, `PlayerTournamentView` | Keep standings, registration, games and nominations. Actual tournament identity has meaning; no extra artwork per statistic. |
| Players / `PlayerClubDirectory` | Search and grouped identity/action list; avatars support recognition. |
| Connections / `ClubConnectionStories`, `PlayerClubConnections` | Real members, roles and shared results in groups. Remove two/three-person network canvases and orbits. Retain red/black comparisons and rivalry scores. |
| Activity form / `PlayerClubActivity` | Ranked list, period, own place and optional formula; no charts per player. |
| Activity matches / `PlayerStoriesPanel` | Keep match summaries/protocol navigation; no second poster gallery. |
| Activity season / `PlayerSeasonsPanel` | Useful records and verified leaders; award artwork has meaning, ordinary numbers need none. |
| Activity archive / `PlayerSeasonsPanel` | Keep season selection and history disclosure; no oversized timeline. |
| Progress overview / `CanonicalPremiumPlayerProfile`, `PlayerProfileCareerSections` | Club totals/detail form one hierarchy; remove orbit, repeated shortcuts and nested metric tiles. Federation remains separate. Detailed statistics stay open by default as previously requested. |
| Progress games | One grouped history with result/role/date/Elo and full filters/pagination. |
| Progress roles | One comparison group for four real roles, aligned values and subtle team accents; no invented role symbols. |
| Progress Elo / `PlayerEloJourney` | Keep time-series chart: it communicates direction over time. Keep source/period and game drilldown. |
| Personal connections / `PremiumProfileConnections`, `PersonalTeamwork` | Keep invitation actions and factual context; add no decorative network. |
| Awards / `PremiumProfileShowcase`, `TrophyCabinet`, `PlayerAchievementPaths` | Keep trophy art, earned evidence and progress paths; visual objects are the subject. No awards redesign in this pass. |
| Club history / `PremiumProfileShowcase` | Keep chronological events; no oversized cards. |
| Learning / `PlayerLearningBlock` | Categories, lesson/trainer actions and purposeful game diagrams; no new training design. |
| Federation / `PlayerGoMafiaLink` | Separate source, year/tournament filters and exact results. Never fold into club Elo. |
| Settings / `PlayerSettingsHub` | Identity, notifications, invitations, privacy and music are meaningful form groups; no graphics needed. |
| Wallet / `PlayerWalletHub` | Money/tokens stay explicitly distinct with real status/transactions; no accounting changes. |
| Conduct / `PlayerConductCenter` | Game/music actions; live-game geometry owned by judge workflow. |
| Poker / `PlayerPoker` | Table/cards are functional game graphics; no gameplay changes. |
| Chrome / `PlayerCabinetShell` | Four destinations, header actions, Telegram safe areas; no new navigation tier. |

## Evidence and limits

Read mounted sources using `FEATURE_MAP.md`; verify with isolated fixture-backed previews, never production writes. Code review is not a usability study. Screenshots establish layout evidence, not measured player performance or production deployment.

Principles checked against [Material 3 lists](https://m3.material.io/components/lists/overview), [cards](https://m3.material.io/components/cards/guidelines) and [NN/g progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/). Apply them to the existing noir club identity, not another app's visual style.
