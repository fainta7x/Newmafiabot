import { randomUUID } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { queuePersonalNotification } from './personalNotificationRouterService.ts';
import { sendTelegram, sendVk } from './eveningTodayPostService.ts';
import { isEveningPublishingPaused } from './eveningPublishingPause.ts';

const RETRY_LEASE_MS = 2 * 60_000;
type Notice = {
  id: string;
  evening_id: string;
  old_starts_at: string;
  new_starts_at: string;
  telegram_status: string;
  vk_status: string;
  personal_status: string;
  sending_until: string | null;
};

const displayMoscow = (value: string) => new Date(value).toLocaleString('ru-RU', {
  timeZone: 'Europe/Moscow', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
});

export function buildEveningRescheduleText(title: string, before: string, after: string) {
  return `📣 Перенос вечера «${title}»\n\nБыло: ${displayMoscow(before)}\nСтало: ${displayMoscow(after)}\n\nЕсли вы записались, запись сохраняется — повторно отмечаться не нужно. Актуальное расписание игр смотрите в приложении клуба.`;
}

async function ensureSchema(db: DatabaseWrapper) {
  await db.exec(`CREATE TABLE IF NOT EXISTS evening_reschedule_notices (
    id TEXT PRIMARY KEY,
    evening_id TEXT NOT NULL REFERENCES game_evenings(id) ON DELETE CASCADE,
    old_starts_at TEXT NOT NULL,
    new_starts_at TEXT NOT NULL,
    telegram_status TEXT NOT NULL DEFAULT 'pending',
    vk_status TEXT NOT NULL DEFAULT 'pending',
    personal_status TEXT NOT NULL DEFAULT 'pending',
    sending_until TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS evening_reschedule_recipients (
    notice_id TEXT NOT NULL REFERENCES evening_reschedule_notices(id) ON DELETE CASCADE,
    player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    PRIMARY KEY (notice_id, player_id)
  )`);
}

export async function loadLatestEveningRescheduleNotice(db: DatabaseWrapper, eveningId: string) {
  await ensureSchema(db);
  const notice = await db.get<Notice>(
    'SELECT * FROM evening_reschedule_notices WHERE evening_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1',
    [eveningId],
  );
  if (!notice) return null;
  return {
    id: notice.id,
    old_starts_at: notice.old_starts_at,
    new_starts_at: notice.new_starts_at,
    telegram_status: notice.telegram_status,
    vk_status: notice.vk_status,
    personal_status: notice.personal_status,
    retry_available: !notice.sending_until || new Date(notice.sending_until).getTime() <= Date.now(),
  };
}

const queueRecipients = async (db: DatabaseWrapper, notice: Notice, text: string) => {
  const recipients = await db.all<{ player_id: string }>(
    'SELECT player_id FROM evening_reschedule_recipients WHERE notice_id = ?', [notice.id],
  );
  let personalQueued = 0;
  let failed = false;
  for (const recipient of recipients) {
    try {
      const result = await queuePersonalNotification(db, {
        notificationKey: `evening-rescheduled:${notice.id}:${recipient.player_id}`,
        playerId: String(recipient.player_id),
        eventType: 'evening_rescheduled',
        entityId: notice.evening_id,
        text,
        actionPath: '/player/events',
      });
      if (result.created) personalQueued += 1;
    } catch (error) {
      failed = true;
      console.warn('[RESCHEDULE] Player notice queue failed:', error);
    }
  }
  await db.run(
    'UPDATE evening_reschedule_notices SET personal_status = ? WHERE id = ?',
    [failed ? 'failed' : 'queued', notice.id],
  );
  return personalQueued;
};

/**
 * A manual retry is guarded by a short, persistent lease. The canonical recipient
 * snapshot and notification keys do not change across retries. Successful channel
 * posts are NEVER sent again. Network ambiguity is retried only after the organizer
 * explicitly presses Retry, not by an unbounded background loop.
 */
async function deliverNotice(
  db: DatabaseWrapper,
  notice: Notice,
  fetchImpl: typeof fetch = fetch,
) {
  if (isEveningPublishingPaused()) {
    return { paused: true, ...(await loadLatestEveningRescheduleNotice(db, notice.evening_id)) };
  }
  const now = new Date();
  const claimed = await db.run(
    `UPDATE evening_reschedule_notices SET sending_until = ?
       WHERE id = ? AND (sending_until IS NULL OR sending_until <= ?)`,
    [new Date(now.getTime() + RETRY_LEASE_MS).toISOString(), notice.id, now.toISOString()],
  );
  if (!claimed.changes) return { busy: true, ...(await loadLatestEveningRescheduleNotice(db, notice.evening_id)) };
  try {
    const evening = await db.get<any>('SELECT id, title, format FROM game_evenings WHERE id = ?', [notice.evening_id]);
    if (!evening) throw Object.assign(new Error('Вечер не найден'), { statusCode: 404 });
    const text = buildEveningRescheduleText(String(evening.title || 'Игровой вечер'), notice.old_starts_at, notice.new_starts_at);
    const personalQueued = notice.personal_status === 'queued' ? 0 : await queueRecipients(db, notice, text);
    const [telegram, vk] = await Promise.all([
      notice.telegram_status === 'published' ? Promise.resolve({ status: 'published' }) : sendTelegram(db, evening, text, fetchImpl),
      notice.vk_status === 'published' ? Promise.resolve({ status: 'published' }) : sendVk(text),
    ]);
    await db.run(
      'UPDATE evening_reschedule_notices SET telegram_status = ?, vk_status = ? WHERE id = ?',
      [telegram.status, vk.status, notice.id],
    );
    return { personalQueued, telegram: telegram.status, vk: vk.status };
  } finally {
    await db.run('UPDATE evening_reschedule_notices SET sending_until = NULL WHERE id = ?', [notice.id]);
  }
}

export async function retryEveningRescheduleNotice(
  db: DatabaseWrapper, eveningId: string, fetchImpl: typeof fetch = fetch,
) {
  await ensureSchema(db);
  const notice = await db.get<Notice>(
    'SELECT * FROM evening_reschedule_notices WHERE evening_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1',
    [eveningId],
  );
  if (!notice) throw Object.assign(new Error('Переносов с уведомлениями пока нет'), { statusCode: 404 });
  return { ...await deliverNotice(db, notice, fetchImpl), notice: await loadLatestEveningRescheduleNotice(db, eveningId) };
}

/** Record a distinct date/time change before external delivery, preserving retry evidence. */
export async function notifyEveningRescheduled(
  db: DatabaseWrapper, eveningId: string, before: string, after: string, fetchImpl: typeof fetch = fetch,
) {
  if (new Date(before).getTime() === new Date(after).getTime()) return { changed: false };
  const evening = await db.get<any>('SELECT id, title, format, status FROM game_evenings WHERE id = ? LIMIT 1', [eveningId]);
  if (!evening || evening.status !== 'published') return { changed: false };
  await ensureSchema(db);
  const id = randomUUID();
  const now = new Date().toISOString();
  await db.transaction(async (tx) => {
    await tx.run(
      'INSERT INTO evening_reschedule_notices (id, evening_id, old_starts_at, new_starts_at, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, eveningId, before, after, now],
    );
    await tx.run(
      `INSERT OR IGNORE INTO evening_reschedule_recipients (notice_id, player_id)
        SELECT ?, player_id FROM evening_participants
         WHERE evening_id = ? AND player_id IS NOT NULL
           AND COALESCE(response_status, 'unanswered') IN ('going', 'late', 'thinking')`,
      [id, eveningId],
    );
  });
  if (isEveningPublishingPaused()) {
    console.warn('[RESCHEDULE] Notification saved for manual retry: publishing is paused', eveningId);
    return { changed: true, paused: true };
  }
  const notice = await db.get<Notice>('SELECT * FROM evening_reschedule_notices WHERE id = ?', [id]);
  const result = await deliverNotice(db, notice!, fetchImpl);
  return { changed: true, ...result };
}
