import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken, generatePlayerSessionToken } from '../server/auth.ts';

describe('player and CRM debt consistency', () => {
  let db: DatabaseWrapper;
  const now = '2026-09-09T12:00:00.000Z';

  beforeEach(() => { db = createDatabaseConnection(':memory:'); });
  afterEach(() => { try { db.sqlite.close(); } catch {} });

  it('does not turn a completed RSVP without factual attendance into a 500-ruble debt', async () => {
    await db.run("INSERT INTO players (id,nickname,lifecycle_status,created_at,updated_at) VALUES ('kawasaki','Kawasaki','normal',?,?)", [now, now]);
    await db.run("INSERT INTO game_evenings (id,title,starts_at,status,settled_at,created_at,updated_at) VALUES ('old-evening','Прошлый вечер',?,'completed',?,?,?)", [now, now, now, now]);
    await db.run(`INSERT INTO evening_participants
      (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
      VALUES ('false-debt','old-evening','kawasaki','going','going','pending','unknown','unpaid',500,0,?,?)`, [now, now]);

    const app = await createApp(db);
    const playerResponse = await request(app)
      .get('/api/player/payments')
      .set('Cookie', `player_token=${generatePlayerSessionToken('kawasaki')}`);
    expect(playerResponse.status, JSON.stringify(playerResponse.body)).toBe(200);
    expect(playerResponse.body.summary.historical_debt).toBe(0);
    expect(playerResponse.body.summary.outstanding).toBe(0);
    expect(playerResponse.body.current).toEqual([]);

    const crmResponse = await request(app)
      .get('/api/players')
      .set('Cookie', `organizer_token=${generateOrganizerToken()}`);
    expect(crmResponse.status, JSON.stringify(crmResponse.body)).toBe(200);
    expect(crmResponse.body.find((player: any) => player.id === 'kawasaki')?.outstanding_debt).toBe(0);
  });

  it('keeps upcoming payment separate while exposing the same attended historical debt to player and CRM', async () => {
    await db.run("INSERT INTO players (id,nickname,lifecycle_status,created_at,updated_at) VALUES ('player','Игрок','normal',?,?)", [now, now]);
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,status,settled_at,created_at,updated_at) VALUES
      ('closed','Закрытый вечер',?,'completed',?,?,?),
      ('upcoming','Будущий вечер','2026-09-16T17:00:00.000Z','published',NULL,?,?)`, [now, now, now, now, now, now]);
    await db.run(`INSERT INTO evening_participants
      (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
      VALUES
      ('real-debt','closed','player','going','going','attended','on_time','partial',400,100,?,?),
      ('planned','upcoming','player','going','going','pending','unknown','unpaid',400,0,?,?)`, [now, now, now, now]);

    const app = await createApp(db);
    const playerResponse = await request(app)
      .get('/api/player/payments')
      .set('Cookie', `player_token=${generatePlayerSessionToken('player')}`);
    expect(playerResponse.status, JSON.stringify(playerResponse.body)).toBe(200);
    expect(playerResponse.body.summary).toMatchObject({ historical_debt: 300, upcoming_due: 400, outstanding: 700 });
    expect(playerResponse.body.current.map((item: any) => item.participant_id)).toEqual(expect.arrayContaining(['real-debt', 'planned']));

    const crmResponse = await request(app)
      .get('/api/players')
      .set('Cookie', `organizer_token=${generateOrganizerToken()}`);
    expect(crmResponse.status, JSON.stringify(crmResponse.body)).toBe(200);
    expect(crmResponse.body.find((player: any) => player.id === 'player')?.outstanding_debt).toBe(300);
  });
});
