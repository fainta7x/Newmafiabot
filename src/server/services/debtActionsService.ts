import type { DatabaseWrapper } from '../../db/index.ts';
import { loadPlayerEveningDebts, type PlayerEveningDebt } from './playerEveningDebts.ts';
import { setClosedEveningParticipantPaid, setClosedEveningParticipantPaidAmount } from './closedEveningPaymentService.ts';
import { runCrmAutomations } from './crmAutomationService.ts';
import { playerPaymentReminderText, recentlyReminded } from './eveningPaymentReminderService.ts';
import { resolveOrganizerNotificationRecipientsWithAccess } from './organizerNotificationService.ts';
import { queuePersonalNotification } from './personalNotificationRouterService.ts';
import { round2 } from '../../shared/numbers.ts';

export class DebtActionError extends Error {
  constructor(message: string, readonly status = 400, readonly code = 'bad_request') { super(message); }
}

const moscowDay = (now: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(now);

/** All players who still owe for closed evenings, with the evenings behind each total (the existing grouped read). */
export const listDebtors = (db: DatabaseWrapper): Promise<PlayerEveningDebt[]> => loadPlayerEveningDebts(db);

/**
 * Confirms received payment for one player: one evening (`eveningId`) or every evening he still owes for. The write is the
 * same closed-evening payment write the evening card uses, so ledgers and automations follow the usual path.
 */
export async function markPlayerDebtPaid(db: DatabaseWrapper, playerId: string, eveningId?: string | null) {
  const debtor = (await loadPlayerEveningDebts(db)).find((group) => group.player_id === playerId);
  if (!debtor) throw new DebtActionError('Долгов у игрока нет — возможно, уже отмечено', 404, 'not_found');
  const evenings = eveningId ? debtor.evenings.filter((e) => e.evening_id === eveningId) : debtor.evenings;
  if (!evenings.length) throw new DebtActionError('Долга за этот вечер нет', 404, 'not_found');
  let amount = 0;
  for (const evening of evenings) {
    const participant = await db.get<{ id: string }>('SELECT id FROM evening_participants WHERE evening_id = ? AND player_id = ? LIMIT 1', [evening.evening_id, playerId]);
    if (!participant) continue;
    await setClosedEveningParticipantPaid(db, String(participant.id), true);
    amount += evening.owed;
  }
  await runCrmAutomations(db);
  return { nickname: debtor.nickname, evenings_paid: evenings.length, amount };
}

/**
 * A part of one evening's debt received by hand (owner, 2026-11-02: «на Сегодня кроме «Оплачено» — частичная оплата»). The amount is
 * added to what the player already paid for that evening; the same closed-evening write keeps the ledger and the status («partial»).
 */
export async function markPlayerDebtPartiallyPaid(db: DatabaseWrapper, playerId: string, eveningId: string, amount: number) {
  const debtor = (await loadPlayerEveningDebts(db)).find((group) => group.player_id === playerId);
  const evening = debtor?.evenings.find((e) => e.evening_id === eveningId);
  if (!debtor || !evening) throw new DebtActionError('Долга за этот вечер нет — возможно, уже отмечено', 404, 'not_found');
  const received = round2(amount);
  if (!Number.isFinite(received) || received <= 0) throw new DebtActionError('Введите сумму больше нуля');
  if (received >= evening.owed) return markPlayerDebtPaid(db, playerId, eveningId);
  const participant = await db.get<{ id: string; amount_paid: number }>('SELECT id, amount_paid FROM evening_participants WHERE evening_id = ? AND player_id = ? LIMIT 1', [eveningId, playerId]);
  if (!participant) throw new DebtActionError('Участник не найден', 404, 'not_found');
  await setClosedEveningParticipantPaidAmount(db, String(participant.id), round2(Number(participant.amount_paid || 0) + received));
  await runCrmAutomations(db);
  return { nickname: debtor.nickname, evenings_paid: 0, amount: received, remaining: round2(evening.owed - received) };
}

/**
 * «Напомнить должникам» (organizer's button): one summed reminder per debtor to the usual personal channel. A player who got a
 * payment reminder in the last 20 h is skipped, so a double press never spams.
 */
export async function remindDebtors(db: DatabaseWrapper, now = Date.now()) {
  const result = { debtors: 0, queued: 0, skipped_recent: 0, undeliverable: 0 };
  for (const debtor of await loadPlayerEveningDebts(db)) {
    result.debtors += 1;
    if (await recentlyReminded(db, '', debtor.player_id, now)) { result.skipped_recent += 1; continue; }
    const queued = await queuePersonalNotification(db, {
      notificationKey: `evening-payment:manual:${debtor.player_id}:${moscowDay(now)}`, playerId: debtor.player_id,
      eventType: 'evening_payment_reminder', entityId: debtor.evenings[0]?.evening_id ?? null, text: playerPaymentReminderText(debtor), actionPath: '/player/wallet',
    });
    const status = String(queued?.delivery?.status || '');
    if (status === 'unroutable' || status === 'disabled') result.undeliverable += 1;
    else if (queued?.created) result.queued += 1;
  }
  return result;
}

/** Only the organizers who receive these notifications may press the buttons under them (same rule as the task buttons). */
export async function isOrganizerPresser(db: DatabaseWrapper, telegramUserId: unknown) {
  const presser = String(telegramUserId ?? '').trim();
  if (!presser) return false;
  const { recipients } = await resolveOrganizerNotificationRecipientsWithAccess(db);
  return recipients.map(String).includes(presser);
}
