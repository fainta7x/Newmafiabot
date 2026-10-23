import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { runEveningStartQuestions } from '../server/services/eveningStartConfirmationService.ts';
import { needsEveningStartConfirmation } from '../server/services/eveningStartConfirmationStore.ts';
import { ensureWeeklyEveningAutomationSchema } from '../db/ensureWeeklyEveningAutomationSchema.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); vi.unstubAllEnvs(); });

// Friday 2030-11-01 21:00 Moscow; its announcement is due Monday 2030-10-28 19:00 Moscow.
const FRIDAY = '2030-11-01T21:00:00+03:00';
const mondayAt = (hhmm: string) => Date.parse(`2030-10-28T${hhmm}:00+03:00`);

const seed = async () => {
  vi.stubEnv('ORGANIZER_NOTIFICATION_IDS', '777');
  vi.stubEnv('BOT_API_SECRET', 'bot-secret');
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  const stamp = new Date().toISOString();
  await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
    VALUES ('ev','Игровой вечер — 1 ноября',?,'Europe/Moscow','CASUAL','published',20,100,?,?)`, [FRIDAY, stamp, stamp]);
  return { db, app };
};
const questions = (db: DatabaseWrapper) => db.all<any>("SELECT message_key, text, reply_markup_json FROM telegram_message_outbox WHERE event_type = 'evening_start_question' ORDER BY message_key");
const answer = (app: any, time: string, telegramUserId = '777') => request(app)
  .post('/api/bot/evenings/ev/first-game-start').set('X-Bot-Token', 'bot-secret').send({ time, telegram_user_id: telegramUserId });

describe('first-game time asked before the weekly announcement (owner, 2026-10-23)', () => {
  it('asks on Monday from 12:00 with 19:00 / 20:00 / 21:00, once a day, and says at 19:00 that the announcement waits', async () => {
    const { db } = await seed();
    expect(await runEveningStartQuestions(db, mondayAt('11:00'))).toBe(0);
    expect(await runEveningStartQuestions(db, mondayAt('12:05'))).toBe(1);
    expect(await runEveningStartQuestions(db, mondayAt('12:06'))).toBe(0);
    const [first] = await questions(db);
    expect(first.text).toContain('Во сколько первая игра?');
    expect(JSON.parse(first.reply_markup_json).inline_keyboard[0].map((b: any) => b.callback_data)).toEqual(['estart:ev:1900', 'estart:ev:2000', 'estart:ev:2100']);
    expect(await runEveningStartQuestions(db, mondayAt('19:01'))).toBe(1);
    expect((await questions(db)).some((row) => row.text.includes('Анонс вечера ждёт'))).toBe(true);
  });

  it('the answer sets the first game, sends no «перенос», and lets the announcement go', async () => {
    const { db, app } = await seed();
    const res = await answer(app, '20:00');
    expect(res.status).toBe(200);
    const evening = await db.get<any>("SELECT starts_at FROM game_evenings WHERE id = 'ev'");
    expect(new Date(evening.starts_at).toISOString()).toBe('2030-11-01T17:00:00.000Z');
    const slot = await db.get<any>("SELECT starts_at FROM evening_game_slots WHERE evening_id = 'ev' AND slot_number = 1");
    expect(new Date(slot.starts_at).toISOString()).toBe('2030-11-01T17:00:00.000Z');
    const notices = await db.get<any>("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'evening_reschedule_notices'");
    if (notices.n) expect((await db.get<any>("SELECT COUNT(*) AS n FROM evening_reschedule_notices")).n).toBe(0);
    expect(await needsEveningStartConfirmation(db, { id: 'ev', format: 'CASUAL' })).toBe(false);
    expect(await runEveningStartQuestions(db, mondayAt('12:05'))).toBe(0);
  });

  it('only organizers answer, only the offered times, and not after the announcement started', async () => {
    const { db, app } = await seed();
    expect((await answer(app, '20:00', '555')).status).toBe(403);
    expect((await answer(app, '18:30')).status).toBe(400);
    await ensureWeeklyEveningAutomationSchema(db);
    await db.run(`INSERT INTO club_weekly_automation_runs (automation_key, evening_id, kind, status, created_at, updated_at)
      VALUES ('weekly-announcement:ev', 'ev', 'weekly_announcement', 'done', 'x', 'x')`);
    expect((await answer(app, '20:00')).status).toBe(409);
    expect(await needsEveningStartConfirmation(db, { id: 'ev', format: 'CASUAL' })).toBe(false);
  });

  it('novice and rating evenings are not asked', async () => {
    const { db } = await seed();
    await db.run("UPDATE game_evenings SET format = 'NOVICE'");
    expect(await runEveningStartQuestions(db, mondayAt('12:05'))).toBe(0);
  });
});
