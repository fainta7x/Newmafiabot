import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import {
  loadEveningDebtors, manualReminderSlot, paymentReminderText, runEveningPaymentReminders, sendEveningPaymentReminders,
} from '../server/services/eveningPaymentReminderService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

const DAY = 24 * 60 * 60 * 1000;
const at = (ms: number) => new Date(ms).toISOString();

async function setup(closedAtMs: number) {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  await createApp(db);
  const stamp = at(Date.now());
  await db.run(`INSERT INTO game_evenings (id,title,starts_at,status,settled_at,created_at,updated_at) VALUES ('e1','Игровой вечер — 2 октября',?, 'completed', ?, ?, ?)`, [at(closedAtMs - 10 * 3_600_000), at(closedAtMs), stamp, stamp]);
  const rows: Array<[string, string, number | null, string | null, number, number, string]> = [
    // id, nickname, telegram id, attendance, due, paid, payment status
    ['debtor', 'Денди', 111, 'attended', 300, 0, 'unpaid'],
    ['partly', 'Дина', 222, 'attended', 300, 100, 'partial'],
    ['paid', 'Матроскина', 333, 'attended', 200, 200, 'paid'],
    ['waived', 'Точка', 444, 'attended', 0, 0, 'waived'],
    ['absent', 'Отсутствовал', 555, 'no_show', 300, 0, 'unpaid'],
    ['nochannel', 'Без Telegram', null, 'attended', 100, 0, 'unpaid'],
  ];
  for (const [id, nickname, telegram, attendance, due, paid, status] of rows) {
    await db.run('INSERT INTO players (id,nickname,telegram_user_id,created_at,updated_at) VALUES (?,?,?,?,?)', [id, nickname, telegram, stamp, stamp]);
    await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,payment_status,amount_due,amount_paid,created_at,updated_at) VALUES (?,?,?,'going','confirmed',?,?,?,?,?,?)`, [`ep-${id}`, 'e1', id, attendance, status, due, paid, stamp, stamp]);
  }
  return db;
}
const reminders = (db: DatabaseWrapper) => db.all<any>("SELECT player_id, notification_key, text, status FROM personal_notification_deliveries WHERE event_type = 'evening_payment_reminder' ORDER BY player_id");

describe('reminders to the players who owe for an evening', () => {
  it('lists only those who attended, are not exempt and have paid less than they owe', async () => {
    const db = await setup(Date.now() - 2 * DAY);
    const debtors = await loadEveningDebtors(db, 'e1');
    expect(debtors.map((item) => `${item.nickname}:${item.owed}`).sort()).toEqual(['Денди:300', 'Дина:200', 'Без Telegram:100'].sort());
  });

  it('says how much, for what and how to pay, with the owner\'s transfer details and no app payment', () => {
    const text = paymentReminderText({ title: 'Игровой вечер — 2 октября', starts_at: '2026-10-02T18:00:00Z' }, { player_id: 'p', nickname: 'Дина', amount_due: 300, amount_paid: 100, owed: 200 });
    expect(text).toContain('Игровой вечер — 2 октября');
    expect(text).toContain('Осталось оплатить 200 ₽ (оплачено 100 ₽ из 300 ₽)');
    expect(text).toContain('+7 967 431-71-19 (Сбербанк)');
    expect(text).not.toMatch(/в приложении/i);
  });

  it('reminds each debtor once a day: a second press the same day sends nothing new', async () => {
    const db = await setup(Date.now() - 2 * DAY);
    const first = await sendEveningPaymentReminders(db, 'e1', manualReminderSlot());
    expect(first).toMatchObject({ debtors: 3, queued: 2, skipped_recent: 0, undeliverable: 1 });
    const second = await sendEveningPaymentReminders(db, 'e1', manualReminderSlot());
    expect(second.queued).toBe(0);
    expect(second.skipped_recent).toBeGreaterThanOrEqual(2);
    const rows = await reminders(db);
    expect(rows.filter((row) => row.status !== 'unroutable').map((row) => row.player_id).sort()).toEqual(['debtor', 'partly']);
    expect(rows.find((row) => row.player_id === 'paid')).toBeUndefined();
  });

  it('chases automatically a day and three days after the close, never evenings older than two weeks', async () => {
    const now = Date.now();
    const fresh = await setup(now - 6 * 3_600_000);
    expect(await runEveningPaymentReminders(fresh, now)).toBe(0);

    const oneDay = await setup(now - 26 * 3_600_000);
    expect(await runEveningPaymentReminders(oneDay, now)).toBe(2);
    expect((await reminders(oneDay)).map((row) => row.notification_key).filter((key) => key.includes('debtor'))).toEqual(['evening-payment:e1:debtor:auto1']);
    // the scan runs every minute: it must not repeat
    expect(await runEveningPaymentReminders(oneDay, now + 60_000)).toBe(0);
    // three days after the close the second reminder goes out (the first one is older than the daily limit)
    expect(await runEveningPaymentReminders(oneDay, now + 2 * DAY)).toBe(2);
    expect((await reminders(oneDay)).some((row) => row.notification_key.endsWith(':auto2'))).toBe(true);

    const old = await setup(now - 20 * DAY);
    expect(await runEveningPaymentReminders(old, now)).toBe(0);
  });
});
