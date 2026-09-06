# Evening guest and roster correction

Confirmed organizer requirements from the 2026-09-04 club evening:

1. A registered/known club player must remain manually addable to an evening and its games even when they are not part of the automatic Telegram invitation audience (for example an out-of-town player such as «Фандорин»). Automatic invitation eligibility and manual organizer selection are separate concerns.
2. An organizer can add an unregistered guest by nickname (phone optional) to an evening. The existing quick-guest backend identity may be reused. The same guest must then be usable in game registration/lineups without requiring Telegram registration.
3. The create-game flow must let the organizer add a known player or a new guest without leaving the game sheet. Selecting someone into an actual game is an explicit check-in and must leave the evening participant in a factually-attended state so the canonical server validation remains true.
4. Completed club-game identities need a narrow organizer-only repair operation. Repair is by seat and replaces only the participant/player/display identity; gameplay data (seat, role, fouls, exits, votes, shots, best move references, winner, bonuses) stays attached to that seat. Participant-id references in protocol fields must be rebased from the old participant to the replacement participant. After a completed-game repair, token settlement, Elo, achievements and evening payment reconciliation must be rerun using the canonical corrected game.
5. A replacement may be either an existing participant/player from the same evening or a newly-created quick guest. A known player who is not yet an evening participant may first be added to the evening by the repair operation. Do not silently merge identities by nickname if an explicit player_id is supplied.
6. Add a compact correction UI from the evening game card/protocol area: choose seat → existing club player / existing evening participant / new guest → confirm. It must show a destructive/correction confirmation and refresh the game list after success.
7. Historical production correction to support after deploy: on the club evening dated 2026-09-04 (Europe/Moscow), the second game occurrence currently attributed to «Чайник» should be replaced with a quick guest; every later game in that same evening that is still attributed to «Чайник» should be replaceable with «Фандорин». Do not hard-code or run an irreversible nickname-based production rewrite without an exact guarded migration or organizer confirmation.

Acceptance checks:
- manual player picker uses the CRM player list, not only announcement `eligible_now`;
- guest creation is visible from the evening roster and from create-game;
- a just-created guest can immediately occupy a game seat;
- create-game check-in and backend attendance validation agree;
- completed-game identity repair preserves seat gameplay data and canonical references;
- canonical derived data is reconciled after repair;
- focused tests cover manual non-audience player, quick guest, check-in, and seat identity repair.