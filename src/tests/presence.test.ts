import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken, generatePlayerSessionToken } from '../server/auth.ts';
import { loadPresence, recordPresence, ONLINE_MS } from '../server/services/presenceService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

async function setup() {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  const stamp = new Date().toISOString();
  await db.run('INSERT INTO players (id,nickname,created_at,updated_at) VALUES (?,?,?,?)', ['p1', 'Аня', stamp, stamp]);
  return { db, app };
}

describe('«Сейчас в приложении»', () => {
  it('shows the owner who is online and on which screen; anonymous visitors are ignored', async () => {
    const { app } = await setup();
    await request(app).post('/api/presence').send({ screen: '/player/events/2f6a3c1e-1111-4b8e-9f00-000000000001' }).expect(204);
    await request(app).post('/api/presence').set('Cookie', `player_token=${generatePlayerSessionToken('p1')}`)
      .send({ screen: '/player/events/2f6a3c1e-1111-4b8e-9f00-000000000001' }).expect(204);
    const owner = `organizer_token=${generateOrganizerToken()}`;
    const list = await request(app).get('/api/presence').set('Cookie', owner).expect(200);
    expect(list.body.online).toEqual([expect.objectContaining({ player_id: 'p1', nickname: 'Аня', screen: '/player/events/:id' })]);
    await request(app).get('/api/presence').set('Cookie', `player_token=${generatePlayerSessionToken('p1')}`).expect(401);
  });

  it('forgets a person after the online window and keeps time on the same screen', async () => {
    const { db } = await setup();
    const start = Date.parse('2030-01-01T12:00:00Z');
    recordPresence(db, 'p1', '/player', start);
    recordPresence(db, 'p1', '/player', start + 30_000);
    expect((await loadPresence(db, start + 30_000))[0].on_screen_seconds).toBe(30);
    recordPresence(db, 'p1', '/player/rating', start + 45_000);
    expect((await loadPresence(db, start + 45_000))[0]).toMatchObject({ screen: '/player/rating', on_screen_seconds: 0 });
    expect(await loadPresence(db, start + 45_000 + ONLINE_MS + 1)).toEqual([]);
  });
});
