import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { runOrganizerReminders } from '../server/services/organizerReminderService.ts';
import { organizerTaskButtons, tomorrowMorningMoscow } from '../server/services/organizerTaskQuickActions.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); vi.unstubAllEnvs(); });
const HOUR = 3_600_000;
// 2026-10-22 12:30 Moscow
const now = Date.parse('2026-10-22T09:30:00Z');

const seed = async () => {
  vi.stubEnv('ORGANIZER_NOTIFICATION_IDS', '777');
  vi.stubEnv('BOT_API_SECRET', 'bot-secret');
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  const stamp = new Date(now).toISOString();
  await db.run(`INSERT INTO organizer_tasks (id,title,type,status,priority,due_at,created_at,updated_at) VALUES ('t1','Позвонить Диссонансу','call','todo','medium',?,?,?)`,
    [new Date(now - 2 * HOUR).toISOString(), stamp, stamp]);
  return { db, app };
};
const press = (app: any, action: string, telegramUserId: string, taskId = 't1') => request(app)
  .post(`/api/bot/organizer-tasks/${taskId}/action`)
  .set('X-Bot-Token', 'bot-secret')
  .send({ action, telegram_user_id: telegramUserId });

describe('quick answers to organizer tasks from Telegram (owner, 2026-10-23)', () => {
  it('the overdue-tasks reminder carries «✅ Сделано» and «⏰ Завтра» for each task', async () => {
    const { db } = await seed();
    await runOrganizerReminders(db, now);
    const row = await db.get<any>("SELECT reply_markup_json FROM telegram_message_outbox WHERE message_key LIKE 'organizer-tasks:%'");
    const markup = JSON.parse(row.reply_markup_json);
    expect(markup.inline_keyboard[0].map((button: any) => button.callback_data)).toEqual(['otask:done:t1', 'otask:snooze:t1']);
  });

  it('«Сделано» closes the task', async () => {
    const { db, app } = await seed();
    const res = await press(app, 'done', '777');
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Позвонить Диссонансу');
    expect((await db.get<any>("SELECT status, completed_at FROM organizer_tasks WHERE id = 't1'")).status).toBe('done');
  });

  it('«Завтра» moves the deadline to tomorrow 10:00 Moscow and keeps the task open', async () => {
    const { db, app } = await seed();
    expect((await press(app, 'snooze', '777')).status).toBe(200);
    const task = await db.get<any>("SELECT status, due_at FROM organizer_tasks WHERE id = 't1'");
    expect(task.status).toBe('todo');
    expect(new Date(task.due_at).getTime()).toBeGreaterThan(Date.now());
    expect(new Date(task.due_at).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' })).toBe('10:00');
  });

  it('only the organizers who receive the notifications may press, and an unknown task is reported', async () => {
    const { db, app } = await seed();
    expect((await press(app, 'done', '555')).status).toBe(403);
    expect((await db.get<any>("SELECT status FROM organizer_tasks WHERE id = 't1'")).status).toBe('todo');
    expect((await press(app, 'done', '777', 'missing')).status).toBe(404);
    expect((await press(app, 'delete', '777')).status).toBe(400);
    const noToken = await request(app).post('/api/bot/organizer-tasks/t1/action').send({ action: 'done', telegram_user_id: '777' });
    expect(noToken.status).toBe(401);
  });

  it('a task closed elsewhere is not postponed, and «Сделано» on it does not reopen or fail', async () => {
    const { db, app } = await seed();
    expect((await press(app, 'done', '777')).status).toBe(200);
    const doneAt = (await db.get<any>("SELECT completed_at FROM organizer_tasks WHERE id = 't1'")).completed_at;
    expect((await press(app, 'snooze', '777')).status).toBe(409);
    expect((await press(app, 'done', '777')).status).toBe(200);
    const task = await db.get<any>("SELECT status, completed_at FROM organizer_tasks WHERE id = 't1'");
    expect(task).toEqual({ status: 'done', completed_at: doneAt });
    await db.run("UPDATE organizer_tasks SET status = 'cancelled' WHERE id = 't1'");
    expect((await press(app, 'done', '777')).status).toBe(409);
    expect((await db.get<any>("SELECT status FROM organizer_tasks WHERE id = 't1'")).status).toBe('cancelled');
  });

  it('tomorrow 10:00 Moscow is the same just before and after Moscow midnight', () => {
    expect(tomorrowMorningMoscow(Date.parse('2026-10-22T20:59:00Z'))).toBe('2026-10-23T07:00:00.000Z');
    expect(tomorrowMorningMoscow(Date.parse('2026-10-22T21:01:00Z'))).toBe('2026-10-24T07:00:00.000Z');
  });

  it('a task id longer than Telegram allows in a button gets no buttons', () => {
    expect(organizerTaskButtons([{ id: 'x'.repeat(60), title: 'Длинный' }])).toBeNull();
  });
});
