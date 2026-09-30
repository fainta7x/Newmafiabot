import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureVkIntegrationSchema } from '../../db/ensureVkIntegrationSchema.ts';
import { linkVkIdentity } from './vkEveningIntegrationService.ts';
import { vkPublisherApi } from './vkPublishingService.ts';

const linkError = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });

/** «vk.com/id123», «https://vk.ru/durov», «@durov», «123» → the part VK users.get understands. */
export function parseVkProfileInput(input: unknown): string | null {
  let text = String(input || '').trim();
  if (!text) return null;
  text = text.replace(/^https?:\/\//i, '').replace(/^(m\.)?vk\.(com|ru)\//i, '').replace(/^@/, '');
  text = text.split(/[?#/]/)[0];
  if (/^id\d+$/i.test(text)) return text.slice(2);
  return /^[A-Za-z0-9_.]{2,64}$/.test(text) ? text : null;
}

/**
 * Поле «VK» in the player card (owner, 2026-09-30): the organizer pastes the player's VK page and the
 * profile is linked to that VK account, so signing in through VK later opens this profile.
 */
export async function linkPlayerVkByProfileLink(db: DatabaseWrapper, input: { playerId: string; vk: unknown }) {
  const query = parseVkProfileInput(input.vk);
  if (!query) throw linkError('Вставьте ссылку на страницу VK, например vk.com/id123');
  let users: Array<{ id: number; first_name?: string; last_name?: string; screen_name?: string }> = [];
  try {
    users = await vkPublisherApi('users.get', { user_ids: query, fields: 'screen_name' });
  } catch {
    throw linkError('VK не ответил — попробуйте позже', 502);
  }
  const user = users?.[0];
  if (!user?.id) throw linkError('Такая страница VK не найдена', 404);
  await ensureVkIntegrationSchema(db);
  const result = await linkVkIdentity(db, { vkUserId: String(user.id), playerId: input.playerId });
  const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ') || null;
  await db.run(
    "UPDATE player_external_identities SET screen_name = COALESCE(?, screen_name), display_name = COALESCE(?, display_name) WHERE platform = 'vk' AND external_user_id = ?",
    [user.screen_name || null, displayName, String(user.id)],
  );
  return { ...result, display_name: displayName, screen_name: user.screen_name || null };
}

export async function loadPlayerVkIdentity(db: DatabaseWrapper, playerId: string) {
  await ensureVkIntegrationSchema(db);
  const row = await db.get<any>(
    "SELECT external_user_id, screen_name, display_name FROM player_external_identities WHERE platform = 'vk' AND player_id = ? LIMIT 1",
    [playerId],
  );
  return row ? {
    vk_user_id: String(row.external_user_id),
    screen_name: row.screen_name ? String(row.screen_name) : null,
    display_name: row.display_name ? String(row.display_name) : null,
    url: `https://vk.com/${row.screen_name || `id${row.external_user_id}`}`,
  } : null;
}
