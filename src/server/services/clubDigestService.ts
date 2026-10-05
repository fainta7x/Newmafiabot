import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { sendText } from './clubResultPostService.ts';

/**
 * «Опубликовать сводку» (owner, 2026-10-05): the club owner writes (or pastes) a digest of what changed for the players and
 * posts it from the CRM to the chosen Telegram destinations, instead of pasting it into the group by hand. Nothing is sent
 * without an explicit press, every post is recorded, and the same text to the same destination is not sent twice in a day.
 */
export const DIGEST_DESTINATIONS = ['club', 'public', 'rating', 'novice'] as const;
export type DigestDestination = (typeof DIGEST_DESTINATIONS)[number];
export const DIGEST_MIN_LENGTH = 20;
export const DIGEST_MAX_LENGTH = 3800;
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function ensureClubDigestSchema(db: DatabaseWrapper) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS club_digest_posts (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      created_by TEXT,
      text TEXT NOT NULL,
      text_hash TEXT NOT NULL,
      destination_id TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_club_digest_posts_created ON club_digest_posts(created_at);
  `);
}

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Plain text with `**bold**` becomes Telegram HTML (everything else is escaped, so no stray markup can break the post). */
export const digestToTelegramHtml = (text: string) => escapeHtml(text).replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g, '<b>$1</b>');

export const normalizeDigestDestinations = (value: unknown): DigestDestination[] => {
  const list = Array.isArray(value) ? value.map((item) => String(item)) : [];
  return [...new Set(list)].filter((item): item is DigestDestination => (DIGEST_DESTINATIONS as readonly string[]).includes(item));
};

export type DigestResult = { destination: DigestDestination; status: 'sent' | 'failed' | 'duplicate'; error?: string };

export async function publishClubDigest(
  db: DatabaseWrapper,
  input: { text: unknown; destinations: unknown; createdBy?: string | null },
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<DigestResult[]> {
  await ensureClubDigestSchema(db);
  const text = String(input.text ?? '').trim();
  if (text.length < DIGEST_MIN_LENGTH) throw Object.assign(new Error('Сводка слишком короткая'), { statusCode: 400 });
  if (text.length > DIGEST_MAX_LENGTH) throw Object.assign(new Error(`Сводка длиннее ${DIGEST_MAX_LENGTH} символов`), { statusCode: 400 });
  const destinations = normalizeDigestDestinations(input.destinations);
  if (!destinations.length) throw Object.assign(new Error('Выберите, куда публиковать'), { statusCode: 400 });
  const hash = createHash('sha256').update(text).digest('hex');
  const html = digestToTelegramHtml(text);
  const results: DigestResult[] = [];
  for (const destination of destinations) {
    const recent = await db.get<{ id: string }>(
      `SELECT id FROM club_digest_posts WHERE text_hash = ? AND destination_id = ? AND status = 'sent' AND created_at >= ? LIMIT 1`,
      [hash, destination, new Date(now - DUPLICATE_WINDOW_MS).toISOString()],
    );
    if (recent) { results.push({ destination, status: 'duplicate' }); continue; }
    let outcome: { ok: boolean; error?: string };
    try { outcome = await sendText(db, destination, html, fetchImpl, 'HTML'); } catch (error: any) { outcome = { ok: false, error: error?.message || 'Не удалось отправить' }; }
    await db.run(
      'INSERT INTO club_digest_posts (id, created_at, created_by, text, text_hash, destination_id, status, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [randomUUID(), new Date(now).toISOString(), input.createdBy || null, text, hash, destination, outcome.ok ? 'sent' : 'failed', outcome.ok ? null : String(outcome.error || '').slice(0, 300)],
    );
    results.push({ destination, status: outcome.ok ? 'sent' : 'failed', ...(outcome.ok ? {} : { error: String(outcome.error || 'Не удалось отправить') }) });
  }
  return results;
}

export async function loadClubDigestState(db: DatabaseWrapper) {
  await ensureClubDigestSchema(db);
  const destinations = await db.all<{ id: string; name: string; chat_id: string | null; active: number }>(
    `SELECT id, name, chat_id, active FROM telegram_destinations WHERE id IN (${DIGEST_DESTINATIONS.map(() => '?').join(',')})`,
    [...DIGEST_DESTINATIONS],
  ).catch(() => []);
  const byId = new Map(destinations.map((row) => [String(row.id), row]));
  const recent = await db.all<any>('SELECT created_at, destination_id, status, error, substr(text, 1, 120) AS preview FROM club_digest_posts ORDER BY created_at DESC LIMIT 12');
  return {
    destinations: DIGEST_DESTINATIONS.map((id) => ({
      id, name: String(byId.get(id)?.name || id), ready: Boolean(byId.get(id)?.chat_id) && Number(byId.get(id)?.active ?? 1) !== 0,
    })),
    recent,
    max_length: DIGEST_MAX_LENGTH,
  };
}
