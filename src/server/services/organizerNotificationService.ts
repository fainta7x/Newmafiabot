import { randomUUID } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureOrganizerPlayerAccessSchema } from '../../db/ensureOrganizerPlayerAccessSchema.ts';
import { enqueueTelegramMessage, getTelegramMessageDiagnostics, kickTelegramMessageOutbox } from './telegramMessageOutboxService.ts';

const parseIds = (value: unknown): string[] => Array.from(new Set(
  String(value || '').split(',').map((item) => item.trim()).filter((item) => /^-?\d+$/.test(item)),
));

const enabled = (value: unknown) => ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());

export type OrganizerRecipientSource = 'ORGANIZER_NOTIFICATION_IDS' | 'ORGANIZER_CHAT_ID' | 'BACKUP_ADMIN_ID' | 'ORGANIZER_ACCESS' | 'none';

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

/**
 * Explicit env configuration wins. Without it, organizers who hold CRM access
 * and have a linked Telegram account receive the alerts, so notifications work
 * on a fresh deployment without extra variables.
 */
export async function resolveOrganizerNotificationRecipientsWithAccess(db: DatabaseWrapper, env: NodeJS.ProcessEnv = process.env) {
  const configured = resolveOrganizerNotificationRecipients(env);
  if (configured.recipients.length) return configured;
  try {
    // The table may not exist yet before the first organizer login; create and seed it.
    await ensureOrganizerPlayerAccessSchema(db);
    const rows = await db.all<{ telegram_user_id: string | null }>(`
      SELECT p.telegram_user_id
        FROM organizer_player_access a
        JOIN players p ON p.id = a.player_id
       WHERE p.telegram_user_id IS NOT NULL
    `);
    const recipients = parseIds(rows.map((row) => String(row.telegram_user_id || '')).join(','));
    if (recipients.length) return { recipients, source: 'ORGANIZER_ACCESS' as const, fallback: false };
  } catch {
    // Missing access storage means no organizer identities to notify.
  }
  return configured;
}

export async function getOrganizerNotificationDiagnostics(db: DatabaseWrapper) {
  const config = await resolveOrganizerNotificationRecipientsWithAccess(db);
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

/** The app address for a CRM path (the same base the player links use); null when no public address is configured. */
export const organizerAppUrl = (path: string) => {
  const base = String(process.env.PLAYER_APP_URL || process.env.PUBLIC_APP_URL || '').trim().replace(/\/$/, '').replace(/\/player$/, '');
  return base ? `${base}${path}` : null;
};

/**
 * Every message to the organizer gets a way into the right CRM screen (owner, 2026-10-29: the notifications only wrote text):
 * a «Открыть» button with the screen of this message, or the CRM home when the producer names none. Existing quick-action
 * buttons stay above it.
 */
export function withOrganizerOpenButton(replyMarkup: Record<string, unknown> | null | undefined, openPath: string | null | undefined) {
  const url = organizerAppUrl(openPath || '/admin');
  if (!url) return replyMarkup ?? null;
  const rows = Array.isArray((replyMarkup as any)?.inline_keyboard) ? [...(replyMarkup as any).inline_keyboard] : [];
  rows.push([{ text: '📱 Открыть в приложении', web_app: { url } }]);
  return { inline_keyboard: rows };
}

/** The CRM screen that matches a notification when its producer names none; anything unknown opens the CRM home. */
export function defaultOrganizerOpenPath(eventType: string, entityId: string) {
  const id = encodeURIComponent(entityId);
  switch (eventType) {
    case 'evening_shortfall': case 'evening_today_post': case 'evening_start_question': case 'evening_cancelled': return `/admin/evenings/${id}`;
    case 'evening_signed_up': case 'evening_cancelled_by_player': return `/admin/evenings/${id}/participants`;
    case 'novice_application_created': return '/admin/more/development';
    case 'new_player_registered': case 'gomafia_link_request': return `/admin/players/${id}`;
    default: return '/admin';
  }
}

export async function enqueueOrganizerNotification(db: DatabaseWrapper, input: {
  messageKey: string;
  eventType: string;
  entityId: string;
  text: string;
  /** Inline buttons under the message (quick actions, owner request 2026-10-23). */
  replyMarkup?: Record<string, unknown> | null;
  /** CRM path the «Открыть в приложении» button leads to (default: the CRM home). */
  openPath?: string | null;
}, options: { kick?: boolean } = {}) {
  const config = await resolveOrganizerNotificationRecipientsWithAccess(db);
  for (const chatId of config.recipients) {
    await enqueueTelegramMessage(db, {
      messageKey: `${input.messageKey}:${chatId}`,
      category: 'organizer',
      eventType: input.eventType,
      entityId: input.entityId,
      chatId,
      text: input.text,
      replyMarkup: withOrganizerOpenButton(input.replyMarkup, input.openPath || defaultOrganizerOpenPath(input.eventType, input.entityId)),
    });
  }
  // Inside a transaction the outbox worker (every few seconds) sends it instead of an immediate kick.
  if (config.recipients.length && options.kick !== false) kickTelegramMessageOutbox(db);
  return { queued: config.recipients.length, recipient_source: config.source };
}

export async function enqueueOrganizerTestNotification(db: DatabaseWrapper) {
  const config = await resolveOrganizerNotificationRecipientsWithAccess(db);
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