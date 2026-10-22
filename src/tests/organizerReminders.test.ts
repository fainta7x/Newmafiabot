import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { runOrganizerReminders } from '../server/services/organizerReminderService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); vi.unstubAllEnvs(); });
const HOUR = 3_600_000;
// 2026-10-22 12:30 Moscow
const now = Date.parse('2026-10-22T09:30:00Z');

const seed = async () => {
  vi.stubEnv('ORGANIZER_NOTIFICATION_IDS', '777');
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  await createApp(db);
  return db;
};
const sent = (db: DatabaseWrapper) => db.all<any>("SELECT message_key, text, chat_id FROM telegram_message_outbox WHERE category = 'organizer' AND event_type = 'organizer_reminder' ORDER BY message_key");

describe('organizer reminders in Telegram (owner, 2026-10-22)', () => {
  it('tells what is open on the route three hours before an evening, once', async () => {
    const db = await seed();
    const stamp = new Date(now).toISOString();
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
      VALUES ('ev','Пятница',?,'Europe/Moscow','CASUAL','published',20,100,?,?)`, [new Date(now + 2.5 * HOUR).toISOString(), stamp, stamp]);
    expect(await runOrganizerReminders(db, now)).toBeGreaterThan(0);
    const first = await sent(db);
    const route = first.find((row) => row.message_key.startsWith('organizer-route:ev:3h'));
    expect(route?.chat_id).toBe('777');
    expect(route?.text).toContain('Пятница');
    expect(route?.text).toContain('Ещё открыто');
    // The same minute scan again sends nothing new.
    await runOrganizerReminders(db, now + 60_000);
    expect(await sent(db)).toHaveLength(first.length);
  });

  it('reminds about an evening that was never closed, the debts after closed evenings and overdue tasks', async () => {
    const db = await seed();
    const stamp = new Date(now).toISOString();
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
      VALUES ('old','Вечер для новичков 16.10',?,'Europe/Moscow','NOVICE','published',20,200,?,?),
             ('done','Клубный вечер',?,'Europe/Moscow','CASUAL','completed',20,100,?,?)`,
    [new Date(now - 6 * 24 * HOUR).toISOString(), stamp, stamp, new Date(now - 5 * 24 * HOUR).toISOString(), stamp, stamp]);
    await db.run(`INSERT INTO players (id,nickname,created_at,updated_at) VALUES ('p','Должник',?,?)`, [stamp, stamp]);
    await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
      VALUES ('pt','done','p','going','going','attended','on_time','partial',400,150,?,?)`, [stamp, stamp]);
    await db.run(`INSERT INTO organizer_tasks (id,title,type,status,priority,due_at,created_at,updated_at) VALUES ('t','Позвонить Диссонансу','call','todo','medium',?,?,?)`,
      [new Date(now - 2 * HOUR).toISOString(), stamp, stamp]);
    await runOrganizerReminders(db, now);
    const rows = await sent(db);
    expect(rows.find((row) => row.message_key.startsWith('organizer-unclosed:old'))?.text).toContain('ещё не закрыт');
    expect(rows.find((row) => row.message_key.startsWith('organizer-debts:'))?.text).toContain('250 ₽');
    expect(rows.find((row) => row.message_key.startsWith('organizer-tasks:'))?.text).toContain('Позвонить Диссонансу');
  });

  it('keeps quiet in the early morning', async () => {
    const db = await seed();
    const stamp = new Date(now).toISOString();
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
      VALUES ('old','Старый',?,'Europe/Moscow','CASUAL','published',20,100,?,?)`, [new Date(now - 6 * 24 * HOUR).toISOString(), stamp, stamp]);
    expect(await runOrganizerReminders(db, Date.parse('2026-10-22T03:00:00Z'))).toBe(0); // 06:00 Moscow
  });
});
