# Day starter rotation

Live Game must rotate the first speaker from the **actual previous day starter**, not from the numeric day/round index.

- Day 1 starts from seat 1 (or the first alive seat clockwise if seat 1 is unavailable).
- Each next day starts from the first alive seat clockwise after the previous day's actual starter.
- Eliminated/removed players are skipped.
- The selected starter is part of the live snapshot so undo/session restore keeps the same order.

Regression example: if seats 2–5 are already out and seat 6 started the previous day, the next day starts with seat 7, never seat 6 again merely because a nominal round start falls into the dead 2–5 range.
