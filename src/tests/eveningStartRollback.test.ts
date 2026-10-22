import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });
const cookie = () => `organizer_token=${generateOrganizerToken()}`;

describe('taking back a mistaken «Начать вечер» (owner, 2026-10-22)', () => {
  const seed = async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    const app = await createApp(db);
    const now = new Date().toISOString();
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
      VALUES ('ev','Пятница',?,'Europe/Moscow','CASUAL','active',20,100,?,?)`, [new Date(Date.now() + 3600_000).toISOString(), now, now]);
    return { db, app, now };
  };
  const startStep = async (app: any) => {
    const route = await request(app).get('/api/evenings/ev/route').set('Cookie', cookie());
    return route.body.stages.flatMap((stage: any) => stage.steps).find((step: any) => step.id === 'start');
  };

  it('an active evening without games offers the step back and returns to «published»', async () => {
    const { app } = await seed();
    expect(await startStep(app)).toMatchObject({ status: 'done', action: 'unstart' });
    const response = await request(app).patch('/api/evenings/ev').set('Cookie', cookie()).send({ status: 'published' });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.status).toBe('published');
  });

  it('with a game on the evening the step is not offered and the status cannot go back', async () => {
    const { db, app, now } = await seed();
    await db.run(`INSERT INTO games (evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at)
      VALUES ('ev',1,?,'draft','Черновик','{}','[]',?)`, [now, now]);
    expect((await startStep(app)).action).toBeUndefined();
    const response = await request(app).patch('/api/evenings/ev').set('Cookie', cookie()).send({ status: 'published' });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('evening_has_games');
  });
});
