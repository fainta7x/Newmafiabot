import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';

// With zod 4 `.partial()` kept `.default()`: a PATCH wrote defaults for fields it never mentioned.
const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });
const cookie = () => `organizer_token=${generateOrganizerToken()}`;

describe('a partial edit changes only what it names', () => {
  it('keeps a player\'s Elo and tokens when the card is edited', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    const app = await createApp(db);
    const now = new Date().toISOString();
    await db.run("INSERT INTO players (id,nickname,elo,tokens,created_at,updated_at) VALUES ('p','Игрок',1234,7,?,?)", [now, now]);
    expect((await request(app).patch('/api/players/p').set('Cookie', cookie()).send({ notes: 'заметка' })).status).toBe(200);
    expect(await db.get("SELECT elo, tokens, notes FROM players WHERE id = 'p'")).toEqual({ elo: 1234, tokens: 7, notes: 'заметка' });
  });

  it('keeps a draft evening a draft, with its kind and places, when only the title changes', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    const app = await createApp(db);
    const now = new Date().toISOString();
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
      VALUES ('e','Рейтинг','2030-01-10T19:00:00+03:00','Europe/Moscow','RATING','draft',14,300,?,?)`, [now, now]);
    const renamed = await request(app).patch('/api/evenings/e').set('Cookie', cookie()).send({ title: 'Рейтинговый вечер' });
    expect(renamed.status, JSON.stringify(renamed.body)).toBe(200);
    expect(await db.get("SELECT title, status, format, capacity, default_price FROM game_evenings WHERE id = 'e'"))
      .toEqual({ title: 'Рейтинговый вечер', status: 'draft', format: 'RATING', capacity: 14, default_price: 300 });
  });
});
