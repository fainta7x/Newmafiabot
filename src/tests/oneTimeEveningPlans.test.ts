import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureSlotsForEvening } from '../server/services/eveningSlotPlanningService.ts';
import { runOneTimeEveningPlans } from '../server/services/oneTimeEveningPlans.ts';

let db: DatabaseWrapper | null = null;
afterEach(() => { try { db?.sqlite.close(); } catch {} db = null; });

const clubFriday = async () => {
  db = createDatabaseConnection(':memory:');
  await createApp(db);
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO game_evenings (id, title, starts_at, ends_at, timezone, venue, format, status, capacity, default_price, created_at, updated_at)
     VALUES ('club', 'Игровой вечер — 2 октября', '2026-10-02T20:00:00+03:00', '2026-10-03T02:00:00+03:00', 'Europe/Moscow', 'Суп с Котом', 'CASUAL', 'published', 20, 100, ?, ?)`,
    [now, now],
  );
  await ensureSlotsForEvening(db, 'club');
};

describe('one-time plan for 2 October', () => {
  it('moves the club evening to 21:00 and opens a novice evening at 19:00, once', async () => {
    await clubFriday();
    const first = await runOneTimeEveningPlans(db!, new Date('2026-09-28T12:00:00Z'), { inTests: true });
    // The general «club evenings at 21:00» plan moves the club evening first; the 2 October plan then only opens the novice evening.
    expect(first).toEqual({ ran: true, actions: ['novice_created'] });

    const club = await db!.get<any>("SELECT starts_at FROM game_evenings WHERE id = 'club'");
    expect(new Date(club.starts_at).toISOString()).toBe('2026-10-02T18:00:00.000Z');
    const clubSlots = await db!.all<any>("SELECT starts_at FROM evening_game_slots WHERE evening_id = 'club' ORDER BY slot_number");
    expect(new Date(clubSlots[0].starts_at).toISOString()).toBe('2026-10-02T18:00:00.000Z');

    const novice = await db!.get<any>("SELECT id, status, starts_at FROM game_evenings WHERE format = 'NOVICE'");
    expect(novice.status).toBe('published');
    expect(new Date(novice.starts_at).toISOString()).toBe('2026-10-02T16:00:00.000Z');
    const noviceSlots = await db!.all<any>('SELECT starts_at FROM evening_game_slots WHERE evening_id = ? ORDER BY slot_number', [novice.id]);
    expect(noviceSlots.map((slot) => new Date(slot.starts_at).toISOString().slice(11, 16))).toEqual(['16:00', '17:00']);

    expect(await runOneTimeEveningPlans(db!, new Date('2026-09-28T13:00:00Z'), { inTests: true })).toEqual({ ran: false, reason: 'already_done' });
    expect(Number((await db!.get<any>("SELECT COUNT(*) AS count FROM game_evenings WHERE format = 'NOVICE'")).count)).toBe(1);
  });

  it('keeps what the organizer already did and never runs after the evening starts', async () => {
    await clubFriday();
    const now = new Date().toISOString();
    await db!.run("UPDATE game_evenings SET starts_at = '2026-10-02T21:00:00+03:00' WHERE id = 'club'");
    await db!.run(
      `INSERT INTO game_evenings (id, title, starts_at, timezone, format, status, capacity, default_price, created_at, updated_at)
       VALUES ('mine', 'Мой вечер новичков', '2026-10-02T19:00:00+03:00', 'Europe/Moscow', 'NOVICE', 'draft', 20, 200, ?, ?)`,
      [now, now],
    );
    expect(await runOneTimeEveningPlans(db!, new Date('2026-10-02T16:00:00Z'), { inTests: true })).toEqual({ ran: false, reason: 'too_late' });
    expect(await runOneTimeEveningPlans(db!, new Date('2026-09-29T10:00:00Z'), { inTests: true })).toEqual({ ran: true, actions: ['novice_opened'] });
    expect(Number((await db!.get<any>("SELECT COUNT(*) AS count FROM game_evenings WHERE format = 'NOVICE'")).count)).toBe(1);
  });
});

describe('club evenings start at 21:00', () => {
  it('moves upcoming club evenings from 20:00 to 21:00 once and leaves started ones alone', async () => {
    const { moveUpcomingClubEveningsTo21 } = await import('../server/services/oneTimeEveningPlans.ts');
    db = createDatabaseConnection(':memory:');
    await createApp(db);
    const now = new Date().toISOString();
    for (const [id, startsAt] of [['future', '2026-10-09T20:00:00+03:00'], ['past', '2026-09-25T20:00:00+03:00'], ['late', '2026-10-16T21:00:00+03:00']]) {
      await db.run(
        `INSERT INTO game_evenings (id, title, starts_at, ends_at, timezone, venue, format, status, capacity, default_price, created_at, updated_at)
         VALUES (?, 'Игровой вечер', ?, NULL, 'Europe/Moscow', 'Суп с Котом', 'CASUAL', 'published', 20, 100, ?, ?)`,
        [id, startsAt, now, now],
      );
    }
    expect(await moveUpcomingClubEveningsTo21(db, new Date('2026-09-28T12:00:00Z'), { inTests: true })).toEqual({ ran: true, moved: 1 });
    const starts = await db.all<any>('SELECT id, starts_at FROM game_evenings ORDER BY id');
    expect(Object.fromEntries(starts.map((row: any) => [row.id, new Date(row.starts_at).toISOString()]))).toEqual({
      future: '2026-10-09T18:00:00.000Z', late: '2026-10-16T18:00:00.000Z', past: '2026-09-25T17:00:00.000Z',
    });
    expect(await moveUpcomingClubEveningsTo21(db, new Date('2026-09-28T12:00:00Z'), { inTests: true })).toEqual({ ran: false, moved: 0 });
  });
});
