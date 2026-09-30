import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generatePlayerSessionToken } from '../server/auth.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

async function setup() {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  const now = new Date().toISOString();
  const later = new Date(Date.now() + 86400000).toISOString();
  await db.run(`INSERT INTO players (id,nickname,telegram_user_id,lifecycle_status,source,game_level,club_role,judge_level,organize_formats,created_at,updated_at)
    VALUES ('host','Хозяйка','host-tg','normal','telegram','club','member','none','CASUAL',?,?),
           ('plain','Просто игрок','plain-tg','normal','telegram','club','member','none',NULL,?,?)`, [now, now, now, now]);
  await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
    VALUES ('other','Чужой вечер',?,'Europe/Moscow','CASUAL','published',20,100,?,?),
           ('novice','Новички',?,'Europe/Moscow','NOVICE','published',20,200,?,?)`, [later, now, now, later, now, now]);
  const host = `player_token=${generatePlayerSessionToken('host')}`;
  const plain = `player_token=${generatePlayerSessionToken('plain')}`;
  return { db, app, host, plain, later };
}

describe('limited cabinet «Проводит вечера»', () => {
  it('reports the marks and lets the host read every evening and the player list', async () => {
    const { app, host, plain } = await setup();
    expect((await request(app).get('/api/auth/me').set('Cookie', host)).body.eventHostFormats).toEqual(['CASUAL']);
    expect((await request(app).get('/api/evenings/other/participants').set('Cookie', host)).status).toBe(200);
    expect((await request(app).get('/api/players').set('Cookie', host)).status).toBe(200);
    expect((await request(app).get('/api/players').set('Cookie', plain)).status).toBe(401);
    await request(app).post('/api/evenings').set('Cookie', host)
      .send({ title: 'Черновик', starts_at: new Date(Date.now() + 172800000).toISOString(), format: 'CASUAL', status: 'draft', capacity: 20 });
    const list = await request(app).get('/api/evenings').set('Cookie', host);
    const draft = list.body.find((item: any) => item.title === 'Черновик');
    expect(draft?.status).toBe('draft');
    expect(draft).not.toHaveProperty('total_revenue');
    const plainList = await request(app).get('/api/evenings').set('Cookie', plain);
    expect(plainList.body.some((item: any) => item.title === 'Черновик')).toBe(false);
  });

  it('creates only marked kinds, becomes their organizer and runs only own evenings', async () => {
    const { db, app, host, later } = await setup();
    const refused = await request(app).post('/api/evenings').set('Cookie', host)
      .send({ title: 'Рейтинг', starts_at: later, format: 'RATING', status: 'draft', capacity: 20 });
    expect(refused.status).toBe(401);
    await db.run("UPDATE players SET organize_formats = 'CASUAL,RATING,TOURNAMENT' WHERE id = 'host'");
    const tournament = await request(app).post('/api/evenings').set('Cookie', host)
      .send({ title: 'Турнир', starts_at: later, format: 'TOURNAMENT', status: 'draft', capacity: 10 });
    expect(tournament.status).toBe(401);
    await db.run("UPDATE players SET organize_formats = 'CASUAL' WHERE id = 'host'");

    const created = await request(app).post('/api/evenings').set('Cookie', host)
      .send({ title: 'Мой вечер', starts_at: later, format: 'CASUAL', status: 'draft', capacity: 20 });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const mine = String(created.body.id);
    expect(await db.get<any>('SELECT organizer_player_id FROM evening_staff_assignments WHERE evening_id = ?', [mine]))
      .toEqual({ organizer_player_id: 'host' });

    const renamed = await request(app).patch(`/api/evenings/${mine}`).set('Cookie', host).send({ title: 'Мой пятничный вечер' });
    expect(renamed.status, JSON.stringify(renamed.body)).toBe(200);
    expect((await request(app).patch(`/api/evenings/${mine}`).set('Cookie', host).send({ format: 'RATING' })).status).toBe(401);
    expect((await request(app).patch(`/api/evenings/${mine}/staff`).set('Cookie', host).send({ organizer_player_id: null })).status).toBe(401);
    expect((await request(app).delete(`/api/evenings/${mine}`).set('Cookie', host)).status).toBe(401);

    // Someone else's evening and the rest of the cabinet stay closed.
    expect((await request(app).patch('/api/evenings/other').set('Cookie', host).send({ title: 'Взлом' })).status).toBe(401);
    expect((await request(app).patch('/api/players/plain').set('Cookie', host).send({ game_level: 'tournament' })).status).toBe(401);
    expect((await request(app).get('/api/analytics').set('Cookie', host)).status).toBe(401);
  });

  it('loses the access when the mark is taken away or the player is blocked', async () => {
    const { db, app, host, later } = await setup();
    const created = await request(app).post('/api/evenings').set('Cookie', host)
      .send({ title: 'Мой вечер', starts_at: later, format: 'CASUAL', status: 'draft', capacity: 20 });
    const mine = String(created.body.id);
    await db.run("UPDATE players SET organize_formats = 'NOVICE' WHERE id = 'host'");
    expect((await request(app).patch(`/api/evenings/${mine}`).set('Cookie', host).send({ title: 'Ещё' })).status).toBe(401);
    // «Турниры» alone does not open the evening cabinet (it only allows being a tournament organizer).
    await db.run("UPDATE players SET organize_formats = 'TOURNAMENT' WHERE id = 'host'");
    expect((await request(app).get('/api/auth/me').set('Cookie', host)).body.eventHostFormats ?? []).toEqual([]);
    // Still the organizer of the evening she made: she runs it, but no longer edits it (owner, 2026-10-01).
    expect((await request(app).get('/api/auth/me').set('Cookie', host)).body.eventOrganizer).toBe(true);
    expect((await request(app).patch(`/api/evenings/${mine}`).set('Cookie', host).send({ title: 'Ещё раз' })).status).toBe(401);
    await db.run('UPDATE evening_staff_assignments SET organizer_player_id = NULL WHERE evening_id = ?', [mine]);
    expect((await request(app).get('/api/players').set('Cookie', host)).status).toBe(401);
    await db.run("UPDATE players SET organize_formats = 'CASUAL', contact_status = 'blocked' WHERE id = 'host'");
    expect((await request(app).get('/api/players').set('Cookie', host)).status).toBe(401);
  });

  it('an assigned «Организатор вечера» without marks runs only that evening (owner, 2026-10-01)', async () => {
    const { db, app, plain } = await setup();
    const now = new Date().toISOString();
    // Not assigned anywhere: no cabinet.
    expect((await request(app).get('/api/auth/me').set('Cookie', plain)).body.eventOrganizer).toBe(false);
    await db.run(`INSERT INTO evening_staff_assignments (evening_id, organizer_player_id, assigned_at, updated_at) VALUES ('other', 'plain', ?, ?)
      ON CONFLICT(evening_id) DO UPDATE SET organizer_player_id = 'plain'`, [now, now]);
    await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,attendance_status,payment_status,amount_due,amount_paid,created_at,updated_at)
      VALUES ('ep-host','other','host','going','pending','pending',100,0,?,?)`, [now, now]);
    expect((await request(app).get('/api/auth/me').set('Cookie', plain)).body).toMatchObject({ eventOrganizer: true, eventHostFormats: [] });
    expect((await request(app).get('/api/evenings').set('Cookie', plain)).status).toBe(200);
    expect((await request(app).get('/api/evenings/other/participants').set('Cookie', plain)).status).toBe(200);

    // Runs his evening: start it, mark an arrival.
    const started = await request(app).patch('/api/evenings/other').set('Cookie', plain).send({ status: 'active' });
    expect(started.status, JSON.stringify(started.body)).toBe(200);
    const arrived = await request(app).patch('/api/evenings/participants/ep-host').set('Cookie', plain).send({ attendance_status: 'attended' });
    expect(arrived.status, JSON.stringify(arrived.body)).not.toBe(401);

    // Does not change the evening itself, create evenings or touch another evening.
    expect((await request(app).patch('/api/evenings/other').set('Cookie', plain).send({ title: 'Другое' })).status).toBe(401);
    expect((await request(app).patch('/api/evenings/other').set('Cookie', plain).send({ default_price: 0 })).status).toBe(401);
    expect((await request(app).patch('/api/evenings/other/staff').set('Cookie', plain).send({ organizer_player_id: null })).status).toBe(401);
    expect((await request(app).post('/api/evenings').set('Cookie', plain).send({ title: 'Новый', starts_at: now, format: 'CASUAL', status: 'draft', capacity: 20 })).status).toBe(401);
    expect((await request(app).patch('/api/evenings/novice').set('Cookie', plain).send({ status: 'active' })).status).toBe(401);
  });
});
