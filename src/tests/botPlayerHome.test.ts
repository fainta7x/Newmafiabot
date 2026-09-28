import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); delete process.env.BOT_API_SECRET; });

describe('bot «Мои записи»', () => {
  it('lists the player’s open sign-ups with game counts and the token balance', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    const app = await createApp(db);
    const now = new Date().toISOString();
    await db.run(`INSERT INTO players (id,nickname,telegram_user_id,contact_status,lifecycle_status,judge_level,elo,tokens,created_at,updated_at)
      VALUES ('p','Лиса','555','normal','normal','none',1000,900,?,?)`, [now, now]);
    for (const [id, status, response] of [['open', 'published', 'going'], ['declined', 'published', 'declined'], ['done', 'completed', 'going']]) {
      await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
        VALUES (?,'Вечер','2026-10-02T19:00:00+03:00','Europe/Moscow','CASUAL',?,20,100,?,?)`, [id, status, now, now]);
      await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,registration_status,response_status,attendance_status,payment_status,created_at,updated_at)
        VALUES (?,?,'p',?,?,'pending','unpaid',?,?)`, [`ep-${id}`, id, response, response, now, now]);
    }
    process.env.BOT_API_SECRET = 'bot-secret-test';
    const res = await request(app).get('/api/bot/players/by-telegram/555/home').set('X-Bot-Token', 'bot-secret-test');
    expect(res.status).toBe(200);
    expect(res.body.player).toMatchObject({ nickname: 'Лиса', tokens: 900 });
    expect(typeof res.body.player.game_level).toBe('string');
    expect(res.body.evenings.map((row: any) => [row.id, row.response_status, row.games])).toEqual([['open', 'going', 0]]);

    const missing = await request(app).get('/api/bot/players/by-telegram/999/home').set('X-Bot-Token', 'bot-secret-test');
    expect(missing.status).toBe(404);
  });
});
