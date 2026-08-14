import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { loadEveningSlotPlan } from '../server/services/eveningSlotPlanningService.ts';
import { addSingleParticipantSchema, bulkAddParticipantsSchema } from '../server/validation.ts';

let db: DatabaseWrapper | null = null;

afterEach(() => {
  try { db?.sqlite.close(); } catch {}
  db = null;
});

describe('manual organizer add compatibility', () => {
  it('maps the legacy registration_status field to the canonical response', () => {
    expect(addSingleParticipantSchema.parse({ player_id: 'p1', registration_status: 'going' }).response_status).toBe('going');
    expect(bulkAddParticipantsSchema.parse({ player_ids: ['p1'], registration_status: 'late' }).response_status).toBe('late');
  });

  it('treats a legacy manual going add as the whole club evening and caps it at 400 rubles', async () => {
    db = createDatabaseConnection(':memory:');
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO game_evenings
        (id, title, starts_at, ends_at, timezone, venue, format, status, capacity, default_price, created_at, updated_at)
       VALUES ('ev-manual-add', 'Игровой вечер', '2026-08-14T20:00:00+03:00', '2026-08-15T02:00:00+03:00',
               'Europe/Moscow', 'Суп с Котом', 'CASUAL', 'active', 20, 100, ?, ?)`,
      [now, now],
    );
    await db.run(
      `INSERT INTO players (id, nickname, created_at, updated_at)
       VALUES ('player-manual-add', 'Ручной игрок', ?, ?)`,
      [now, now],
    );

    const plan = await loadEveningSlotPlan(db, 'ev-manual-add');
    expect(plan.slots).toHaveLength(6);

    await db.run(
      `INSERT INTO evening_participants
        (id, evening_id, player_id, response_status, registration_status,
         attendance_status, arrival_status, payment_status, amount_due, amount_paid,
         registered_at, confirmed_at, created_at, updated_at)
       VALUES ('participant-manual-add', 'ev-manual-add', 'player-manual-add', 'going', 'going',
               'pending', 'unknown', 'unpaid', 100, 0, ?, ?, ?, ?)`,
      [now, now, now, now],
    );

    const registrations = await db.get<any>(
      `SELECT COUNT(*) AS count FROM evening_slot_registrations
        WHERE participant_id='participant-manual-add'`,
    );
    const participant = await db.get<any>(
      `SELECT amount_due, payment_status FROM evening_participants
        WHERE id='participant-manual-add'`,
    );

    expect(Number(registrations?.count)).toBe(6);
    expect(Number(participant?.amount_due)).toBe(400);
    expect(participant?.payment_status).toBe('unpaid');
  });
});
