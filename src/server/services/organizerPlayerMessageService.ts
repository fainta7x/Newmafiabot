import type { DatabaseWrapper } from '../../db/index.ts';
import { loadBotBlockedPlayers } from './botBlockedService.ts';
import { queuePersonalNotification, resolvePersonalNotificationRouting } from './personalNotificationRouterService.ts';

/** The bottom keyboard of the bot (bot_menu.py `main_menu_for_user`): the app and the menu card in one row. */
export const BOT_BOTTOM_KEYBOARD = {
  keyboard: [[{ text: '🎭 Открыть 2LA Noire' }, { text: '📋 Меню' }]],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: '2LA Noire',
};

export type OrganizerPlayerMessageInput = { key?: unknown; text?: unknown; player_ids?: unknown; all_linked?: unknown; keyboard?: unknown };

const bad = (message: string) => Object.assign(new Error(message), { statusCode: 400 });

/**
 * One personal message to chosen players (owner, 2026-11-20: «проклятье снято» to the novice-evening players; the new
 * bottom keyboard to everyone). It goes through the personal-notification queue, so a player who switched personal
 * messages off is skipped, and the same `key` never sends twice to the same player.
 */
export async function sendOrganizerPlayerMessage(db: DatabaseWrapper, input: OrganizerPlayerMessageInput) {
  const key = String(input.key || '').trim();
  const text = String(input.text || '').trim();
  if (!/^[a-z0-9._-]{3,80}$/i.test(key)) throw bad('Нужен ключ рассылки (3–80 символов: буквы, цифры, . _ -)');
  if (!text || text.length > 3500) throw bad('Нужен текст сообщения (до 3500 символов)');
  let ids: string[] = [];
  if (input.all_linked === true) {
    const blocked = await loadBotBlockedPlayers(db).catch(() => new Map<string, string>());
    ids = (await db.all<{ id: string }>(`SELECT id FROM players WHERE merged_into_player_id IS NULL AND COALESCE(telegram_user_id,'') <> ''`))
      .map((row) => String(row.id)).filter((id) => !blocked.has(id));
  } else if (Array.isArray(input.player_ids)) {
    ids = [...new Set(input.player_ids.map((value) => String(value || '').trim()).filter(Boolean))];
  }
  if (!ids.length) throw bad('Нужны player_ids или all_linked: true');
  if (ids.length > 300) throw bad('Слишком много получателей');
  const result = { queued: 0, existing: 0, skipped: [] as Array<{ player_id: string; reason: string }> };
  for (const playerId of ids) {
    const exists = await db.get<{ id: string }>('SELECT id FROM players WHERE id = ?', [playerId]);
    if (!exists) { result.skipped.push({ player_id: playerId, reason: 'player_not_found' }); continue; }
    if (input.keyboard === true) {
      // A keyboard exists only in Telegram: a player whose personal messages go to VK (or are off) is reported, not counted.
      const routing = await resolvePersonalNotificationRouting(db, playerId);
      if (!routing.personal_enabled || routing.selected_channel !== 'telegram') { result.skipped.push({ player_id: playerId, reason: 'keyboard_needs_telegram' }); continue; }
    }
    const outcome = await queuePersonalNotification(db, {
      notificationKey: `organizer-message:${key}:${playerId}`,
      playerId,
      eventType: 'organizer_message',
      entityId: key,
      text,
      telegramReplyMarkup: input.keyboard === true ? BOT_BOTTOM_KEYBOARD : null,
    });
    if (!outcome.created) { result.existing += 1; continue; }
    const status = String((outcome.delivery as any)?.status || '');
    if (status === 'queued' || status === 'pending_channel') result.queued += 1;
    else result.skipped.push({ player_id: playerId, reason: String((outcome.delivery as any)?.reason || status || 'not_routable') });
  }
  return result;
}
