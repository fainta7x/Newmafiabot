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
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}

export async function loadGatheredPost(db: DatabaseWrapper, eveningId: string) {
  await ensureEveningGatheredPostSchema(db);
  const row = await db.get<any>(
    `SELECT evening_id, caption, telegram_status, telegram_error, vk_status, vk_error, vk_url, published_at, skipped_at, skip_reason
       FROM evening_gathered_posts WHERE evening_id = ? LIMIT 1`,
    [eveningId],
  );
  return row
    ? { ...row, state: row.published_at ? 'published' : row.skipped_at ? 'skipped' : 'pending' }
    : { evening_id: eveningId, state: 'pending' as const };
}

/** True when the first game of a running evening may start. */
export async function gatheredPostSatisfied(db: DatabaseWrapper, eveningId: string) {
  const post = await loadGatheredPost(db, eveningId);
  return post.state === 'published' || post.state === 'skipped';
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

  const dataUrl = String(input.data_url || '');
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!match) throw Object.assign(new Error('Нужна фотография'), { statusCode: 400 });
  const mime = match[1];
  const photo = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!photo.length || photo.length > MAX_GATHERED_PHOTO_BYTES) throw Object.assign(new Error('Фото слишком большое'), { statusCode: 400 });

  const attended = Number((await db.get<any>("SELECT COUNT(*) AS count FROM evening_participants WHERE evening_id = ? AND attendance_status = 'attended'", [eveningId]))?.count || 0);
  const caption = String(input.caption || '').trim().slice(0, 900) || defaultGatheredCaption(evening, attended);

  const [telegram, vk] = await Promise.all([
    publishTelegram(db, evening, photo, mime, caption, fetchImpl),
    publishVk(photo, mime, caption, fetchImpl),
  ]);
  const now = new Date().toISOString();
  const published = telegram.status === 'published' || vk.status === 'published';
  await db.run(
    `INSERT INTO evening_gathered_posts
       (evening_id, image_data, mime_type, caption, telegram_status, telegram_error, vk_status, vk_error, vk_url, published_at, skipped_at, skip_reason, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
     ON CONFLICT(evening_id) DO UPDATE SET
       image_data = excluded.image_data, mime_type = excluded.mime_type, caption = excluded.caption,
       telegram_status = excluded.telegram_status, telegram_error = excluded.telegram_error,
       vk_status = excluded.vk_status, vk_error = excluded.vk_error, vk_url = excluded.vk_url,
       published_at = COALESCE(excluded.published_at, evening_gathered_posts.published_at),
       skipped_at = CASE WHEN excluded.published_at IS NOT NULL THEN NULL ELSE evening_gathered_posts.skipped_at END,
       updated_at = excluded.updated_at`,
    [eveningId, photo.toString('base64'), mime, caption, telegram.status, telegram.error, vk.status, vk.error, vk.url, published ? now : null, now, now],
  );
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
