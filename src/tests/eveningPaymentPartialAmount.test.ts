import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index';
import { generateOrganizerToken } from '../server/auth';

describe('payments: a part of the sum by hand (owner, 2026-10-22)', () => {
  let db: DatabaseWrapper;
  const now = '2026-10-16T20:00:00.000Z';
  beforeEach(() => { db = createDatabaseConnection(':memory:'); });
  afterEach(() => { try { db.sqlite.close(); } catch {} });

  const seed = async (status: 'completed' | 'published') => {
    const app = await createApp(db);
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,settled_at,created_at,updated_at)
      VALUES ('ev','Вечер',?,'Europe/Moscow','RATING',?,20,100,?,?,?)`, [now, status, status === 'completed' ? now : null, now, now]);
    await db.run(`INSERT INTO players (id,nickname,lifecycle_status,source,elo,tokens,created_at,updated_at) VALUES ('pl','Перец','normal','test',1000,0,?,?)`, [now, now]);
    await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
      VALUES ('pt','ev','pl','going','going','attended','on_time','unpaid',400,0,?,?)`, [now, now]);
    if (status === 'completed') {
      await db.run(`INSERT INTO financial_transactions (id,type,amount,category,description,player_id,evening_id,source_type,source_id,created_at)
        VALUES ('d','debt_created',400,'Неоплата за вечер','x','pl','ev','evening_settle','pt',?)`, [now]);
    }
    return { app, cookie: `organizer_token=${generateOrganizerToken()}` };
  };
  const ledger = async () => db.get<any>(`SELECT COALESCE(SUM(CASE WHEN type='debt_created' THEN amount ELSE 0 END),0) AS created,
    COALESCE(SUM(CASE WHEN type='debt_paid' THEN amount ELSE 0 END),0) AS paid FROM financial_transactions WHERE source_id = 'pt'`);

  it('closed evening: a part is a debt payment, the rest stays a debt, and it can be corrected both ways', async () => {
    const { app, cookie } = await seed('completed');
    let response = await request(app).patch('/api/evenings/ev/payments/pt').set('Cookie', cookie).send({ amount_paid: 150 });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    let participant = await db.get<any>("SELECT amount_paid, payment_status FROM evening_participants WHERE id = 'pt'");
    expect(participant).toMatchObject({ amount_paid: 150, payment_status: 'partial' });
    expect(await ledger()).toMatchObject({ created: 400, paid: 150 });

    response = await request(app).patch('/api/evenings/ev/payments/pt').set('Cookie', cookie).send({ amount_paid: 100 });
    expect(response.status).toBe(200);
    expect(await ledger()).toMatchObject({ paid: 100 });

    response = await request(app).patch('/api/evenings/ev/payments/pt').set('Cookie', cookie).send({ amount_paid: 400 });
    expect(response.status).toBe(200);
    participant = await db.get<any>("SELECT amount_paid, payment_status FROM evening_participants WHERE id = 'pt'");
    expect(participant).toMatchObject({ amount_paid: 400, payment_status: 'paid' });
    expect(await ledger()).toMatchObject({ paid: 400 });

    response = await request(app).patch('/api/evenings/ev/payments/pt').set('Cookie', cookie).send({ amount_paid: 0 });
    participant = await db.get<any>("SELECT amount_paid, payment_status FROM evening_participants WHERE id = 'pt'");
    expect(participant).toMatchObject({ amount_paid: 0, payment_status: 'unpaid' });
    expect(await ledger()).toMatchObject({ paid: 0 });
  });

  it('refuses a sum above the price or below zero', async () => {
    const { app, cookie } = await seed('completed');
    expect((await request(app).patch('/api/evenings/ev/payments/pt').set('Cookie', cookie).send({ amount_paid: 401 })).status).toBe(400);
    expect((await request(app).patch('/api/evenings/ev/payments/pt').set('Cookie', cookie).send({ amount_paid: -1 })).status).toBe(400);
  });
});
