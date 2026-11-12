import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); delete process.env.BOT_API_SECRET; });

describe('bot announcement recipients carry their own club price (owner, 2026-11-11)', () => {
  it('gives a regular and a stopped player different price and cap', async () => {
    process.env.BOT_API_SECRET = 'secret';
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    const app = await createApp(db);
    const now = new Date().toISOString();
    const startsAt = new Date(Date.now() + 48 * 3600_000).toISOString();
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at) VALUES ('e1','Вечер',?,'Europe/Moscow','CASUAL','published',20,100,?,?)`, [startsAt, now, now]);
    for (const [id, tg, extra] of [['reg', '1001', "club_role='member', attends_sometimes=0, stopped_attending=0"], ['gone', '1002', "club_role='guest', attends_sometimes=1, stopped_attending=1"]] as const) {
      await db.run(`INSERT INTO players (id,nickname,lifecycle_status,source,elo,tokens,telegram_user_id,created_at,updated_at) VALUES (?,?, 'normal','test',1000,0,?,?,?)`, [id, id, tg, now, now]);
      await db.run(`UPDATE players SET ${extra} WHERE id = ?`, [id]);
    }
    const response = await request(app).get('/api/bot/evenings/e1/announcement-recipients').set('X-Bot-Token', 'secret');
    expect(response.status).toBe(200);
    const byId = new Map((response.body.recipients as any[]).map((row) => [row.id, row]));
    expect(byId.get('reg')).toMatchObject({ price_per_game: 100, max_price: 400 });
    expect(byId.get('gone')).toMatchObject({ price_per_game: 200, max_price: 800 });
  });
});
