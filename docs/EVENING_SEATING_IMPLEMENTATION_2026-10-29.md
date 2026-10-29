# Evening seating — implementation contract (owner decisions 2026-10-29)

Status: **implementation in progress**. This file is a scoped change note; approved product rules ultimately belong in `docs/BUSINESS_RULES.md`.

## Approved
- A player may reserve an exact **game + table + seat** immediately after signing up to that game, before the evening is confirmed. This is free now; keep its entitlement separable for later VIP.
- Confirmation/dispatch of «Сегодня играем», whether manual or automatic, triggers generation of an evening plan with no extra organizer approval.
- A plan can cover all games or an individual next game, separately for each table. Use registered slots and balance appearances; do not project future game winners or eliminations.
- An existing reservation is preserved by automatic generation. Only actual game starts commit a seat to played history; future planned seats must be released when reassigned.
- Each player/table owns a cycle of seat numbers. Avoid repeats within the same table until all available seats have been used, then restart that cycle. Another table has independent history. A new evening resets history.
- The organizer can change any player's reservations, game, table or seat and override any restriction, with a warning such as «Этот игрок сегодня уже сидел на этом слоте, рекомендуем посадить его на другое место».
- The player cannot bypass assignment restrictions. Self-service booking confirmation is shown in-app without extra personal message.
- Players see plans in the player cabinet; organizers see/edit them in CRM. Initially generated plans are messaged to the affected player. Organizer changes before evening start trigger a new personal message; after evening start, update in-app without additional notice.
- Preserve existing RSVP, prices, actual game results, roles and protocol save paths.

## Integration gates still required
1. Durable database schema for bookings and generated assignments, with uniqueness under concurrent bookings and separate started-game history.
2. Player and organizer GET/write APIs (organizer override must explicitly opt in and provide warning).
3. Player game-slot picker, table/seat booking UI, organizer preview/editor, accurate start-of-game handoff.
4. Idempotent «Сегодня играем» publication trigger for both manual and automatic flows, and personal message outbox with change detection.
5. Tests for database concurrency, multi-table, cancellations, late arrivals, incomplete tables, organizer overrides, booking reassignment, midnight/timezone handling, and end-to-end player/CRM flows.
6. Exact-head CI and deployment verification before release.

The current code in `src/lib/eveningSeating.ts` is **only a pure planning primitive**, not the finished feature. Do not claim booking or notifications are live.
