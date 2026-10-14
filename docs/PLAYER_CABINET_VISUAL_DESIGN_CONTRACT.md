# Player cabinet — coherent visual scenes (14 October 2026)

Owner-approved implementation contract. The player cabinet must not be modernized piecemeal by only changing borders or colors. A screen is done only when its **full primary journey** is visually cohesive, interactive and useful on phone and desktop.

## Non-negotiable rules
- Use actual database-backed roles, results, votes, night shots, team records and participant identities. No mock interactions, invented ballots, implied checks or fake statistics.
- Lead with real visuals: interactive table schematic, relationship network, colored vote allocation, match posters, evening scoreboard, win-rate orbits. Supplemental numbers and text explain the visuals, not replace them.
- Preserve complete protocols in progressive disclosure, role and privacy restrictions, player links, back navigation, empty/error states and existing API contracts.
- Keep separate club seasons and rating seasons. Preserve compact mobile presentation and use desktop space intentionally.
- Do not alter the Awards or Learning screens as part of this design work.
- Keep page-level acceptance tests and full CI, security scans and UI preview green before merge.

## Screens included in visual-scenes rollout
1. Connections: **upper** “Кто с кем играет” is redesigned to a real relationship canvas (club triads, Don/mafia, Sheriff/citizen, rivalry, versatile pairs, acquaintances). **Lower** “Лучшие пары” must retain the same dark graphical language, profile links and role splits. Not merely one attractive sub-block.
2. Games catalog: replace plain repetitive lists with visually distinctive match posters and a results history graph, with real dates, role, seat, outcome and protocol links.
3. Individual game protocol: show the actual numbered round table and factions, player spotlight, confirmed results, complete day/night story and a graphical vote split using the source's *aggregate ballot counts* (do not fabricate who voted for whom). Include reveals, scoring, first kill, best moves and return/replay.
4. Past evening: an actual scoreboard report for red/black team victories, the player's own result and Elo, awards, facts and clickable match gallery; selected evening stays reflected in route.
5. Shared visual language: sophisticated muted noir, amber typography, rose red team, violet black team, accessible contrast and fallbacks.

## Limitations to verify with production data
- The current personal games summary may not provide individual vote and Elo deltas for every match; only show values backed by the API.
- “Night shots” are recorded shots, not proof of all nighttime actions. Historical protocols can be incomplete.
- Club stories members may provide names but no avatar URLs. Use intentional initials rather than invented photographs.

## Next acceptance pass
Use a real phone and desktop with an evening containing multiple matches, a revote, both teams and a reveal. Verify scroll density, relation diagrams, nested navigation/back, actual voting percentages, profile links, unknown and missing data.
