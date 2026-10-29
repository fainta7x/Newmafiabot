import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { listDebtors, markPlayerDebtPaid, remindDebtors, isOrganizerPresser, DebtActionError } from '../server/services/debtActionsService.ts';
import { runOrganizerReminders } from '../server/services/organizerReminderService.ts';

// The accounting write itself (reconcile + ledger) is covered by the closed-evening payment tests; here only the wiring is checked.
vi.mock('../server/services/closedEveningPaymentService.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../server/services/closedEveningPaymentService.ts')>()),
  setClosedEveningParticipantPaid: async (db: DatabaseWrapper, participantId: string, paid: boolean) => {
    await db.run('UPDATE evening_participants SET amount_paid = CASE WHEN ? THEN amount_due ELSE 0 END, payment_status = ? WHERE id = ?', [paid ? 1 : 0, paid ? 'paid' : 'unpaid', participantId]);
  },
}));

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); vi.unstubAllEnvs(); });
const HOUR = 3_600_000;
const now = Date.parse('2026-10-22T09:30:00Z');

const seed = async () => {
  vi.stubEnv('ORGANIZER_NOTIFICATION_IDS', '777');
  vi.stubEnv('PLAYER_APP_URL', 'https://club.example');
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  await createApp(db);
  const stamp = new Date(now).toISOString();
  await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at) VALUES
    ('e1','Вечер 16.10',?,'Europe/Moscow','CASUAL','completed',20,100,?,?),('e2','Вечер 20.10',?,'Europe/Moscow','CASUAL','completed',20,100,?,?)`,
  [new Date(now - 6 * 24 * HOUR).toISOString(), stamp, stamp, new Date(now - 2 * 24 * HOUR).toISOString(), stamp, stamp]);
  await db.run(`INSERT INTO players (id,nickname,telegram_user_id,created_at,updated_at) VALUES ('p','Перец','555',?,?),('q','Квант','556',?,?)`, [stamp, stamp, stamp, stamp]);
  for (const [id, evening, player, due] of [['pt1', 'e1', 'p', 400], ['pt2', 'e2', 'p', 400], ['pt3', 'e2', 'q', 300]] as const) {
    await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
      VALUES (?,?,?,'going','going','attended','on_time','unpaid',?,0,?,?)`, [id, evening, player, due, stamp, stamp]);
  }
  return db;
};

describe('debt actions (owner, 2026-10-29)', () => {
  it('lists a player once with the total and every evening behind it', async () => {
    const db = await seed();
    const debtors = await listDebtors(db);
    expect(debtors.map((d) => [d.nickname, d.owed, d.evenings.length])).toEqual([['Перец', 800, 2], ['Квант', 300, 1]]);
  });

  it('confirms one evening or all evenings of a player', async () => {
    const db = await seed();
    expect(await markPlayerDebtPaid(db, 'p', 'e1')).toMatchObject({ evenings_paid: 1, amount: 400 });
    expect((await listDebtors(db)).find((d) => d.player_id === 'p')?.owed).toBe(400);
    expect(await markPlayerDebtPaid(db, 'p')).toMatchObject({ evenings_paid: 1, amount: 400 });
    expect((await listDebtors(db)).map((d) => d.player_id)).toEqual(['q']);
    await expect(markPlayerDebtPaid(db, 'p')).rejects.toBeInstanceOf(DebtActionError);
  });

  it('reminds each debtor once with one summed message and skips a double press', async () => {
    const db = await seed();
    const first = await remindDebtors(db, now);
    expect(first).toMatchObject({ debtors: 2, queued: 2 });
    const text = (await db.get<any>("SELECT text FROM telegram_message_outbox WHERE player_id='p' AND event_type='evening_payment_reminder'")).text;
    expect(text).toContain('Общий долг: 800');
    const second = await remindDebtors(db, now + 60_000);
    expect(second.queued).toBe(0);
    expect(second.skipped_recent).toBe(2);
  });

  it('only the notified organizers may press the buttons', async () => {
    const db = await seed();
    expect(await isOrganizerPresser(db, '777')).toBe(true);
    expect(await isOrganizerPresser(db, '555')).toBe(false);
  });

  it('the debts notification carries remind-all, a «paid» button per player and a link into the app', async () => {
    const db = await seed();
    await runOrganizerReminders(db, now);
    const row = await db.get<any>("SELECT reply_markup_json FROM telegram_message_outbox WHERE message_key LIKE 'organizer-debts:%'");
    const rows = JSON.parse(row.reply_markup_json).inline_keyboard.flat();
    expect(rows.some((b: any) => b.callback_data === 'odebt:remind')).toBe(true);
    expect(rows.filter((b: any) => String(b.callback_data).startsWith('odebt:paid:')).map((b: any) => b.text)).toEqual(['✅ Оплатил: Перец · 800 ₽', '✅ Оплатил: Квант · 300 ₽']);
    expect(rows.at(-1)).toMatchObject({ web_app: { url: 'https://club.example/admin' } });
  });
});
