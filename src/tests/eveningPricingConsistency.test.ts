import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index';
import { generateOrganizerToken } from '../server/auth';
import { ensureSlotsForEvening } from '../server/services/eveningSlotPlanningService';

describe('canonical evening pricing consistency', () => {
  let db: DatabaseWrapper;
  const now = '2026-08-21T20:00:00.000Z';

  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    await createApp(db);
  });

  afterEach(() => {
    try { db.sqlite.close(); } catch {}
  });

  it('never lets slot triggers charge more than 400 ₽ for a regular club evening', async () => {
    await db.run(
      `INSERT INTO game_evenings
       (id,title,starts_at,ends_at,timezone,format,status,capacity,default_price,created_at,updated_at)
       VALUES ('slot-cap-evening','Friday','2026-08-28T20:00:00+03:00','2026-08-29T02:00:00+03:00','Europe/Moscow','CASUAL','published',20,100,?,?)`,
      [now, now],
    );
    await db.run(
      `INSERT INTO players (id,nickname,lifecycle_status,source,elo,tokens,created_at,updated_at)
       VALUES ('slot-cap-player','Cap Player','normal','test',1000,0,?,?)`,
      [now, now],
    );
    await db.run(
      `INSERT INTO evening_participants
       (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
       VALUES ('slot-cap-participant','slot-cap-evening','slot-cap-player','thinking','thinking','pending','unknown','waived',0,0,?,?)`,
      [now, now],
    );

    const slots = (await ensureSlotsForEvening(db, 'slot-cap-evening')).slots;
    expect(slots).toHaveLength(6);
    for (const slot of slots) {
      await db.run(
        `INSERT INTO evening_slot_registrations (id,slot_id,participant_id,created_at,updated_at)
         VALUES (?,?,?,?,?)`,
        [`reg-${slot.slot_number}`, slot.id, 'slot-cap-participant', now, now],
      );
    }

    let participant = await db.get<any>(
      'SELECT amount_due,payment_status FROM evening_participants WHERE id=?',
      ['slot-cap-participant'],
    );
    expect(participant).toMatchObject({ amount_due: 400, payment_status: 'unpaid' });

    await db.run('DELETE FROM evening_slot_registrations WHERE slot_id=? AND participant_id=?', [slots[5].id, 'slot-cap-participant']);
    participant = await db.get<any>('SELECT amount_due FROM evening_participants WHERE id=?', ['slot-cap-participant']);
    expect(Number(participant?.amount_due)).toBe(400);

    await db.run('DELETE FROM evening_slot_registrations WHERE slot_id=? AND participant_id=?', [slots[4].id, 'slot-cap-participant']);
    participant = await db.get<any>('SELECT amount_due FROM evening_participants WHERE id=?', ['slot-cap-participant']);
    expect(Number(participant?.amount_due)).toBe(400);

    await db.run('DELETE FROM evening_slot_registrations WHERE slot_id=? AND participant_id=?', [slots[3].id, 'slot-cap-participant']);
    participant = await db.get<any>('SELECT amount_due FROM evening_participants WHERE id=?', ['slot-cap-participant']);
    expect(Number(participant?.amount_due)).toBe(300);

    await db.run('UPDATE evening_game_slots SET price_rub=250 WHERE id=?', [slots[0].id]);
    participant = await db.get<any>('SELECT amount_due FROM evening_participants WHERE id=?', ['slot-cap-participant']);
    expect(Number(participant?.amount_due)).toBe(400);
  });

  it('keeps CRM overview read-only for already stored closed-evening debts', async () => {
    const app = await createApp(db);
    const cookie = `organizer_token=${generateOrganizerToken()}`;

    await db.run(
      `INSERT INTO game_evenings
       (id,title,starts_at,timezone,format,status,capacity,default_price,settled_at,created_at,updated_at)
       VALUES ('overview-pricing-evening','Игровой вечер — 21 августа',?,'Europe/Moscow','CASUAL','completed',20,600,?,?,?)`,
      [now, now, now, now],
    );
    await db.run(
      `INSERT INTO players (id,nickname,lifecycle_status,source,elo,tokens,created_at,updated_at)
       VALUES ('overview-pricing-player','Millourt','normal','test',1000,0,?,?)`,
      [now, now],
    );
    await db.run(
      `INSERT INTO evening_participants
       (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
       VALUES ('overview-pricing-participant','overview-pricing-evening','overview-pricing-player','going','going','attended','on_time','unpaid',600,0,?,?)`,
      [now, now],
    );

    const before = await db.get<any>('SELECT amount_due,updated_at FROM evening_participants WHERE id=?', ['overview-pricing-participant']);
    const response = await request(app).get('/api/crm/overview').set('Cookie', cookie);
    const after = await db.get<any>('SELECT amount_due,updated_at FROM evening_participants WHERE id=?', ['overview-pricing-participant']);

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.actionLists.unpaidParticipants).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'overview-pricing-participant', amount_due: 600 }),
    ]));
    expect(after).toEqual(before);
  });
});
