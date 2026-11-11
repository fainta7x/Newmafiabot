import { randomUUID } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';

/**
 * VK does not let this app upload wall photos (VK ID gives no «wall»/«photos» rights, the community key is refused with
 * error 27; owner, 2026-11-11: «нужно мне вручную крепить фото»). The text goes out on the wall by itself; the picture
 * that belonged to the post is kept here until the organizer attaches it by hand and ticks it off.
 */
const MAX_PICTURE_BYTES = 4 * 1024 * 1024;
const KEEP_DONE_DAYS = 14;

let ready = new WeakSet<object>();

export async function ensureVkManualPhotoSchema(db: Pick<DatabaseWrapper, 'run'>) {
  if (ready.has(db as object)) return;
  await db.run(`CREATE TABLE IF NOT EXISTS vk_manual_photos (
    id TEXT PRIMARY KEY,
    post_key TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    post_url TEXT,
    mime TEXT NOT NULL,
    image_base64 TEXT NOT NULL,
    created_at TEXT NOT NULL,
    done_at TEXT
  )`);
  ready.add(db as object);
}
export const resetVkManualPhotoSchemaForTests = () => { ready = new WeakSet<object>(); };

export type VkManualPhotoInput = { postKey: string; title: string; postUrl?: string | null; mime: string; bytes: Buffer | Uint8Array };

/** Keeps the picture for a post that went out as text. A second save for the same post is ignored. */
export async function saveVkManualPhoto(db: DatabaseWrapper, input: VkManualPhotoInput) {
  const bytes = Buffer.from(input.bytes);
  if (!bytes.length || bytes.length > MAX_PICTURE_BYTES) return null;
  await ensureVkManualPhotoSchema(db);
  const id = randomUUID();
  const created = await db.run(
    'INSERT OR IGNORE INTO vk_manual_photos (id, post_key, title, post_url, mime, image_base64, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, input.postKey.slice(0, 200), input.title.slice(0, 200), input.postUrl || null, input.mime, bytes.toString('base64'), new Date().toISOString()],
  );
  await db.run("DELETE FROM vk_manual_photos WHERE done_at IS NOT NULL AND done_at < datetime('now', ?)", [`-${KEEP_DONE_DAYS} days`]);
  return created.changes ? id : null;
}

/** Not-yet-attached pictures, newest first, without the image bytes (the picture has its own URL). */
export async function listPendingVkManualPhotos(db: DatabaseWrapper) {
  await ensureVkManualPhotoSchema(db);
  return db.all<{ id: string; title: string; post_url: string | null; created_at: string }>(
    'SELECT id, title, post_url, created_at FROM vk_manual_photos WHERE done_at IS NULL ORDER BY created_at DESC LIMIT 30',
  );
}

export async function loadVkManualPhotoImage(db: DatabaseWrapper, id: string) {
  await ensureVkManualPhotoSchema(db);
  const row = await db.get<{ mime: string; image_base64: string }>('SELECT mime, image_base64 FROM vk_manual_photos WHERE id = ?', [id]);
  return row ? { mime: row.mime, bytes: Buffer.from(row.image_base64, 'base64') } : null;
}

export async function markVkManualPhotoDone(db: DatabaseWrapper, id: string) {
  await ensureVkManualPhotoSchema(db);
  const result = await db.run('UPDATE vk_manual_photos SET done_at = COALESCE(done_at, ?) WHERE id = ?', [new Date().toISOString(), id]);
  return result.changes > 0;
}
