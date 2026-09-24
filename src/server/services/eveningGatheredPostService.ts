import type { DatabaseWrapper } from '../../db/index.ts';
import { normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { createVkWallPost, getVkDestinations, vkApi } from './vkPublishingService.ts';

/**
 * «Мы собрались» (user-approved 2026-09-24): once the evening starts, the organizer takes a photo
 * and it is posted to Telegram and VK. The first game of a running evening waits for this post
 * unless the organizer presses «Пропустить».
 */
export const MAX_GATHERED_PHOTO_BYTES = 1_200_000;

export async function ensureEveningGatheredPostSchema(db: DatabaseWrapper) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS evening_gathered_posts (
      evening_id TEXT PRIMARY KEY REFERENCES game_evenings(id) ON DELETE CASCADE,
      image_data TEXT,
      mime_type TEXT,
      caption TEXT,
      telegram_status TEXT,
      telegram_error TEXT,
      vk_status TEXT,
      vk_error TEXT,
      vk_url TEXT,
      published_at TEXT,
      skipped_at TEXT,
      skip_reason TEXT,
      sending_until TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}

export type GatheredPostState = 'pending' | 'published' | 'partial' | 'skipped';

export async function loadGatheredPost(db: DatabaseWrapper, eveningId: string) {
  await ensureEveningGatheredPostSchema(db);
  const row = await db.get<any>(
    `SELECT evening_id, caption, telegram_status, telegram_error, vk_status, vk_error, vk_url, published_at, skipped_at, skip_reason,
            image_data IS NOT NULL AS has_photo
       FROM evening_gathered_posts WHERE evening_id = ? LIMIT 1`,
    [eveningId],
  );
  if (!row) return { evening_id: eveningId, state: 'pending' as GatheredPostState, has_photo: false };
  const legs = [row.telegram_status, row.vk_status];
  // «partial»: one channel got the photo, the other failed — the game may start, the failed leg can be retried.
  const state: GatheredPostState = legs.every((leg) => leg === 'published')
    ? 'published'
    : legs.some((leg) => leg === 'published') ? 'partial' : row.skipped_at ? 'skipped' : 'pending';
  return { ...row, has_photo: Boolean(row.has_photo), state };
}

/** True when the first game may start: the post reached at least one channel, or it was skipped. */
export async function gatheredPostSatisfied(db: DatabaseWrapper, eveningId: string) {
  const post = await loadGatheredPost(db, eveningId);
  return post.state !== 'pending';
}

export const defaultGatheredCaption = (evening: any, attended: number) => {
  const people = attended > 0 ? `\nНас уже ${attended}.` : '';
  return `📸 Мы собрались! ${String(evening.title || 'Игровой вечер')} начинается.${people}`;
};

const telegramDestinationFor = (format: string) => (format === 'NOVICE' ? 'novice' : format === 'CASUAL' ? 'club' : 'rating');

async function publishTelegram(db: DatabaseWrapper, evening: any, photo: Buffer, mime: string, caption: string, fetchImpl: typeof fetch) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) return { status: 'failed', error: 'Telegram-бот не настроен' };
  const destination = await db.get<any>(
    'SELECT chat_id, topic_id FROM telegram_destinations WHERE id = ? LIMIT 1',
    [telegramDestinationFor(normalizeEveningFormat(evening.format))],
  ).catch(() => null);
  if (!destination?.chat_id) return { status: 'failed', error: 'Не настроена Telegram-группа для этого вечера' };
  const form = new FormData();
  form.set('chat_id', String(destination.chat_id));
  if (destination.topic_id) form.set('message_thread_id', String(destination.topic_id));
  form.set('caption', caption);
  form.set('photo', new Blob([new Uint8Array(photo)], { type: mime }), 'gathered.jpg');
  try {
    const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendPhoto`, { method: 'POST', body: form });
    const payload: any = await response.json().catch(() => null);
    if (response.ok && payload?.ok !== false) return { status: 'published', error: null };
    return { status: 'failed', error: String(payload?.description || `Telegram HTTP ${response.status}`) };
  } catch (error: any) {
    return { status: 'failed', error: error?.message || 'Telegram недоступен' };
  }
}

async function publishVk(photo: Buffer, mime: string, caption: string, fetchImpl: typeof fetch) {
  const groupId = getVkDestinations().find((destination) => destination.key === 'public' && destination.supported)?.groupId;
  if (!groupId) return { status: 'failed', error: 'Группа ВК не настроена', url: null };
  try {
    // Wall photos need the organizer's user token (photos.getWallUploadServer / saveWallPhoto).
    const server = await vkApi<{ upload_url: string }>('photos.getWallUploadServer', { group_id: groupId });
    const form = new FormData();
    form.set('photo', new Blob([new Uint8Array(photo)], { type: mime }), 'gathered.jpg');
    const uploaded: any = await (await fetchImpl(server.upload_url, { method: 'POST', body: form })).json();
    const saved = await vkApi<Array<{ id: number; owner_id: number }>>('photos.saveWallPhoto', {
      group_id: groupId, server: uploaded.server, photo: uploaded.photo, hash: uploaded.hash,
    });
    const attachment = saved?.[0] ? `photo${saved[0].owner_id}_${saved[0].id}` : null;
    const post = await createVkWallPost({ groupId, message: caption, attachments: attachment ? [attachment] : [] });
    return { status: 'published', error: null, url: post.externalUrl };
  } catch (error: any) {
    return { status: 'failed', error: error?.message || 'ВК недоступен', url: null };
  }
}

export async function publishGatheredPost(
  db: DatabaseWrapper,
  eveningId: string,
  input: { data_url?: unknown; caption?: unknown },
  fetchImpl: typeof fetch = fetch,
) {
  await ensureEveningGatheredPostSchema(db);
  const evening = await db.get<any>('SELECT * FROM game_evenings WHERE id = ? LIMIT 1', [eveningId]);
  if (!evening) throw Object.assign(new Error('Вечер не найден'), { statusCode: 404 });
  if (evening.status !== 'active') throw Object.assign(new Error('Пост «Мы собрались» публикуется после начала вечера'), { statusCode: 409 });

  const now = new Date().toISOString();
  await db.run(
    `INSERT OR IGNORE INTO evening_gathered_posts (evening_id, created_at, updated_at) VALUES (?, ?, ?)`,
    [eveningId, now, now],
  );
  const existing = await db.get<any>('SELECT * FROM evening_gathered_posts WHERE evening_id = ? LIMIT 1', [eveningId]);

  // A new photo replaces the stored one; a retry without a photo resends the stored one to the failed channel.
  let mime = String(existing?.mime_type || '');
  let photo = existing?.image_data ? Buffer.from(String(existing.image_data), 'base64') : Buffer.alloc(0);
  if (input.data_url) {
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(String(input.data_url));
    if (!match) throw Object.assign(new Error('Нужна фотография'), { statusCode: 400 });
    mime = match[1];
    photo = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  }
  if (!photo.length) throw Object.assign(new Error('Нужна фотография'), { statusCode: 400 });
  if (photo.length > MAX_GATHERED_PHOTO_BYTES) throw Object.assign(new Error('Фото слишком большое'), { statusCode: 400 });

  // Reserve the attempt so a double tap or a lost response cannot post the photo twice.
  const reserved = await db.run(
    `UPDATE evening_gathered_posts SET sending_until = ?, updated_at = ?
      WHERE evening_id = ? AND (sending_until IS NULL OR sending_until < ?)`,
    [new Date(Date.now() + 90_000).toISOString(), now, eveningId, now],
  );
  if (!reserved.changes) throw Object.assign(new Error('Пост уже отправляется — подождите минуту'), { statusCode: 409 });

  try {
    const attended = Number((await db.get<any>("SELECT COUNT(*) AS count FROM evening_participants WHERE evening_id = ? AND attendance_status = 'attended'", [eveningId]))?.count || 0);
    const caption = String(input.caption || '').trim().slice(0, 900) || String(existing?.caption || '') || defaultGatheredCaption(evening, attended);
    // Channels that already have the photo are never posted to again.
    const [telegram, vk] = await Promise.all([
      existing?.telegram_status === 'published'
        ? { status: 'published', error: null }
        : publishTelegram(db, evening, photo, mime, caption, fetchImpl),
      existing?.vk_status === 'published'
        ? { status: 'published', error: null, url: existing.vk_url || null }
        : publishVk(photo, mime, caption, fetchImpl),
    ]);
    const done = new Date().toISOString();
    const reached = telegram.status === 'published' || vk.status === 'published';
    await db.run(
      `UPDATE evening_gathered_posts
          SET image_data = ?, mime_type = ?, caption = ?,
              telegram_status = ?, telegram_error = ?, vk_status = ?, vk_error = ?, vk_url = ?,
              published_at = COALESCE(published_at, ?),
              skipped_at = CASE WHEN ? THEN NULL ELSE skipped_at END,
              sending_until = NULL, updated_at = ?
        WHERE evening_id = ?`,
      [photo.toString('base64'), mime, caption, telegram.status, telegram.error, vk.status, vk.error, (vk as any).url || null,
        reached ? done : null, reached ? 1 : 0, done, eveningId],
    );
  } catch (error) {
    await db.run('UPDATE evening_gathered_posts SET sending_until = NULL WHERE evening_id = ?', [eveningId]);
    throw error;
  }
  return loadGatheredPost(db, eveningId);
}

export async function skipGatheredPost(db: DatabaseWrapper, eveningId: string, reason?: unknown) {
  await ensureEveningGatheredPostSchema(db);
  const evening = await db.get<any>('SELECT id FROM game_evenings WHERE id = ? LIMIT 1', [eveningId]);
  if (!evening) throw Object.assign(new Error('Вечер не найден'), { statusCode: 404 });
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO evening_gathered_posts (evening_id, skipped_at, skip_reason, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(evening_id) DO UPDATE SET skipped_at = COALESCE(evening_gathered_posts.skipped_at, excluded.skipped_at),
       skip_reason = excluded.skip_reason, updated_at = excluded.updated_at`,
    [eveningId, now, String(reason || '').trim().slice(0, 300) || null, now, now],
  );
  return loadGatheredPost(db, eveningId);
}
