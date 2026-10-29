import { createHash } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { queuePersonalNotification } from './personalNotificationRouterService.ts';
import { ensureEveningSeatingSchema } from './eveningSeatBookingService.ts';

type SeatNoticeRow = {
  player_id: string;
  slot_number: number;
  table_name: string;
  seat_number: number;
};

/**
 * Personal messages only before the actual evening start; sending the same
 * seating snapshot twice is idempotent via the existing personal outbox.
 * Player-initiated booking uses an in-app confirmation and never calls this.
 */
export async function queueEveningSeatingNotifications(
  db: DatabaseWrapper,
  eveningId: string,
  affectedPlayerIds?: string[],
) {
  await ensureEveningSeatingSchema(db);
  const evening = await db.get<any>('SELECT title, starts_at, status FROM game_evenings WHERE id=?', [eveningId]);
  if (!evening || ['active', 'completed'].includes(String(evening.status)) ||
      new Date(evening.starts_at).getTime() <= Date.now()) return { queued: 0, skipped: 'started' as const };

  const allRows = await db.all<SeatNoticeRow>(`
    SELECT b.player_id, s.slot_number, t.name AS table_name, b.seat_number
      FROM evening_seat_plans b
      JOIN evening_game_slots s ON s.id=b.slot_id
      JOIN evening_tables t ON t.id=b.table_id
     WHERE b.evening_id=? AND b.started=0
     ORDER BY b.player_id, s.slot_number, t.sort_order, b.seat_number
  `, [eveningId]);
  const targetIds = affectedPlayerIds ? new Set(affectedPlayerIds) : null;
  const byPlayer = new Map<string, SeatNoticeRow[]>();
  for (const row of allRows) {
    if (targetIds && !targetIds.has(String(row.player_id))) continue;
    const values = byPlayer.get(String(row.player_id)) || [];
    values.push(row);
    byPlayer.set(String(row.player_id), values);
  }

  // An organizer can cancel the player's last seat; that still needs a notice.
  if (targetIds) for (const id of targetIds) if (!byPlayer.has(id)) byPlayer.set(id, []);
  let queued = 0;
  for (const [playerId, rows] of byPlayer) {
    const signature = rows.map(row => [row.slot_number, row.table_name, row.seat_number].join(':')).join('|');
    const fingerprint = createHash('sha256').update(signature).digest('hex').slice(0, 24);
    const lines = rows.map(row => `Игра №${row.slot_number} · ${row.table_name} · место №${row.seat_number}`);
    const text = rows.length
      ? `🎭 Рассадка на вечер «${evening.title}»\n\n${lines.join('\n')}\n\nАктуальную рассадку можно посмотреть в приложении клуба.`
      : `🎭 Ваша бронь на вечер «${evening.title}» отменена организатором. Актуальную запись можно посмотреть в приложении клуба.`;
    try {
      const result = await queuePersonalNotification(db, {
        notificationKey: `evening-seating:${eveningId}:${playerId}:${fingerprint}`,
        playerId,
        eventType: 'evening_seating',
        entityId: eveningId,
        text,
        actionPath: '/player/events',
      });
      if (result.created) queued += 1;
    } catch (error) {
      // A failed personal channel must not turn a published public evening post
      // into an apparent failure, nor block organizer seat changes.
      console.warn('[EVENING SEATING] Unable to queue personal notification:', error);
    }
  }
  return { queued, skipped: null };
}
