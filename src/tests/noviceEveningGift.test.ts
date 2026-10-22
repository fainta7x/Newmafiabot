import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

describe('«Подарить вечер» on a novice evening (owner, 2026-10-22)', () => {
  it('an experienced player at a novice evening can be gifted the evening and the closing keeps it free', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    const app = await createApp(db);
    const cookie = `organizer_token=${generateOrganizerToken()}`;
    const now = new Date().toISOString();
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
      VALUES ('nv','Новички',?,'Europe/Moscow','NOVICE','published',20,200,?,?)`, [new Date(Date.now() - 3600_000).toISOString(), now, now]);
    await db.run(`INSERT INTO players (id,nickname,game_level,created_at,updated_at) VALUES ('pl','Опытный','experienced',?,?)`, [now, now]);
    await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
      VALUES ('pt','nv','pl','going','going','attended','on_time','unpaid',400,0,?,?)`, [now, now]);

    const gift = await request(app).patch('/api/evenings/nv/payments/pt').set('Cookie', cookie).send({ waived: true, reason: 'Подарочный вечер' });
    expect(gift.status, JSON.stringify(gift.body)).toBe(200);
    expect(await db.get<any>("SELECT payment_status, amount_due FROM evening_participants WHERE id = 'pt'")).toMatchObject({ payment_status: 'waived', amount_due: 0 });

    // The closeout recounts novice charges first: a gifted evening stays at 0.
    const closeout = await request(app).get('/api/evenings/nv/closeout').set('Cookie', cookie);
    expect(closeout.status).toBe(200);
    expect(await db.get<any>("SELECT payment_status, amount_due FROM evening_participants WHERE id = 'pt'")).toMatchObject({ payment_status: 'waived', amount_due: 0 });
  });
});
