import type { DatabaseWrapper } from '../../db/index.ts';
import { ensurePersonalNotificationRoutingSchema } from '../../db/ensurePersonalNotificationRoutingSchema.ts';
import { normalizeEveningFormat } from '../../lib/eveningFormat.ts';

/** What a player can switch off: invitations to each kind of evening and to the poker table (owner, 2026-10-13). */
export const INVITE_KINDS = ['NOVICE', 'CASUAL', 'RATING', 'TOURNAMENT', 'POKER'] as const;
export type InviteKind = (typeof INVITE_KINDS)[number];
export const INVITE_KIND_LABELS: Record<InviteKind, string> = {
  NOVICE: 'Вечера для новичков', CASUAL: 'Клубные вечера', RATING: 'Рейтинговые вечера', TOURNAMENT: 'Турниры', POKER: 'Покер за столом',
};

export type InvitePreferences = { blocked_kinds: InviteKind[]; allow_direct_contact: boolean };

const parseBlocked = (value: unknown): InviteKind[] => {
  try {
    const list = JSON.parse(String(value || '[]'));
    return Array.isArray(list) ? INVITE_KINDS.filter((kind) => list.includes(kind)) : [];
  } catch { return []; }
};

export const inviteKindOfEvening = (format: unknown): InviteKind => normalizeEveningFormat(format);

export async function loadInvitePreferences(db: DatabaseWrapper, playerId: string): Promise<InvitePreferences> {
  await ensurePersonalNotificationRoutingSchema(db);
  const row = await db.get<any>('SELECT blocked_invite_formats, allow_direct_contact FROM player_notification_preferences WHERE player_id = ? LIMIT 1', [playerId]);
  return { blocked_kinds: parseBlocked(row?.blocked_invite_formats), allow_direct_contact: Number(row?.allow_direct_contact) === 1 };
}

export async function saveInvitePreferences(db: DatabaseWrapper, playerId: string, input: { blockedKinds?: unknown; allowDirectContact?: unknown }): Promise<InvitePreferences> {
  const current = await loadInvitePreferences(db, playerId);
  const blocked = Array.isArray(input.blockedKinds) ? INVITE_KINDS.filter((kind) => (input.blockedKinds as unknown[]).includes(kind)) : current.blocked_kinds;
  const direct = typeof input.allowDirectContact === 'boolean' ? input.allowDirectContact : current.allow_direct_contact;
  await db.run(
    `INSERT INTO player_notification_preferences (player_id, preferred_channel, personal_enabled, updated_at, blocked_invite_formats, allow_direct_contact)
     VALUES (?, 'auto', 1, ?, ?, ?)
     ON CONFLICT(player_id) DO UPDATE SET blocked_invite_formats = excluded.blocked_invite_formats, allow_direct_contact = excluded.allow_direct_contact, updated_at = excluded.updated_at`,
    [playerId, new Date().toISOString(), JSON.stringify(blocked), direct ? 1 : 0],
  );
  return { blocked_kinds: blocked, allow_direct_contact: direct };
}

/** Preferences of many players at once: players without a row allow everything. */
export async function loadInvitePreferencesMap(db: DatabaseWrapper, playerIds: string[]): Promise<Map<string, InvitePreferences>> {
  await ensurePersonalNotificationRoutingSchema(db);
  const ids = [...new Set(playerIds.map(String).filter(Boolean))];
  const result = new Map<string, InvitePreferences>();
  for (let index = 0; index < ids.length; index += 400) {
    const chunk = ids.slice(index, index + 400);
    const rows = await db.all<any>(`SELECT player_id, blocked_invite_formats, allow_direct_contact FROM player_notification_preferences WHERE player_id IN (${chunk.map(() => '?').join(',')})`, chunk);
    for (const row of rows) result.set(String(row.player_id), { blocked_kinds: parseBlocked(row.blocked_invite_formats), allow_direct_contact: Number(row.allow_direct_contact) === 1 });
  }
  return result;
}

export async function isInviteBlocked(db: DatabaseWrapper, playerId: string, kind: InviteKind): Promise<boolean> {
  return (await loadInvitePreferences(db, playerId)).blocked_kinds.includes(kind);
}

export type DirectContact = { vk_url: string | null; telegram_url: string | null };

/** Links to write to a player from one's own account — only for players who allowed it in «Приглашения»; others get nothing. */
export async function loadDirectContacts(db: DatabaseWrapper, playerIds: string[]): Promise<Map<string, DirectContact>> {
  const prefs = await loadInvitePreferencesMap(db, playerIds);
  const allowed = [...prefs.entries()].filter(([, value]) => value.allow_direct_contact).map(([id]) => id);
  const result = new Map<string, DirectContact>();
  if (!allowed.length) return result;
  const marks = allowed.map(() => '?').join(',');
  const players = await db.all<any>(`SELECT id, telegram_username FROM players WHERE id IN (${marks})`, allowed);
  const hasIdentities = await db.get<any>("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'player_external_identities'");
  const vk = hasIdentities ? await db.all<any>(`SELECT player_id, external_user_id FROM player_external_identities WHERE platform = 'vk' AND player_id IN (${marks})`, allowed) : [];
  const vkById = new Map(vk.map((row: any) => [String(row.player_id), String(row.external_user_id)]));
  for (const row of players) {
    const id = String(row.id);
    const vkId = vkById.get(id);
    const username = String(row.telegram_username || '').replace(/^@/, '').trim();
    const contact = { vk_url: vkId && /^\d+$/.test(vkId) ? `https://vk.com/im?sel=${vkId}` : null, telegram_url: /^[A-Za-z0-9_]{4,32}$/.test(username) ? `https://t.me/${username}` : null };
    if (contact.vk_url || contact.telegram_url) result.set(id, contact);
  }
  return result;
}
