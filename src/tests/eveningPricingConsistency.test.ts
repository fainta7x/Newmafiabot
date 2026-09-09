import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index';
import { generateOrganizerToken, generatePlayerSessionToken } from '../server/auth';
import { ensureSlotsForEvening } from '../server/services/eveningSlotPlanningService';

describe('canonical evening pricing consistency', () => {
  let db: DatabaseWrapper;
  const now = '2026-08-21T20:00:00.000Z';

  beforeEach(() => {
    db = createDatabaseConnection(':memory:');
  });

  afterEach(() => {
    try { db.sqlite.close(); } catch {}
  });

  it('keeps regular slot selection as an estimate and never persists planned debt', async () => {
    await createApp(db);
    await db.run(
      `INSERT INTO game_evenings
       (id,title,starts_at,ends_at,timezone,format,status,capacity,default_price,created_at,updated_at)
       VALUES ('slot-cap-evening','Friday','2026-08-28T20:00:00+03:00','2026-08-29T02:00:00+03:00','Europe/Moscow','CASUAL','published',20,600,?,?)`,
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

    const slotPlan = await ensureSlotsForEvening(db, 'slot-cap-evening');
    const slots = slotPlan.slots;
    expect(slots).toHaveLength(6);
    expect(slotPlan.evening.default_price).toBe(100);
    expect(slotPlan.settings.price_per_game).toBe(100);
    expect(slots.every((slot: any) => Number(slot.price_rub) === 100)).toBe(true);

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
    expect(participant).toMatchObject({ amount_due: 0, payment_status: 'waived' });

    await db.run('DELETE FROM evening_slot_registrations WHERE slot_id=? AND participant_id=?', [slots[5].id, 'slot-cap-participant']);
    await db.run('UPDATE evening_game_slots SET price_rub=600 WHERE id=?', [slots[0].id]);
    const normalizedPlan = await ensureSlotsForEvening(db, 'slot-cap-evening');
    participant = await db.get<any>('SELECT amount_due,payment_status FROM evening_participants WHERE id=?', ['slot-cap-participant']);
    expect(participant).toMatchObject({ amount_due: 0, payment_status: 'waived' });
    expect(normalizedPlan.slots.every((slot: any) => Number(slot.price_rub) === 100)).toBe(true);
  });

  it('automatically backfills legacy 600 ₽ and exposes one canonical debt in CRM and Player Cabinet', async () => {
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

    const protocol = JSON.stringify({
      version: 1,
      kind: 'club_evening_protocol',
      protocol: { status: 'completed' },
      player_results: [{ participant_id: 'overview-pricing-participant' }],
    });
    for (let gameNumber = 1; gameNumber <= 3; gameNumber += 1) {
      await db.run(
        `INSERT INTO games (
          evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at
        ) VALUES (?,?,?,'red','Красные',?,'[]',?)`,
        ['overview-pricing-evening', gameNumber, now, protocol, now],
      );
    }

    const app = await createApp(db);
    const canonical = await db.get<any>(
      'SELECT amount_due,amount_paid,payment_status FROM evening_participants WHERE id=?',
      ['overview-pricing-participant'],
    );
    const evening = await db.get<any>('SELECT default_price FROM game_evenings WHERE id=?', ['overview-pricing-evening']);
    expect(canonical).toMatchObject({ amount_due: 300, amount_paid: 0, payment_status: 'unpaid' });
    expect(Number(evening?.default_price)).toBe(100);

    const beforeReads = { ...canonical };
    const crmResponse = await request(app)
      .get('/api/crm/overview')
      .set('Cookie', `organizer_token=${generateOrganizerToken()}`);
    expect(crmResponse.status, JSON.stringify(crmResponse.body)).toBe(200);
    expect(crmResponse.body.actionLists.unpaidParticipants).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'overview-pricing-participant', amount_due: 300 }),
    ]));

    const playerResponse = await request(app)
      .get('/api/player/payments')
      .set('Cookie', `player_token=${generatePlayerSessionToken('overview-pricing-player')}`);
    expect(playerResponse.status, JSON.stringify(playerResponse.body)).toBe(200);
    expect(playerResponse.body.summary.historical_debt).toBe(300);

    const afterReads = await db.get<any>(
      'SELECT amount_due,amount_paid,payment_status FROM evening_participants WHERE id=?',
      ['overview-pricing-participant'],
    );
    expect(afterReads).toEqual(beforeReads);
  });
});
