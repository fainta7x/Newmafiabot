import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureGuestPlayerPlaceholderSchema } from '../../db/ensureGuestPlayerPlaceholderSchema.ts';
import { normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { telegramBotUsername } from './playerClaimLinkService.ts';
import { finalizeExistingVkEveningPublications } from './vkDirectJoinPublishingService.ts';
import { notifyEveningCancelled, recordEveningCancellation } from './eveningShortfallService.ts';
import { sendTelegram, sendVk } from './eveningTodayPostService.ts';

/**
 * Cancelling an evening from «Сбор» (owner, 2026-10-02): e.g. the novice evening did not gather while the
 * main one did. One action cancels the evening, tells every player who was coming or deciding, and posts
 * the cancellation to the evening's own Telegram group and to VK, so the other evening is untouched.
 * The automatic shortfall cancellation posts the same message.
 */
export async function ensureEveningCancelPostSchema(db: DatabaseWrapper) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS evening_cancel_posts (
      evening_id TEXT PRIMARY KEY REFERENCES game_evenings(id) ON DELETE CASCADE,
      text TEXT,
      telegram_status TEXT,
      telegram_error TEXT,
      vk_status TEXT,
      vk_error TEXT,
      published_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}

const whenText = (value: unknown) => {
  const ms = new Date(String(value)).getTime();
  return Number.isFinite(ms)
    ? new Date(ms).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })
    : '';
};

/** The default text; the organizer may edit it before cancelling. */
export async function buildCancelPostDraft(db: DatabaseWrapper, eveningId: string, reason?: string | null) {
  const evening = await db.get<any>('SELECT id, title, starts_at, format FROM game_evenings WHERE id = ? LIMIT 1', [eveningId]);
  if (!evening) throw Object.assign(new Error('Вечер не найден'), { statusCode: 404 });
  const novice = normalizeEveningFormat(evening.format) === 'NOVICE';
  const when = whenText(evening.starts_at);
  const why = reason === 'shortfall' ? 'К сожалению, не набралось игроков' : 'К сожалению, сегодня не получится собраться';
  const bot = await telegramBotUsername().catch(() => null);
  const lines = [
    `😔 ${novice ? 'Вечер для новичков' : 'Вечер'} «${String(evening.title || 'Игровой вечер')}»${when ? ` (${when})` : ''} отменяется.`,
    '',
    `${why}. Всем, кто записался, — спасибо и до встречи на следующем вечере! 🖤`,
    '',
    bot ? `Следи за анонсами и записывайся: https://t.me/${bot}` : 'Следи за анонсами в приложении клуба.',
  ];
  return { evening_id: eveningId, text: lines.join('\n') };
}

export async function loadCancelPost(db: DatabaseWrapper, eveningId: string) {
  await ensureEveningCancelPostSchema(db);
  const row = await db.get<any>('SELECT * FROM evening_cancel_posts WHERE evening_id = ? LIMIT 1', [eveningId]);
  if (!row) return { evening_id: eveningId, state: 'none' as const };
  const legs = [row.telegram_status, row.vk_status];
  const state = legs.every((leg) => leg === 'published') ? 'published' as const : legs.some((leg) => leg === 'published') ? 'partial' as const : 'failed' as const;
  return { evening_id: eveningId, state, text: row.text, telegram_status: row.telegram_status, telegram_error: row.telegram_error, vk_status: row.vk_status, vk_error: row.vk_error, published_at: row.published_at };
}

/** Posts the cancellation once per channel; a failed channel is tried again on the next call. */
export async function publishCancelPost(db: DatabaseWrapper, eveningId: string, input: { text?: unknown; reason?: string | null } = {}, fetchImpl: typeof fetch = fetch) {
  await ensureEveningCancelPostSchema(db);
  const evening = await db.get<any>('SELECT * FROM game_evenings WHERE id = ? LIMIT 1', [eveningId]);
  if (!evening) throw Object.assign(new Error('Вечер не найден'), { statusCode: 404 });
  const now = new Date().toISOString();
  await db.run('INSERT OR IGNORE INTO evening_cancel_posts (evening_id, created_at, updated_at) VALUES (?, ?, ?)', [eveningId, now, now]);
  const existing = await db.get<any>('SELECT * FROM evening_cancel_posts WHERE evening_id = ? LIMIT 1', [eveningId]);
  const text = String(input.text || '').trim().slice(0, 3500) || String(existing?.text || '') || (await buildCancelPostDraft(db, eveningId, input.reason)).text;
  const [telegram, vk] = await Promise.all([
    existing?.telegram_status === 'published' ? { status: 'published', error: null } : sendTelegram(db, evening, text, fetchImpl),
    existing?.vk_status === 'published' ? { status: 'published', error: null } : sendVk(text),
  ]);
  const done = new Date().toISOString();
  await db.run(
    `UPDATE evening_cancel_posts SET text = ?, telegram_status = ?, telegram_error = ?, vk_status = ?, vk_error = ?,
            published_at = COALESCE(published_at, ?), updated_at = ? WHERE evening_id = ?`,
    [text, telegram.status, telegram.error, vk.status, vk.error, telegram.status === 'published' || vk.status === 'published' ? done : null, done, eveningId],
  );
  return loadCancelPost(db, eveningId);
}

/** The organizer's cancellation: status, player notices, VK announcement update, and the group posts. */
export async function cancelEveningByOrganizer(db: DatabaseWrapper, eveningId: string, input: { text?: unknown; reason?: string | null } = {}, fetchImpl: typeof fetch = fetch) {
  await ensureGuestPlayerPlaceholderSchema(db);
  const evening = await db.get<any>('SELECT id, status, settled_at FROM game_evenings WHERE id = ? LIMIT 1', [eveningId]);
  if (!evening) throw Object.assign(new Error('Вечер не найден'), { statusCode: 404 });
  if (evening.status === 'cancelled') return loadCancelPost(db, eveningId);
  if (evening.status !== 'published' || evening.settled_at) throw Object.assign(new Error('Отменить можно только вечер, который ещё не начался'), { statusCode: 409 });
  const games = await db.get<any>('SELECT 1 AS present FROM games WHERE evening_id = ? AND archived_at IS NULL LIMIT 1', [eveningId]);
  if (games) throw Object.assign(new Error('По вечеру уже есть игры'), { statusCode: 409 });
  const changed = await db.run("UPDATE game_evenings SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'published' AND settled_at IS NULL", [new Date().toISOString(), eveningId]);
  if (!changed.changes) return loadCancelPost(db, eveningId);
  const reason = input.reason || 'organizer';
  await recordEveningCancellation(db, eveningId, reason);
  await notifyEveningCancelled(db, eveningId, reason);
  await finalizeExistingVkEveningPublications(db, eveningId).catch((error) => console.warn('[CANCEL] VK finalization failed:', error));
  return publishCancelPost(db, eveningId, { text: input.text, reason }, fetchImpl);
}
