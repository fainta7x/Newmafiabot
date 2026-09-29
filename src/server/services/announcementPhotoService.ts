import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { vkApi } from './vkPublishingService.ts';

/**
 * Club photos shown above evening announcements (owner request 2026-09-29: the posts looked dry).
 * The organizer uploads them in CRM «Публикации клуба»; each photo is for all evenings or one kind.
 * They are kept in the database (no files), so they live with the club's data and survive deploys.
 * Telegram shows the chosen photo as a large link preview above the post text.
 */

export const ANNOUNCEMENT_PHOTO_AUDIENCES = ['all', 'NOVICE', 'CASUAL', 'RATING'] as const;
export type AnnouncementPhotoAudience = (typeof ANNOUNCEMENT_PHOTO_AUDIENCES)[number];

// The browser shrinks photos to 1280 px before upload; this is a safety cap, not the normal size.
export const MAX_ANNOUNCEMENT_PHOTO_BYTES = 1_200_000;
export const MAX_ANNOUNCEMENT_PHOTOS = 40;

const MIME_BY_MAGIC: Array<{ mime: string; test: (bytes: Buffer) => boolean }> = [
  { mime: 'image/jpeg', test: (bytes) => bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  { mime: 'image/png', test: (bytes) => bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/webp', test: (bytes) => bytes.length > 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP' },
];

export const normalizeAnnouncementPhotoAudience = (value: unknown): AnnouncementPhotoAudience | null => {
  const text = String(value ?? '').trim();
  if (text === 'all') return 'all';
  const upper = text.toUpperCase();
  return (ANNOUNCEMENT_PHOTO_AUDIENCES as readonly string[]).includes(upper) ? upper as AnnouncementPhotoAudience : null;
};

const schemaReady = new WeakSet<object>();

export async function ensureAnnouncementPhotoSchema(db: DatabaseWrapper) {
  if (schemaReady.has(db as object)) return;
  await db.exec(`
    CREATE TABLE IF NOT EXISTS announcement_photos (
      id TEXT PRIMARY KEY,
      audience TEXT NOT NULL DEFAULT 'all',
      mime TEXT NOT NULL,
      bytes BLOB NOT NULL,
      size INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT
    );
    CREATE TABLE IF NOT EXISTS vk_announcement_photo_uploads (
      photo_id TEXT NOT NULL REFERENCES announcement_photos(id) ON DELETE CASCADE,
      group_id TEXT NOT NULL,
      attachment TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (photo_id, group_id)
    );
  `);
  schemaReady.add(db as object);
}

export type AnnouncementPhotoRow = { id: string; audience: AnnouncementPhotoAudience; mime: string; size: number; created_at: string };

export async function listAnnouncementPhotos(db: DatabaseWrapper): Promise<AnnouncementPhotoRow[]> {
  await ensureAnnouncementPhotoSchema(db);
  return db.all<AnnouncementPhotoRow>('SELECT id, audience, mime, size, created_at FROM announcement_photos ORDER BY created_at ASC, rowid ASC');
}

export async function addAnnouncementPhoto(
  db: DatabaseWrapper,
  input: { base64: unknown; audience: unknown; createdBy?: string | null },
): Promise<AnnouncementPhotoRow> {
  await ensureAnnouncementPhotoSchema(db);
  const audience = normalizeAnnouncementPhotoAudience(input.audience ?? 'all');
  if (!audience) throw Object.assign(new Error('Неизвестно, для каких вечеров фото'), { statusCode: 400 });
  const raw = String(input.base64 || '').replace(/^data:[^,]*,/, '');
  const bytes = Buffer.from(raw, 'base64');
  if (!bytes.length) throw Object.assign(new Error('Файл пустой'), { statusCode: 400 });
  if (bytes.length > MAX_ANNOUNCEMENT_PHOTO_BYTES) throw Object.assign(new Error('Фото слишком большое'), { statusCode: 413 });
  const mime = MIME_BY_MAGIC.find((item) => item.test(bytes))?.mime;
  if (!mime) throw Object.assign(new Error('Нужна картинка JPEG, PNG или WebP'), { statusCode: 400 });
  const count = await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM announcement_photos');
  if (Number(count?.count || 0) >= MAX_ANNOUNCEMENT_PHOTOS) {
    throw Object.assign(new Error(`Можно хранить до ${MAX_ANNOUNCEMENT_PHOTOS} фото — удалите лишние`), { statusCode: 409 });
  }
  const row: AnnouncementPhotoRow = { id: randomUUID(), audience, mime, size: bytes.length, created_at: new Date().toISOString() };
  await db.run(
    'INSERT INTO announcement_photos (id, audience, mime, bytes, size, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [row.id, row.audience, row.mime, bytes, row.size, row.created_at, input.createdBy || null],
  );
  return row;
}

export async function setAnnouncementPhotoAudience(db: DatabaseWrapper, id: string, audienceRaw: unknown) {
  await ensureAnnouncementPhotoSchema(db);
  const audience = normalizeAnnouncementPhotoAudience(audienceRaw);
  if (!audience) throw Object.assign(new Error('Неизвестно, для каких вечеров фото'), { statusCode: 400 });
  const result = await db.run('UPDATE announcement_photos SET audience = ? WHERE id = ?', [audience, id]);
  if (!result.changes) throw Object.assign(new Error('Фото не найдено'), { statusCode: 404 });
}

export async function deleteAnnouncementPhoto(db: DatabaseWrapper, id: string) {
  await ensureAnnouncementPhotoSchema(db);
  const result = await db.run('DELETE FROM announcement_photos WHERE id = ?', [id]);
  if (!result.changes) throw Object.assign(new Error('Фото не найдено'), { statusCode: 404 });
}

export async function loadAnnouncementPhoto(db: DatabaseWrapper, id: string) {
  await ensureAnnouncementPhotoSchema(db);
  return db.get<{ mime: string; bytes: Buffer }>('SELECT mime, bytes FROM announcement_photos WHERE id = ?', [id]);
}

/** Upload once with the organizer's VK user token and reuse the saved wall-photo attachment. */
export async function uploadAnnouncementPhotoToVk(
  db: DatabaseWrapper,
  photoId: string,
  groupId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  await ensureAnnouncementPhotoSchema(db);
  const normalizedGroupId = String(groupId || '').trim().replace(/^-/, '');
  if (!/^\d+$/.test(normalizedGroupId)) throw new Error('Не удалось определить группу VK для фото');
  const cached = await db.get<{ attachment: string }>(
    'SELECT attachment FROM vk_announcement_photo_uploads WHERE photo_id = ? AND group_id = ?',
    [photoId, normalizedGroupId],
  );
  if (cached?.attachment) return String(cached.attachment);

  const photo = await loadAnnouncementPhoto(db, photoId);
  if (!photo?.bytes?.length) throw new Error('Фото для анонса не найдено');
  const server = await vkApi<{ upload_url: string }>('photos.getWallUploadServer', { group_id: normalizedGroupId });
  const form = new FormData();
  form.set('photo', new Blob([new Uint8Array(photo.bytes)], { type: photo.mime }), 'announcement.jpg');
  const uploadResponse = await fetchImpl(server.upload_url, { method: 'POST', body: form });
  const uploaded: any = await uploadResponse.json().catch(() => null);
  if (!uploadResponse.ok || !uploaded?.server || !uploaded?.photo || !uploaded?.hash) {
    throw new Error('VK не принял фото для анонса');
  }
  const saved = await vkApi<Array<{ id: number; owner_id: number }>>('photos.saveWallPhoto', {
    group_id: normalizedGroupId,
    server: uploaded.server,
    photo: uploaded.photo,
    hash: uploaded.hash,
  });
  const item = saved?.[0];
  if (!item?.id || !item?.owner_id) throw new Error('VK не вернул сохранённое фото');
  const attachment = `photo${item.owner_id}_${item.id}`;
  await db.run(
    `INSERT INTO vk_announcement_photo_uploads (photo_id, group_id, attachment, created_at)
     VALUES (?, ?, ?, ?) ON CONFLICT(photo_id, group_id) DO NOTHING`,
    [photoId, normalizedGroupId, attachment, new Date().toISOString()],
  );
  return String((await db.get<{ attachment: string }>(
    'SELECT attachment FROM vk_announcement_photo_uploads WHERE photo_id = ? AND group_id = ?',
    [photoId, normalizedGroupId],
  ))?.attachment || attachment);
}

/**
 * The photo for an evening's posts: one of the photos for its kind or for all evenings. The choice
 * depends on the evening id, so every edit of the same post keeps the same photo, while different
 * evenings get different ones.
 */
export async function pickAnnouncementPhotoId(db: DatabaseWrapper, eveningId: string, format: unknown): Promise<string | null> {
  await ensureAnnouncementPhotoSchema(db);
  const normalized = normalizeEveningFormat(format);
  const kind = normalized === 'TOURNAMENT' ? 'RATING' : normalized;
  const rows = await db.all<{ id: string }>(
    "SELECT id FROM announcement_photos WHERE audience IN ('all', ?) ORDER BY created_at ASC, rowid ASC",
    [kind],
  );
  if (!rows.length) return null;
  const index = createHash('sha256').update(String(eveningId)).digest().readUInt32BE(0) % rows.length;
  return String(rows[index].id);
}

export const announcementPhotoPath = (id: string) => `/announce-photo/${encodeURIComponent(id)}.jpg`;

export async function announcementCoverUrl(db: DatabaseWrapper, baseUrl: string, eveningId: string, format: unknown) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\//.test(base)) return null;
  const id = await pickAnnouncementPhotoId(db, eveningId, format);
  return id ? `${base}${announcementPhotoPath(id)}` : null;
}
