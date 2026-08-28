import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index';
import { generateOrganizerToken } from '../server/auth';

describe('closed evening payment compatibility', () => {
  let db: DatabaseWrapper;
  const now = '2026-08-21T20:00:00.000Z';

  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
  });

  afterEach(() => {
    try { db.sqlite.close(); } catch {}
  });

  it('lets the Today wrapup legacy participant PATCH mark a closed-evening debt paid', async () => {
    const app = await createApp(db);
    const cookie = `organizer_token=${generateOrganizerToken()}`;

    await db.run(
      `INSERT INTO game_evenings
       (id,title,starts_at,timezone,format,status,capacity,default_price,settled_at,created_at,updated_at)
       VALUES ('wrapup-evening','21 августа',?,'Europe/Moscow','CASUAL','completed',20,100,?,?,?)`,
      [now, now, now, now],
    );
    await db.run(
      `INSERT INTO players (id,nickname,lifecycle_status,source,elo,tokens,created_at,updated_at)
       VALUES ('wrapup-player','Игрок','normal','test',1000,0,?,?)`,
      [now, now],
    );
    await db.run(
      `INSERT INTO evening_participants
       (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
       VALUES ('wrapup-participant','wrapup-evening','wrapup-player','going','going','attended','on_time','unpaid',100,0,?,?)`,
      [now, now],
    );

    const protocol = {
      version: 1,
      kind: 'club_evening_protocol',
      protocol: { game_id: '1', status: 'completed', winner_team: 'red' },
      player_results: [{ participant_id: 'wrapup-participant', player_id: 'wrapup-player', seat_number: 1 }],
    };
    await db.run(
      `INSERT INTO games
       (evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at)
       VALUES ('wrapup-evening',1,?,'red','Победа красных',?,?,?)`,
      [now, JSON.stringify(protocol), JSON.stringify([{ participant_id: 'wrapup-participant', player_id: 'wrapup-player' }]), now],
    );
    await db.run(
      `INSERT INTO financial_transactions
       (id,type,amount,category,description,player_id,evening_id,source_type,source_id,created_at)
       VALUES ('wrapup-debt','debt_created',100,'Неоплата за вечер','legacy','wrapup-player','wrapup-evening','evening_settle','wrapup-participant',?)`,
      [now],
    );

    const response = await request(app)
      .patch('/api/participants/wrapup-participant')
      .set('Cookie', cookie)
      .send({ amount_paid: 100, payment_status: 'paid' });

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.payment_status).toBe('paid');
    expect(Number(response.body.amount_paid)).toBe(100);

    const transaction = await db.get<any>(`
      SELECT COALESCE(SUM(amount), 0) AS amount
        FROM financial_transactions
       WHERE evening_id = 'wrapup-evening'
         AND source_id = 'wrapup-participant'
         AND type = 'debt_paid'
    `);
    expect(Number(transaction?.amount || 0)).toBe(100);
  });

  it('still rejects non-payment edits on a closed evening', async () => {
    const app = await createApp(db);
    const cookie = `organizer_token=${generateOrganizerToken()}`;

    await db.run(
      `INSERT INTO game_evenings
       (id,title,starts_at,timezone,format,status,capacity,default_price,settled_at,created_at,updated_at)
       VALUES ('locked-evening','21 августа',?,'Europe/Moscow','CASUAL','completed',20,100,?,?,?)`,
      [now, now, now, now],
    );
    await db.run(
      `INSERT INTO players (id,nickname,lifecycle_status,source,elo,tokens,created_at,updated_at)
       VALUES ('locked-player','Игрок 2','normal','test',1000,0,?,?)`,
      [now, now],
    );
    await db.run(
      `INSERT INTO evening_participants
       (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
       VALUES ('locked-participant','locked-evening','locked-player','going','going','attended','on_time','unpaid',100,0,?,?)`,
      [now, now],
    );

    const response = await request(app)
      .patch('/api/participants/locked-participant')
      .set('Cookie', cookie)
      .send({ notes: 'should stay locked' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('только для чтения');
  });
});
