import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureEveningSlotsSchema } from '../db/ensureEveningSlotsSchema.ts';
import { applyMillourtDuplicateMergeMigration } from '../db/mergeMillourtDuplicateMigration.ts';

let db: DatabaseWrapper | null = null;

afterEach(() => {
  try { db?.sqlite.close(); } catch {}
  db = null;
});

describe('Millourt duplicate cleanup', () => {
  it('keeps Millourt, transfers identity and history from Милорд, and is idempotent', async () => {
    db = createDatabaseConnection(':memory:');
    await ensureEveningSlotsSchema(db);
    const now = new Date().toISOString();

    await db.run(
      `INSERT INTO players (id, nickname, created_at, updated_at)
       VALUES ('millourt-keeper', 'Millourt', ?, ?)`,
      [now, now],
    );
    await db.run(
      `INSERT INTO players
        (id, telegram_user_id, nickname, full_name, telegram_username, created_at, updated_at)
       VALUES ('millourt-duplicate', '790467112', 'Милорд', '𝐌𝐈𝐋𝐋𝐎𝐔𝐑𝐓', 'themillourt', ?, ?)`,
      [now, now],
    );

    await db.run(
      `INSERT INTO game_evenings
        (id, title, starts_at, timezone, format, status, capacity, default_price, created_at, updated_at)
       VALUES ('ev-millourt', 'Вечер', '2026-08-14T20:00:00+03:00', 'Europe/Moscow', 'CASUAL', 'published', 20, 100, ?, ?)`,
      [now, now],
    );
    await db.run(
      `INSERT INTO evening_game_slots
        (id, evening_id, slot_number, starts_at, ends_at, price_rub, target_players, status, created_at, updated_at)
       VALUES ('slot-millourt', 'ev-millourt', 1, '2026-08-14T20:00:00+03:00', '2026-08-14T21:00:00+03:00', 100, 11, 'open', ?, ?)`,
      [now, now],
    );
    await db.run(
      `INSERT INTO evening_participants
        (id, evening_id, player_id, response_status, registration_status, attendance_status, arrival_status,
         payment_status, amount_due, amount_paid, created_at, updated_at)
       VALUES ('ep-keeper', 'ev-millourt', 'millourt-keeper', 'unanswered', 'unanswered', 'pending', 'unknown',
               'unpaid', 0, 0, ?, ?)`,
      [now, now],
    );
    await db.run(
      `INSERT INTO evening_participants
        (id, evening_id, player_id, response_status, registration_status, attendance_status, arrival_status,
         payment_status, amount_due, amount_paid, created_at, updated_at)
       VALUES ('ep-duplicate', 'ev-millourt', 'millourt-duplicate', 'going', 'going', 'pending', 'unknown',
               'unpaid', 100, 0, ?, ?)`,
      [now, now],
    );
    await db.run(
      `INSERT INTO organizer_tasks
        (id, title, type, status, priority, player_id, created_at, updated_at)
       VALUES ('task-millourt', 'Позвонить', 'call', 'todo', 'medium', 'millourt-duplicate', ?, ?)`,
      [now, now],
    );

    await applyMillourtDuplicateMergeMigration(db);

    const players = await db.all<any>(
      "SELECT id, nickname, telegram_user_id, full_name, telegram_username FROM players WHERE nickname IN ('Millourt','Милорд') ORDER BY nickname",
    );
    expect(players).toHaveLength(1);
    expect(players[0]).toMatchObject({
      id: 'millourt-keeper',
      nickname: 'Millourt',
      telegram_user_id: '790467112',
      full_name: '𝐌𝐈𝐋𝐋𝐎𝐔𝐑𝐓',
      telegram_username: 'themillourt',
    });

    const participant = await db.get<any>(
      "SELECT id, player_id, response_status FROM evening_participants WHERE evening_id='ev-millourt'",
    );
    expect(participant).toMatchObject({ id: 'ep-keeper', player_id: 'millourt-keeper', response_status: 'going' });

    const registration = await db.get<any>(
      "SELECT participant_id FROM evening_slot_registrations WHERE slot_id='slot-millourt'",
    );
    expect(registration?.participant_id).toBe('ep-keeper');

    const task = await db.get<any>("SELECT player_id FROM organizer_tasks WHERE id='task-millourt'");
    expect(task?.player_id).toBe('millourt-keeper');

    await applyMillourtDuplicateMergeMigration(db);
    const afterSecondRun = await db.get<any>(
      "SELECT COUNT(*) AS count FROM players WHERE nickname IN ('Millourt','Милорд')",
    );
    expect(Number(afterSecondRun?.count)).toBe(1);
  });
});
