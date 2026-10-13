import { randomUUID } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureWhatsNewSchema } from '../../db/ensureWhatsNewSchema.ts';

export type WhatsNewEntry = { id: string; title: string; body: string; published: boolean; published_at: string | null; created_at: string; updated_at: string };
export class WhatsNewError extends Error { constructor(message: string, readonly status = 400) { super(message); } }

const TITLE_MAX = 120;
const BODY_MAX = 1200;

const toEntry = (row: any): WhatsNewEntry => ({
  id: String(row.id), title: String(row.title), body: String(row.body || ''), published: Number(row.published) === 1,
  published_at: row.published_at || null, created_at: String(row.created_at), updated_at: String(row.updated_at),
});

/** What the players read: published notices, newest first. */
export async function listPublishedWhatsNew(db: DatabaseWrapper, limit = 30): Promise<WhatsNewEntry[]> {
  await ensureWhatsNewSchema(db);
  const rows = await db.all<any>('SELECT * FROM whats_new_entries WHERE published = 1 ORDER BY published_at DESC, created_at DESC LIMIT ?', [Math.min(Math.max(limit, 1), 100)]);
  return rows.map(toEntry);
}

/** What the organizer edits: everything, drafts first. */
export async function listAllWhatsNew(db: DatabaseWrapper): Promise<WhatsNewEntry[]> {
  await ensureWhatsNewSchema(db);
  const rows = await db.all<any>('SELECT * FROM whats_new_entries ORDER BY published ASC, COALESCE(published_at, created_at) DESC, created_at DESC LIMIT 200');
  return rows.map(toEntry);
}

const clean = (input: { title?: unknown; body?: unknown }, requireTitle: boolean) => {
  const title = typeof input.title === 'string' ? input.title.trim() : undefined;
  const body = typeof input.body === 'string' ? input.body.trim() : undefined;
  if (requireTitle && !title) throw new WhatsNewError('Напишите заголовок');
  if (title !== undefined && (!title || title.length > TITLE_MAX)) throw new WhatsNewError(`Заголовок: от 1 до ${TITLE_MAX} знаков`);
  if (body !== undefined && body.length > BODY_MAX) throw new WhatsNewError(`Текст: не больше ${BODY_MAX} знаков`);
  return { title, body };
};

export async function createWhatsNew(db: DatabaseWrapper, input: { title?: unknown; body?: unknown; published?: unknown }): Promise<WhatsNewEntry> {
  await ensureWhatsNewSchema(db);
  const { title, body } = clean(input, true);
  const now = new Date().toISOString();
  const published = input.published === true;
  const id = randomUUID();
  await db.run('INSERT INTO whats_new_entries (id, title, body, published, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, title, body ?? '', published ? 1 : 0, published ? now : null, now, now]);
  return toEntry(await db.get<any>('SELECT * FROM whats_new_entries WHERE id = ?', [id]));
}

export async function updateWhatsNew(db: DatabaseWrapper, id: string, input: { title?: unknown; body?: unknown; published?: unknown }): Promise<WhatsNewEntry> {
  await ensureWhatsNewSchema(db);
  const current = await db.get<any>('SELECT * FROM whats_new_entries WHERE id = ?', [id]);
  if (!current) throw new WhatsNewError('Запись не найдена', 404);
  const { title, body } = clean(input, false);
  const now = new Date().toISOString();
  const wasPublished = Number(current.published) === 1;
  const published = typeof input.published === 'boolean' ? input.published : wasPublished;
  // The publication time is when it first went out (or went out again), so the newest notice is the top one for players.
  const publishedAt = published ? (wasPublished ? current.published_at : now) : null;
  await db.run('UPDATE whats_new_entries SET title = ?, body = ?, published = ?, published_at = ?, updated_at = ? WHERE id = ?',
    [title ?? current.title, body ?? current.body, published ? 1 : 0, publishedAt, now, id]);
  return toEntry(await db.get<any>('SELECT * FROM whats_new_entries WHERE id = ?', [id]));
}

export async function deleteWhatsNew(db: DatabaseWrapper, id: string): Promise<void> {
  await ensureWhatsNewSchema(db);
  const result = await db.run('DELETE FROM whats_new_entries WHERE id = ?', [id]);
  if (!(result as any)?.changes) throw new WhatsNewError('Запись не найдена', 404);
}
