import crypto from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { ensurePokerInviteSchema } from '../../db/ensurePokerInviteSchema.ts';
import { ensureVkIntegrationSchema } from '../../db/ensureVkIntegrationSchema.ts';
import { ensurePersonalNotificationRoutingSchema } from '../../db/ensurePersonalNotificationRoutingSchema.ts';
import { ensurePlayerProfileMergeSchema } from '../../db/ensurePlayerProfileMergeSchema.ts';
import { loadDirectContacts, loadInvitePreferencesMap, isInviteBlocked, type InviteKind } from './playerInvitePreferencesService.ts';
import { loadPresence } from './presenceService.ts';
import { loadPersonalNotificationPreference, queuePersonalNotification, resolvePersonalNotificationRouting } from './personalNotificationRouterService.ts';
import { vkCommunityApi } from './vkCommunityApiService.ts';
import { getPublicAppBaseUrl } from '../runtimeConfig.ts';

export const POKER_INVITE_COOLDOWN_MS = 2 * 60 * 1000;
const VK_STATUS_CACHE_MS = 30 * 1000;

type VkUserStatus = {
  id?: number | string;
  online?: number;
  last_seen?: { time?: number };
};

type VkPresenceCache = {
  key: string;
  loadedAt: number;
  available: boolean;
  byId: Map<string, { online: boolean; lastSeenAt: string | null }>;
};

const vkPresenceCache = new WeakMap<DatabaseWrapper, VkPresenceCache>();

const unavailableInviteStatuses = new Set(['blocked', 'paused', 'archived', 'inactive', 'disabled', 'deleted', 'merged']);
const inviteTargetAvailable = (row: any) => Boolean(
  row
  && String(row.source || '').trim() !== 'legacy_guest_migrated'
  && !String(row.merged_into_player_id || '').trim()
  && !unavailableInviteStatuses.has(String(row.contact_status || 'normal').trim().toLowerCase())
  && !unavailableInviteStatuses.has(String(row.lifecycle_status || 'normal').trim().toLowerCase())
);

export class PokerInviteError extends Error {
  constructor(public code: 'cooldown' | 'no_channel' | 'invites_off' | 'notifications_disabled' | 'player_not_found', message: string, public retryAfterSeconds = 0) {
    super(message);
  }
}

const appBaseUrl = () => String(process.env.PLAYER_APP_URL || getPublicAppBaseUrl()).trim().replace(/\/$/, '');

async function loadVkPresence(
  db: DatabaseWrapper,
  vkIds: string[],
  now = Date.now(),
  loader: (ids: string[]) => Promise<VkUserStatus[]> = async (ids) => vkCommunityApi<VkUserStatus[]>('users.get', {
    user_ids: ids.join(','),
    fields: 'online,last_seen',
  }),
) {
  const unique = [...new Set(vkIds.filter(Boolean))].sort();
  if (!unique.length) return { available: false, byId: new Map<string, { online: boolean; lastSeenAt: string | null }>() };
  const key = unique.join(',');
  const cached = vkPresenceCache.get(db);
  if (cached && cached.key === key && now - cached.loadedAt < VK_STATUS_CACHE_MS) {
    return { available: cached.available, byId: cached.byId };
  }

  try {
    const rows = await loader(unique);
    const byId = new Map<string, { online: boolean; lastSeenAt: string | null }>();
    for (const row of rows || []) {
      const id = String(row?.id || '').trim();
      if (!id) continue;
      const epoch = Number(row?.last_seen?.time || 0);
      byId.set(id, {
        online: Number(row?.online || 0) === 1,
        lastSeenAt: epoch > 0 ? new Date(epoch * 1000).toISOString() : null,
      });
    }
    vkPresenceCache.set(db, { key, loadedAt: now, available: true, byId });
    return { available: true, byId };
  } catch {
    const byId = new Map<string, { online: boolean; lastSeenAt: string | null }>();
    vkPresenceCache.set(db, { key, loadedAt: now, available: false, byId });
    return { available: false, byId };
  }
}

export async function loadPokerInviteCandidates(
  db: DatabaseWrapper,
  senderPlayerId: string,
  options: { now?: number; vkLoader?: (ids: string[]) => Promise<VkUserStatus[]>; kind?: InviteKind } = {},
) {
  await ensurePokerInviteSchema(db);
  await ensureVkIntegrationSchema(db);
  await ensurePersonalNotificationRoutingSchema(db);
  await ensurePlayerProfileMergeSchema(db);
  const now = options.now ?? Date.now();
  const players = await db.all<any>(`
    SELECT p.id, p.nickname, p.telegram_user_id, p.lifecycle_status, p.contact_status, p.source, p.merged_into_player_id,
           vk.external_user_id AS vk_user_id,
           COALESCE(pref.personal_enabled, 1) AS personal_enabled
      FROM players p
      LEFT JOIN player_external_identities vk
        ON vk.platform='vk' AND vk.player_id=p.id
      LEFT JOIN player_notification_preferences pref
        ON pref.player_id=p.id
     WHERE p.id <> ?
       AND COALESCE(p.source, '') <> 'legacy_guest_migrated'
       AND p.merged_into_player_id IS NULL
       AND LOWER(COALESCE(p.contact_status, 'normal')) NOT IN ('blocked','paused','archived','inactive','disabled','deleted','merged')
       AND LOWER(COALESCE(p.lifecycle_status, 'normal')) NOT IN ('blocked','paused','archived','inactive','disabled','deleted','merged')
     ORDER BY p.nickname COLLATE NOCASE ASC
  `, [senderPlayerId]);

  // Players who switched off poker invitations in «Приглашения» are not offered at all; those who allowed direct contact
  // get their VK / Telegram link so the sender can write from their own account.
  const invitePrefs = await loadInvitePreferencesMap(db, players.map((row: any) => String(row.id)));
  const invitable = players.filter((row: any) => !(invitePrefs.get(String(row.id))?.blocked_kinds || []).includes(options.kind || 'POKER'));

  const directContacts = await loadDirectContacts(db, invitable.map((row: any) => String(row.id)));
  const onlineInApp = new Set((await loadPresence(db, now)).map((item) => String(item.player_id)));
  const vkIds = invitable.map((row: any) => String(row.vk_user_id || '')).filter(Boolean);
  const vk = await loadVkPresence(db, vkIds, now, options.vkLoader);

  const cutoff = new Date(now - POKER_INVITE_COOLDOWN_MS).toISOString();
  const recent = await db.all<any>(`
    SELECT target_player_id, MAX(created_at) AS created_at
      FROM poker_invites
     WHERE sender_player_id=? AND created_at>=?
     GROUP BY target_player_id
  `, [senderPlayerId, cutoff]);
  const lastInvite = new Map(recent.map((row: any) => [String(row.target_player_id), String(row.created_at)]));

  const candidates = invitable.map((row: any) => {
    const vkId = String(row.vk_user_id || '');
    const vkState = vkId ? vk.byId.get(vkId) : null;
    const sentAt = lastInvite.get(String(row.id)) || null;
    const elapsed = sentAt ? Math.max(0, now - new Date(sentAt).getTime()) : POKER_INVITE_COOLDOWN_MS;
    const cooldownSeconds = Math.max(0, Math.ceil((POKER_INVITE_COOLDOWN_MS - elapsed) / 1000));
    return {
      player_id: String(row.id),
      nickname: String(row.nickname || 'Игрок'),
      app_online: onlineInApp.has(String(row.id)),
      vk_linked: Boolean(vkId),
      vk_online: Boolean(vkState?.online),
      vk_last_seen_at: vkState?.lastSeenAt || null,
      vk_status_available: vk.available,
      telegram_linked: Boolean(row.telegram_user_id),
      personal_notifications_enabled: Number(row.personal_enabled) !== 0,
      can_invite: Boolean(row.telegram_user_id || vkId) && Number(row.personal_enabled) !== 0 && cooldownSeconds === 0,
      invite_cooldown_seconds: cooldownSeconds,
      direct_contact: directContacts.get(String(row.id)) || null,
    };
  });

  candidates.sort((a, b) =>
    Number(b.app_online) - Number(a.app_online)
    || Number(b.vk_online) - Number(a.vk_online)
    || (new Date(b.vk_last_seen_at || 0).getTime() - new Date(a.vk_last_seen_at || 0).getTime())
    || a.nickname.localeCompare(b.nickname, 'ru'));

  return candidates;
}

export async function queuePokerInvite(db: DatabaseWrapper, input: {
  senderPlayerId: string;
  senderNickname: string;
  targetPlayerId: string;
  lobbyId: string;
  lobbyTitle: string;
  now?: number;
  /** Another game reuses the same invitation pipe (the «Кровь на часовой башне» rooms); poker is the default. */
  other?: { kind: InviteKind; eventType: string; actionPath: string; buttonText: string; text: string; blockedMessage: string };
}) {
  await ensurePokerInviteSchema(db);
  await ensurePlayerProfileMergeSchema(db);
  const now = input.now ?? Date.now();
  if (input.senderPlayerId === input.targetPlayerId) {
    throw new PokerInviteError('player_not_found', 'Нельзя позвать самого себя.');
  }

  const target = await db.get<any>(
    'SELECT id, nickname, telegram_user_id, contact_status, lifecycle_status, source, merged_into_player_id FROM players WHERE id=? LIMIT 1',
    [input.targetPlayerId],
  );
  if (!target) throw new PokerInviteError('player_not_found', 'Игрок не найден.');
  if (!inviteTargetAvailable(target)) throw new PokerInviteError('player_not_found', 'Игрок недоступен для приглашения.');
  if (await isInviteBlocked(db, input.targetPlayerId, input.other?.kind || 'POKER')) throw new PokerInviteError('invites_off', input.other?.blockedMessage || 'Игрок не принимает приглашения в покер.');
  // Telegram first; a player who only has VK gets the invite from the club's VK community (owner, 2026-10-13).
  const routing = await resolvePersonalNotificationRouting(db, input.targetPlayerId);
  if (!routing.available_channels.length) throw new PokerInviteError('no_channel', 'У игрока не подключены ни Telegram, ни ВКонтакте.');

  const preference = await loadPersonalNotificationPreference(db, input.targetPlayerId);
  if (!preference.personal_enabled) {
    throw new PokerInviteError('notifications_disabled', 'Игрок отключил личные уведомления.');
  }

  const id = crypto.randomUUID();
  const createdAt = new Date(now).toISOString();
  const actionPath = input.other?.actionPath || `/player/poker/${encodeURIComponent(input.lobbyId)}`;
  const base = appBaseUrl();
  const replyMarkup = base ? {
    inline_keyboard: [[{ text: input.other?.buttonText || '🃏 Сесть за стол', web_app: { url: `${base}${actionPath}` } }]],
  } : null;
  const rawText = input.other?.text || `🃏 ${input.senderNickname} зовёт тебя сыграть в покер\n${input.lobbyTitle} · игра на клубные жетоны · вход от 200 🪙 (10 ББ), сумму выбираешь сам`;

  // Cooldown check and insert are ONE statement, so two simultaneous invites cannot both pass.
  const cutoff = new Date(now - POKER_INVITE_COOLDOWN_MS).toISOString();
  const inserted = await db.run(
    `INSERT INTO poker_invites (id,sender_player_id,target_player_id,lobby_id,created_at)
     SELECT ?,?,?,?,? WHERE NOT EXISTS (
       SELECT 1 FROM poker_invites WHERE sender_player_id=? AND target_player_id=? AND created_at>?)`,
    [id, input.senderPlayerId, input.targetPlayerId, input.lobbyId, createdAt, input.senderPlayerId, input.targetPlayerId, cutoff],
  );
  if (!inserted.changes) {
    const latest = await db.get<any>(
      'SELECT created_at FROM poker_invites WHERE sender_player_id=? AND target_player_id=? ORDER BY created_at DESC LIMIT 1',
      [input.senderPlayerId, input.targetPlayerId],
    );
    const remaining = POKER_INVITE_COOLDOWN_MS - Math.max(0, now - new Date(String(latest?.created_at || createdAt)).getTime());
    throw new PokerInviteError('cooldown', 'Этого игрока уже звали. Можно повторить через пару минут.', Math.max(1, Math.ceil(remaining / 1000)));
  }
  const { delivery } = await queuePersonalNotification(db, {
    notificationKey: `poker-invite:${id}`,
    playerId: input.targetPlayerId,
    eventType: input.other?.eventType || 'poker_invite',
    entityId: input.lobbyId,
    text: rawText,
    actionPath,
    telegramReplyMarkup: replyMarkup,
  });
  await db.run('DELETE FROM poker_invites WHERE created_at < ?', [new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()]);

  return { id, target_player_id: String(target.id), channel: (delivery?.selected_channel as 'telegram' | 'vk' | null) || routing.selected_channel, cooldown_seconds: Math.ceil(POKER_INVITE_COOLDOWN_MS / 1000) };
}
