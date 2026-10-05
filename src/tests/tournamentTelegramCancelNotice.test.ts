import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); delete process.env.BOT_API_SECRET; });

async function setup(status: string) {
  process.env.BOT_API_SECRET = 'bot-secret-test';
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  const now = new Date().toISOString();
  await db.run(`INSERT INTO tournaments (id,title,date,status,created_at,updated_at) VALUES ('t','Кубок',?,?,?,?)`, [now, status, now, now]);
  await db.run("INSERT OR IGNORE INTO telegram_destinations (id,name,description) VALUES ('rating','Рейтинг','x')").catch(() => undefined);
  await db.run("INSERT INTO tournament_telegram_publications (tournament_id,destination_id,chat_id,message_id,sent_at,updated_at) VALUES ('t','rating','-300',77,?,?)", [now, now]);
  return { db, app };
}
const bot = (app: any) => ({
  plan: () => request(app).get('/api/bot/tournaments/t/telegram-plan').set('X-Bot-Token', 'bot-secret-test'),
  put: (body: any) => request(app).put('/api/bot/tournaments/t/telegram-publications/rating').set('X-Bot-Token', 'bot-secret-test').send(body),
});

describe('Telegram plan of a cancelled tournament', () => {
  it('is not announced any more and carries the id of an already sent cancellation notice', async () => {
    const { app } = await setup('cancelled');
    const api = bot(app);
    const first = await api.plan();
    expect(first.status).toBe(200);
    expect(first.body.desired_destination_ids).toEqual([]);
    expect(first.body.publications[0]).toMatchObject({ message_id: 77, cancel_notice_message_id: null });

    expect((await api.put({ cancel_notice_message_id: 901 })).status).toBe(200);
    expect((await api.plan()).body.publications[0]).toMatchObject({ message_id: 77, cancel_notice_message_id: 901 });
  });

  it('keeps the cancellation notice id when the announcement is saved again', async () => {
    const { app } = await setup('cancelled');
    const api = bot(app);
    await api.put({ cancel_notice_message_id: 901 });
    await api.put({ chat_id: '-300', message_id: 78 });
    expect((await api.plan()).body.publications[0]).toMatchObject({ message_id: 78, cancel_notice_message_id: 901 });
  });

  it('is still announced while the tournament is on', async () => {
    const { app } = await setup('draft');
    expect((await bot(app).plan()).body.desired_destination_ids).toEqual(['rating']);
  });

  it('refuses a notice for a tournament that was never announced there', async () => {
    const { app, db } = await setup('cancelled');
    await db.run('DELETE FROM tournament_telegram_publications');
    expect((await bot(app).put({ cancel_notice_message_id: 5 })).status).toBe(404);
  });
});
