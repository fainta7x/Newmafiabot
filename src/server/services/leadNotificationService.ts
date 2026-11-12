import type { DatabaseWrapper } from '../../db/index.ts';
import { enqueueOrganizerNotification, resolveOrganizerNotificationRecipientsWithAccess } from './organizerNotificationService.ts';
import { escapeTelegramHtml } from './personalNotificationText.ts';
import { leadReadyMessage, whenLabel } from './agendaMessageService.ts';
import { LEAD_SOURCE_LABELS } from './newcomerFunnelService.ts';

/**
 * The organizer's Telegram message about a new lead (owner, 2026-11-11: «приходит уведомление и задача»): who, how to reach, where from, and the
 * ready text to send. The task itself is the lead's item in «Дела». A lead the organizer added from the bot is not announced back to him.
 */
export async function notifyOrganizerAboutLead(db: DatabaseWrapper, playerId: string, via: 'self' | 'organizer') {
  if (via === 'organizer') return { queued: 0 };
  const lead = await db.get<{ nickname: string; contact_kind: string; contact_value: string; source: string | null; referred_by: string | null; evening_id: string | null; evening_starts_at: string | null }>(
    `SELECT p.nickname, l.contact_kind, l.contact_value, l.source, l.referred_by, l.evening_id, e.starts_at AS evening_starts_at
       FROM newcomer_leads l JOIN players p ON p.id = l.player_id LEFT JOIN game_evenings e ON e.id = l.evening_id WHERE l.player_id = ?`, [playerId]);
  if (!lead) return { queued: 0 };
  const how = lead.contact_kind === 'telegram' ? 'Telegram' : lead.contact_kind === 'vk' ? 'ВКонтакте' : 'телефон';
  const message = await leadReadyMessage(db, lead.nickname, lead.evening_id);
  const text = [
    `<b>Новый лид: ${escapeTelegramHtml(lead.nickname)}</b>`,
    `${how}: ${escapeTelegramHtml(lead.contact_value)}`,
    `Откуда: ${escapeTelegramHtml(LEAD_SOURCE_LABELS[lead.source || 'unknown'] || LEAD_SOURCE_LABELS.unknown)}${lead.referred_by ? ` · пригласил: ${escapeTelegramHtml(lead.referred_by)}` : ''}`,
    ...(lead.evening_starts_at ? [`Хочет прийти: ${escapeTelegramHtml(whenLabel(lead.evening_starts_at))}`] : []),
    '',
    'Текст для ответа:',
    `<code>${escapeTelegramHtml(message)}</code>`,
    '',
    'Ответили — нажмите «Написал» в «Делах».',
  ].join('\n');
  const chatUrl = lead.contact_kind === 'telegram' ? `https://t.me/${lead.contact_value.replace(/^@/, '')}` : lead.contact_kind === 'vk' ? lead.contact_value : null;
  return enqueueOrganizerNotification(db, {
    messageKey: `new-lead:${playerId}`, eventType: 'new_lead', entityId: playerId, text,
    replyMarkup: chatUrl ? { inline_keyboard: [[{ text: '💬 Открыть чат', url: chatUrl }]] } : null, openPath: '/admin',
  });
}

/** An organizer is whoever receives the club's organizer alerts (the same list), so the bot needs no second list of admins. */
export async function isOrganizerTelegramUser(db: DatabaseWrapper, telegramUserId: string) {
  const config = await resolveOrganizerNotificationRecipientsWithAccess(db);
  return config.recipients.map(String).includes(String(telegramUserId));
}
