import type { DatabaseWrapper } from '../../db/index.ts';
import { queuePersonalNotification } from './personalNotificationRouterService.ts';

/**
 * Reminders to the players who have not paid for a club evening (owner, 2026-10-05): a button for the organizer and an
 * automatic reminder a day and three days after the evening closed. A person gets at most one reminder a day for an
 * evening; the text says how much and for what, and how to pay (the app cannot take payments yet).
 */
export const PAYMENT_REMINDER_MIN_GAP_MS = 20 * 60 * 60 * 1000;
export const AUTO_REMINDER_FIRST_MS = 24 * 60 * 60 * 1000;
export const AUTO_REMINDER_SECOND_MS = 3 * 24 * 60 * 60 * 1000;
// Older evenings are not chased automatically: an old unpaid line is usually a missed bookkeeping entry, not a debt.
export const AUTO_REMINDER_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

const DEFAULT_PAYMENT_DETAILS = 'переводом на номер +7 967 431-71-19 (Сбербанк)';
const paymentDetails = () => String(process.env.CLUB_PAYMENT_DETAILS || '').trim() || DEFAULT_PAYMENT_DETAILS;

export type EveningDebtor = { player_id: string; nickname: string; amount_due: number; amount_paid: number; owed: number };

/** Those who attended, are not exempt and have paid less than they owe (the same people «Дела» lists as «Не оплатили»). */
export async function loadEveningDebtors(db: DatabaseWrapper, eveningId: string): Promise<EveningDebtor[]> {
  const rows = await db.all<any>(
    `SELECT ep.player_id, COALESCE(p.nickname, 'Игрок') AS nickname, ep.amount_due, ep.amount_paid
       FROM evening_participants ep
  LEFT JOIN players p ON p.id = ep.player_id
      WHERE ep.evening_id = ? AND ep.attendance_status = 'attended' AND ep.player_id IS NOT NULL
        AND COALESCE(ep.payment_status, '') <> 'waived'
        AND COALESCE(ep.amount_due, 0) > COALESCE(ep.amount_paid, 0)`,
    [eveningId],
  );
  return rows.map((row) => ({
    player_id: String(row.player_id), nickname: String(row.nickname),
    amount_due: Number(row.amount_due || 0), amount_paid: Number(row.amount_paid || 0),
    owed: Math.round(Number(row.amount_due || 0) - Number(row.amount_paid || 0)),
  }));
}

const rubles = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₽`;
const moscowDate = (value: unknown) => {
  const time = new Date(String(value || '')).getTime();
  return Number.isFinite(time) ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' }).format(time) : '';
};

export const paymentReminderText = (evening: { title?: string | null; starts_at?: string | null }, debtor: EveningDebtor) => {
  const date = moscowDate(evening.starts_at);
  const partly = debtor.amount_paid > 0 ? ` (оплачено ${rubles(debtor.amount_paid)} из ${rubles(debtor.amount_due)})` : '';
  return [
    '💰 Напоминание об оплате',
    '',
    `Ты играл на вечере «${evening.title || 'Игровой вечер'}»${date ? ` ${date}` : ''}. Осталось оплатить ${rubles(debtor.owed)}${partly}.`,
    `Оплатить можно ${paymentDetails()}.`,
    'Если уже заплатил, напиши организатору, и он отметит оплату.',
  ].join('\n');
};

const recentlyReminded = async (db: DatabaseWrapper, eveningId: string, playerId: string, now: number) => {
  const row = await db.get<any>(
    `SELECT MAX(created_at) AS last FROM personal_notification_deliveries WHERE notification_key LIKE ? AND player_id = ?`,
    [`evening-payment:${eveningId}:${playerId}:%`, playerId],
  ).catch(() => null);
  const last = row?.last ? new Date(String(row.last)).getTime() : 0;
  return last > 0 && now - last < PAYMENT_REMINDER_MIN_GAP_MS;
};

const moscowDay = (now: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(now);

export type PaymentReminderResult = { debtors: number; queued: number; skipped_recent: number; undeliverable: number };

/** Sends the reminder to everybody who still owes for the evening. `slot` makes the message idempotent (manual: the day). */
export async function sendEveningPaymentReminders(db: DatabaseWrapper, eveningId: string, slot: string, now = Date.now(), onlyPlayerIds?: Set<string>): Promise<PaymentReminderResult> {
  const evening = await db.get<any>('SELECT id, title, starts_at FROM game_evenings WHERE id = ? LIMIT 1', [eveningId]);
  const result: PaymentReminderResult = { debtors: 0, queued: 0, skipped_recent: 0, undeliverable: 0 };
  if (!evening) return result;
  for (const debtor of await loadEveningDebtors(db, eveningId)) {
    if (onlyPlayerIds && !onlyPlayerIds.has(debtor.player_id)) continue;
    result.debtors += 1;
    if (await recentlyReminded(db, eveningId, debtor.player_id, now)) { result.skipped_recent += 1; continue; }
    const queued = await queuePersonalNotification(db, {
      notificationKey: `evening-payment:${eveningId}:${debtor.player_id}:${slot}`,
      playerId: debtor.player_id,
      eventType: 'evening_payment_reminder',
      entityId: eveningId,
      text: paymentReminderText(evening, debtor),
      actionPath: '/player/wallet',
    });
    const status = String(queued?.delivery?.status || '');
    if (status === 'unroutable' || status === 'disabled') result.undeliverable += 1;
    else if (queued?.created) result.queued += 1;
  }
  return result;
}

export const manualReminderSlot = (now = Date.now()) => `manual-${moscowDay(now)}`;

/**
 * Every minute (from the club result scan): evenings closed within the last 14 days remind their debtors a day after the
 * close and once more after three days. The first run after a deploy reaches the current debtors at once.
 */
export async function runEveningPaymentReminders(db: DatabaseWrapper, now = Date.now()) {
  const evenings = await db.all<any>(
    `SELECT id, COALESCE(settled_at, updated_at) AS closed_at FROM game_evenings
      WHERE status = 'completed' AND datetime(COALESCE(settled_at, updated_at)) >= datetime(?) AND datetime(COALESCE(settled_at, updated_at)) <= datetime(?)`,
    [new Date(now - AUTO_REMINDER_WINDOW_MS).toISOString(), new Date(now - AUTO_REMINDER_FIRST_MS).toISOString()],
  ).catch(() => []);
  let queued = 0;
  for (const evening of evenings) {
    const age = now - new Date(String(evening.closed_at)).getTime();
    const slot = age >= AUTO_REMINDER_SECOND_MS ? 'auto2' : 'auto1';
    try { queued += (await sendEveningPaymentReminders(db, String(evening.id), slot, now)).queued; } catch (error) { console.error('[PAYMENT REMINDERS] evening failed:', evening.id, error); }
  }
  return queued;
}
