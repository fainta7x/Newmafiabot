import { randomUUID } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { enqueueTelegramMessage, getTelegramMessageDiagnostics, kickTelegramMessageOutbox } from './telegramMessageOutboxService.ts';

const parseIds = (value: unknown): string[] => Array.from(new Set(
  String(value || '').split(',').map((item) => item.trim()).filter((item) => /^-?\d+$/.test(item)),
));

const enabled = (value: unknown) => ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());

export type OrganizerRecipientSource = 'ORGANIZER_NOTIFICATION_IDS' | 'ORGANIZER_CHAT_ID' | 'BACKUP_ADMIN_ID' | 'none';

export function resolveOrganizerNotificationRecipients(env: NodeJS.ProcessEnv = process.env) {
  const direct = parseIds(env.ORGANIZER_NOTIFICATION_IDS);
  if (direct.length) return { recipients: direct, source: 'ORGANIZER_NOTIFICATION_IDS' as const, fallback: false };
  const chat = parseIds(env.ORGANIZER_CHAT_ID);
  if (chat.length) return { recipients: chat, source: 'ORGANIZER_CHAT_ID' as const, fallback: false };
  if (enabled(env.ORGANIZER_NOTIFICATION_USE_BACKUP)) {
    const backup = parseIds(env.BACKUP_ADMIN_ID);
    if (backup.length) return { recipients: backup.slice(0, 1), source: 'BACKUP_ADMIN_ID' as const, fallback: true };
  }
  return { recipients: [], source: 'none' as const, fallback: false };
}

export async function getOrganizerNotificationDiagnostics(db: DatabaseWrapper) {
  const config = resolveOrganizerNotificationRecipients();
  const delivery = await getTelegramMessageDiagnostics(db);
  return {
    configured_recipient_count: config.recipients.length,
    recipient_source: config.source,
    using_backup_fallback: config.fallback,
    queue_size: delivery.queue_size,
    latest_success: delivery.latest_success,
    latest_failure: delivery.latest_failure,
  };
}

export async function enqueueOrganizerNotification(db: DatabaseWrapper, input: {
  messageKey: string;
  eventType: string;
  entityId: string;
  text: string;
}) {
  const config = resolveOrganizerNotificationRecipients();
  for (const chatId of config.recipients) {
    await enqueueTelegramMessage(db, {
      messageKey: `${input.messageKey}:${chatId}`,
      category: 'organizer',
      eventType: input.eventType,
      entityId: input.entityId,
      chatId,
      text: input.text,
    });
  }
  if (config.recipients.length) kickTelegramMessageOutbox(db);
  return { queued: config.recipients.length, recipient_source: config.source };
}

export async function enqueueOrganizerTestNotification(db: DatabaseWrapper) {
  const config = resolveOrganizerNotificationRecipients();
  if (!config.recipients.length) throw new Error('Организаторы для Telegram-уведомлений не настроены');
  const eventId = randomUUID();
  const stamp = new Date().toLocaleString('ru-RU');
  await enqueueOrganizerNotification(db, {
    messageKey: `organizer-test:${eventId}`,
    eventType: 'test_notification',
    entityId: eventId,
    text: `✅ <b>Тест уведомлений 2LA Noire</b>\n${stamp}\nЕсли вы видите это сообщение, серверная доставка Telegram работает.`,
  });
  return { queued: config.recipients.length, recipient_source: config.source, using_backup_fallback: config.fallback };
}