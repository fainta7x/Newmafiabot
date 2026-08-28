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

  it('repairs a legacy 600 ₽ closed debt before CRM overview exposes it', async () => {
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

    for (let gameNumber = 1; gameNumber <= 6; gameNumber += 1) {
      const protocol = {
        version: 1,
        kind: 'club_evening_protocol',
        protocol: { game_id: String(gameNumber), status: 'completed', winner_team: 'red' },
        player_results: [{ participant_id: 'overview-pricing-participant', player_id: 'overview-pricing-player', seat_number: 1 }],
      };
      await db.run(
        `INSERT INTO games
         (evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at)
         VALUES ('overview-pricing-evening',?,?,'red','Победа красных',?,?,?)`,
        [gameNumber, now, JSON.stringify(protocol), JSON.stringify([{ participant_id: 'overview-pricing-participant', player_id: 'overview-pricing-player' }]), now],
      );
    }
    await db.run(
      `INSERT INTO financial_transactions
       (id,type,amount,category,description,player_id,evening_id,source_type,source_id,created_at)
       VALUES ('overview-legacy-debt','debt_created',600,'Неоплата за вечер','legacy','overview-pricing-player','overview-pricing-evening','evening_settle','overview-pricing-participant',?)`,
      [now],
    );

    const response = await request(app).get('/api/crm/overview').set('Cookie', cookie);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const row = response.body.actionLists.unpaidParticipants.find((item: any) => item.id === 'overview-pricing-participant');
    expect(row).toBeTruthy();
    expect(Number(row.amount_due)).toBe(400);
    expect(Number(row.amount_paid)).toBe(0);

    const totals = await db.get<any>(`
      SELECT
        COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) AS income,
        COALESCE(SUM(CASE WHEN type='debt_created' THEN amount ELSE 0 END),0) AS debt_created,
        COALESCE(SUM(CASE WHEN type='debt_paid' THEN amount ELSE 0 END),0) AS debt_paid
        FROM financial_transactions
       WHERE evening_id='overview-pricing-evening' AND source_id='overview-pricing-participant'
    `);
    expect(Number(totals.income) + Number(totals.debt_created)).toBe(400);
    expect(Number(totals.debt_created) - Number(totals.debt_paid)).toBe(400);
  });
});
