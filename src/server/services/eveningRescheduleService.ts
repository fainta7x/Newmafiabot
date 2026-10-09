import { randomUUID } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { queuePersonalNotification } from './personalNotificationRouterService.ts';
import { sendTelegram, sendVk } from './eveningTodayPostService.ts';
import { isEveningPublishingPaused } from './eveningPublishingPause.ts';

const displayMoscow = (value: string) => new Date(value).toLocaleString('ru-RU', {
  timeZone: 'Europe/Moscow', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
});

export function buildEveningRescheduleText(title: string, before: string, after: string) {
  return `📣 Перенос вечера «${title}»\n\nБыло: ${displayMoscow(before)}\nСтало: ${displayMoscow(after)}\n\nЕсли вы записались, запись сохраняется — повторно отмечаться не нужно. Актуальное расписание игр смотрите в приложении клуба.`;
}

/**
 * Only actual pre-start changes of an already published evening reach this function.
 * One durable notice ID per changed schedule, and one idempotent personal message per player.
 * Group corrections are separate posts; original announcements are updated by the existing sync workers.
 */
export async function notifyEveningRescheduled(
  db: DatabaseWrapper, eveningId: string, before: string, after: string, fetchImpl: typeof fetch = fetch,
) {
  if (new Date(before).getTime() === new Date(after).getTime()) return { changed: false };
  const evening = await db.get<any>('SELECT id, title, format, status FROM game_evenings WHERE id = ? LIMIT 1', [eveningId]);
  if (!evening || evening.status !== 'published') return { changed: false };
  // Keep the emergency publishing pause effective for all outbound notices.
  if (isEveningPublishingPaused()) {
    console.warn('[RESCHEDULE] Notifications skipped: evening publishing is paused', eveningId);
    return { changed: true, paused: true };
  }
  await db.exec(`CREATE TABLE IF NOT EXISTS evening_reschedule_notices (
    id TEXT PRIMARY KEY,
    evening_id TEXT NOT NULL REFERENCES game_evenings(id) ON DELETE CASCADE,
    old_starts_at TEXT NOT NULL,
    new_starts_at TEXT NOT NULL,
    telegram_status TEXT NOT NULL DEFAULT 'pending',
    vk_status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL
  )`);
  const id = randomUUID();
  await db.run(
    'INSERT INTO evening_reschedule_notices (id, evening_id, old_starts_at, new_starts_at, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, eveningId, before, after, new Date().toISOString()],
  );
  const text = buildEveningRescheduleText(String(evening.title || 'Игровой вечер'), before, after);
  const recipients = await db.all<{ player_id: string }>(
    `SELECT DISTINCT player_id FROM evening_participants
       WHERE evening_id = ? AND player_id IS NOT NULL
         AND COALESCE(response_status, 'unanswered') IN ('going', 'late', 'thinking')`,
    [eveningId],
  );
  let personalQueued = 0;
  for (const recipient of recipients) {
    try {
      const result = await queuePersonalNotification(db, {
        notificationKey: `evening-rescheduled:${id}:${recipient.player_id}`,
        playerId: String(recipient.player_id),
        eventType: 'evening_rescheduled',
        entityId: eveningId,
        text,
        actionPath: '/player/events',
      });
      if (result.created) personalQueued += 1;
    } catch (error) {
      console.warn('[RESCHEDULE] Player notice queue failed:', error);
    }
  }
  const [telegram, vk] = await Promise.all([
    sendTelegram(db, evening, text, fetchImpl),
    sendVk(text),
  ]);
  await db.run(
    'UPDATE evening_reschedule_notices SET telegram_status = ?, vk_status = ? WHERE id = ?',
    [telegram.status, vk.status, id],
  );
  return { changed: true, personalQueued, telegram: telegram.status, vk: vk.status };
}
