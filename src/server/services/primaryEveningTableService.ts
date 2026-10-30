import { randomUUID } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';

/**
 * Every new evening has one primary table. Never add a second table or rewrite
 * a table that the organizer already configured. Safe for legacy evenings too.
 * Call within the creation transaction so a failed evening creation rolls back.
 */
export async function ensurePrimaryEveningTable(db: DatabaseWrapper, eveningId: string) {
  const evening = await db.get<any>('SELECT id, format, starts_at, default_price FROM game_evenings WHERE id=?', [eveningId]);
  if (!evening) throw Object.assign(new Error('Вечер не найден'), { statusCode: 404 });
  const existing = await db.get<any>(
    'SELECT id FROM evening_tables WHERE evening_id=? ORDER BY sort_order ASC, created_at ASC LIMIT 1', [eveningId],
  );
  if (existing) return { id: String(existing.id), created: false };
  const id = randomUUID();
  const now = new Date().toISOString();
  const result = await db.run(
    `INSERT INTO evening_tables
       (id, evening_id, name, format, capacity, starts_at, default_price, sort_order, created_at, updated_at)
     SELECT ?, id, 'Основной стол', format, 10, starts_at, default_price, 0, ?, ?
       FROM game_evenings
      WHERE id=? AND NOT EXISTS (SELECT 1 FROM evening_tables WHERE evening_id=?)`,
    [id, now, now, eveningId, eveningId],
  );
  if (!result.changes) {
    const winner = await db.get<any>('SELECT id FROM evening_tables WHERE evening_id=? LIMIT 1', [eveningId]);
    return { id: String(winner.id), created: false };
  }
  return { id, created: true };
}
