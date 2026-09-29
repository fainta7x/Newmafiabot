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
    expect((await request(app).get('/api/players').set('Cookie', host)).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Cookie', host)).body.eventHostFormats ?? []).toEqual([]);
    await db.run("UPDATE players SET organize_formats = 'CASUAL', contact_status = 'blocked' WHERE id = 'host'");
    expect((await request(app).get('/api/players').set('Cookie', host)).status).toBe(401);
  });
});
