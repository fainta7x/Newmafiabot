import type { DatabaseWrapper } from '../../db/index.ts';
import { loadPlayerEveningDebts, type PlayerEveningDebt } from './playerEveningDebts.ts';
import { setClosedEveningParticipantPaid } from './closedEveningPaymentService.ts';
import { runCrmAutomations } from './crmAutomationService.ts';
import { playerPaymentReminderText, recentlyReminded } from './eveningPaymentReminderService.ts';
import { resolveOrganizerNotificationRecipientsWithAccess } from './organizerNotificationService.ts';
import { queuePersonalNotification } from './personalNotificationRouterService.ts';

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
