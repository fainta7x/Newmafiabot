import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { loadEveningSlotPlan } from '../server/services/eveningSlotPlanningService.ts';
import { replaceOrganizerPlayerSlotSelection } from '../server/services/organizerEveningSlotSelectionService.ts';

let db: DatabaseWrapper | null = null;

afterEach(() => {
  try { db?.sqlite.close(); } catch {}
  db = null;
});

describe('organizer evening slot selection', () => {
  it('persists exact games, applies the 400 ruble cap and can correct slots after check-in', async () => {
    db = createDatabaseConnection(':memory:');
    const now = new Date().toISOString();

    await db.run(
      `INSERT INTO game_evenings
        (id, title, starts_at, ends_at, timezone, venue, format, status, capacity, default_price, created_at, updated_at)
       VALUES ('ev-organizer-slots', 'Игровой вечер', '2026-08-14T20:00:00+03:00', '2026-08-15T02:00:00+03:00',
               'Europe/Moscow', 'Суп с Котом', 'CASUAL', 'active', 20, 100, ?, ?)`,
      [now, now],
    );
    await db.run(
      `INSERT INTO players (id, nickname, created_at, updated_at)
       VALUES ('player-organizer-slots', 'Тестовый игрок', ?, ?)`,
      [now, now],
    );

    const initial = await loadEveningSlotPlan(db, 'ev-organizer-slots');
    expect(initial.slots).toHaveLength(6);

    const allSlotIds = initial.slots.map((slot) => slot.id);
    const allGames = await replaceOrganizerPlayerSlotSelection(
      db,
      'ev-organizer-slots',
      'player-organizer-slots',
      allSlotIds,
    );
    expect(allGames.selection.games).toBe(6);
    expect(allGames.selection.total).toBe(400);

    let participant = await db.get<any>(
      `SELECT response_status, amount_due, payment_status, attendance_status
         FROM evening_participants
        WHERE evening_id='ev-organizer-slots' AND player_id='player-organizer-slots'`,
    );
    expect(participant?.response_status).toBe('going');
    expect(Number(participant?.amount_due)).toBe(400);
    expect(participant?.payment_status).toBe('unpaid');

    await db.run(
      `UPDATE evening_participants
          SET attendance_status='attended', arrival_status='on_time'
        WHERE evening_id='ev-organizer-slots' AND player_id='player-organizer-slots'`,
    );

    const corrected = await replaceOrganizerPlayerSlotSelection(
      db,
      'ev-organizer-slots',
      'player-organizer-slots',
      allSlotIds.slice(1, 4),
    );
    expect(corrected.selection.games).toBe(3);
    expect(corrected.selection.total).toBe(300);
    expect(corrected.selection.slot_ids).toEqual(allSlotIds.slice(1, 4));

    participant = await db.get<any>(
      `SELECT amount_due, attendance_status
         FROM evening_participants
        WHERE evening_id='ev-organizer-slots' AND player_id='player-organizer-slots'`,
    );
    expect(Number(participant?.amount_due)).toBe(300);
    expect(participant?.attendance_status).toBe('attended');

    const removed = await replaceOrganizerPlayerSlotSelection(
      db,
      'ev-organizer-slots',
      'player-organizer-slots',
      [],
    );
    expect(removed.selection.games).toBe(0);
    expect(removed.selection.total).toBe(0);
    expect(removed.selection.slot_ids).toEqual([]);

    participant = await db.get<any>(
      `SELECT response_status, amount_due, payment_status, attendance_status
         FROM evening_participants
        WHERE evening_id='ev-organizer-slots' AND player_id='player-organizer-slots'`,
    );
    expect(participant?.response_status).toBe('declined');
    expect(Number(participant?.amount_due)).toBe(0);
    expect(participant?.payment_status).toBe('waived');
    expect(participant?.attendance_status).toBe('attended');
  });
});
