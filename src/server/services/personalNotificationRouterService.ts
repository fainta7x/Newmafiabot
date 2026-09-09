import type { DatabaseWrapper } from '../../db/index.ts';
import { ensurePersonalNotificationRoutingSchema } from '../../db/ensurePersonalNotificationRoutingSchema.ts';
import { ensureVkIntegrationSchema } from '../../db/ensureVkIntegrationSchema.ts';
import { enqueueTelegramMessage, kickTelegramMessageOutbox } from './telegramMessageOutboxService.ts';
import { enqueueVkMessage, kickVkMessageOutbox, startVkMessageOutboxWorker } from './vkMessageOutboxService.ts';

export type PersonalNotificationChannel = 'telegram' | 'vk';
export type PersonalNotificationPreference = 'auto' | PersonalNotificationChannel;
export type PersonalNotificationInput = {
  notificationKey: string;
  playerId: string;
  category?: 'personal';
  eventType: string;
  entityId?: string | number | null;
  text: string;
  actionPath?: string | null;
  telegramReplyMarkup?: Record<string, unknown> | null;
};
export type PersonalNotificationRouting = {
  preferred_channel: PersonalNotificationPreference;
  personal_enabled: boolean;
  available_channels: PersonalNotificationChannel[];
  selected_channel: PersonalNotificationChannel | null;
  channel_target: string | null;
};

const nowIso = () => new Date().toISOString();
const playerAppBaseUrl = () => String(process.env.PLAYER_APP_URL || process.env.PUBLIC_APP_URL || '').trim().replace(/\/$/, '');
const normalizePreference = (value: unknown): PersonalNotificationPreference => {
  const normalized = String(value || 'auto').trim().toLowerCase();
  return normalized === 'telegram' || normalized === 'vk' ? normalized : 'auto';
};
const telegramTextWithAction = (text: string, actionPath?: string | null, hasReplyMarkup = false) => {
  if (hasReplyMarkup) return text;
  const baseUrl = playerAppBaseUrl();
  const path = String(actionPath || '').trim();
  if (!baseUrl || !path.startsWith('/player')) return text;
  return `${text}\n\n${baseUrl}${path}`;
};

export async function loadPersonalNotificationPreference(db: DatabaseWrapper, playerId: string) {
  await ensurePersonalNotificationRoutingSchema(db);
  const row = await db.get<any>('SELECT preferred_channel, personal_enabled, updated_at FROM player_notification_preferences WHERE player_id = ? LIMIT 1', [playerId]);
  return {
    preferred_channel: normalizePreference(row?.preferred_channel),
    personal_enabled: row ? Number(row.personal_enabled) !== 0 : true,
    updated_at: row?.updated_at || null,
  };
}

export async function savePersonalNotificationPreference(db: DatabaseWrapper, playerId: string, input: { preferredChannel?: unknown; personalEnabled?: unknown }) {
  await ensurePersonalNotificationRoutingSchema(db);
  const current = await loadPersonalNotificationPreference(db, playerId);
  const preferredChannel = input.preferredChannel === undefined ? current.preferred_channel : normalizePreference(input.preferredChannel);
  const personalEnabled = input.personalEnabled === undefined ? current.personal_enabled : Boolean(input.personalEnabled);
  const now = nowIso();
  await db.run(
    `INSERT INTO player_notification_preferences (player_id, preferred_channel, personal_enabled, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(player_id) DO UPDATE SET
       preferred_channel=excluded.preferred_channel,
       personal_enabled=excluded.personal_enabled,
       updated_at=excluded.updated_at`,
    [playerId, preferredChannel, personalEnabled ? 1 : 0, now],
  );
  return { preferred_channel: preferredChannel, personal_enabled: personalEnabled, updated_at: now };
}

export async function resolvePersonalNotificationRouting(db: DatabaseWrapper, playerId: string): Promise<PersonalNotificationRouting> {
  await ensurePersonalNotificationRoutingSchema(db);
  await ensureVkIntegrationSchema(db);
  const [preference, player, vkIdentity] = await Promise.all([
    loadPersonalNotificationPreference(db, playerId),
    db.get<any>('SELECT telegram_user_id FROM players WHERE id = ? LIMIT 1', [playerId]),
    db.get<any>("SELECT external_user_id FROM player_external_identities WHERE platform='vk' AND player_id=? LIMIT 1", [playerId]),
  ]);
  const telegramTarget = player?.telegram_user_id ? String(player.telegram_user_id) : null;
  const vkTarget = vkIdentity?.external_user_id ? String(vkIdentity.external_user_id) : null;
  const availableChannels: PersonalNotificationChannel[] = [];
  if (telegramTarget) availableChannels.push('telegram');
  if (vkTarget) availableChannels.push('vk');
  let selectedChannel: PersonalNotificationChannel | null = null;
  if (preference.personal_enabled && availableChannels.length) {
    if (preference.preferred_channel !== 'auto' && availableChannels.includes(preference.preferred_channel)) {
      selectedChannel = preference.preferred_channel;
    } else if (availableChannels.includes('telegram')) {
      selectedChannel = 'telegram';
    } else {
      selectedChannel = availableChannels[0] || null;
    }
  }
  return {
    preferred_channel: preference.preferred_channel,
    personal_enabled: preference.personal_enabled,
    available_channels: availableChannels,
    selected_channel: selectedChannel,
    channel_target: selectedChannel === 'telegram' ? telegramTarget : selectedChannel === 'vk' ? vkTarget : null,
  };
}

export async function queuePersonalNotification(db: DatabaseWrapper, input: PersonalNotificationInput) {
  await ensurePersonalNotificationRoutingSchema(db);
  const notificationKey = String(input.notificationKey || '').trim();
  const playerId = String(input.playerId || '').trim();
  const eventType = String(input.eventType || '').trim();
  const text = String(input.text || '').trim();
  if (!notificationKey || !playerId || !eventType || !text) {
    throw new Error('Personal notification key, playerId, eventType and text are required');
  }

  const existing = await db.get<any>('SELECT * FROM personal_notification_deliveries WHERE notification_key = ? LIMIT 1', [notificationKey]);
  if (existing) {
    if (existing.selected_channel === 'vk' && existing.status === 'pending_channel') {
      startVkMessageOutboxWorker(db);
      kickVkMessageOutbox(db);
    }
    return { delivery: existing, created: false };
  }

  const routing = await resolvePersonalNotificationRouting(db, playerId);
  const now = nowIso();
  const selectedChannel = routing.selected_channel;
  const status = !routing.personal_enabled
    ? 'disabled'
    : selectedChannel === 'telegram'
      ? 'queued'
      : selectedChannel === 'vk'
        ? 'pending_channel'
        : 'unroutable';
  const reason = status === 'disabled'
    ? 'personal_notifications_disabled'
    : status === 'unroutable'
      ? 'no_linked_delivery_channel'
      : null;

  await db.run(
    `INSERT INTO personal_notification_deliveries
      (notification_key, player_id, category, event_type, entity_id, selected_channel, channel_target, text, action_path, status, reason, created_at, updated_at)
     VALUES (?, ?, 'personal', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      notificationKey,
      playerId,
      eventType,
      input.entityId == null ? null : String(input.entityId),
      selectedChannel,
      routing.channel_target,
      text,
      input.actionPath || null,
      status,
      reason,
      now,
      now,
    ],
  );

  if (selectedChannel === 'telegram' && routing.channel_target) {
    await enqueueTelegramMessage(db, {
      messageKey: notificationKey,
      category: 'personal',
      eventType,
      entityId: input.entityId,
      playerId,
      chatId: routing.channel_target,
      text: telegramTextWithAction(text, input.actionPath, Boolean(input.telegramReplyMarkup)),
      replyMarkup: input.telegramReplyMarkup || null,
    });
    kickTelegramMessageOutbox(db);
  } else if (selectedChannel === 'vk' && routing.channel_target) {
    await enqueueVkMessage(db, {
      messageKey: `personal:${notificationKey}:vk`,
      notificationKey,
      category: 'personal',
      eventType,
      entityId: input.entityId,
      playerId,
      vkUserId: routing.channel_target,
      text,
      actionPath: input.actionPath || '/player',
    });
    startVkMessageOutboxWorker(db);
    kickVkMessageOutbox(db);
  }

  return {
    delivery: await db.get<any>('SELECT * FROM personal_notification_deliveries WHERE notification_key = ? LIMIT 1', [notificationKey]),
    created: true,
  };
}
