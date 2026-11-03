import { createHash } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { queuePersonalNotification } from './personalNotificationRouterService.ts';
import { ensureEveningSeatingSchema } from './eveningSeatBookingService.ts';
import { eveningJudgeId } from './eveningStaffService.ts';

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
  // Only an evening that really runs or is over stops the notices. The clock alone does not: the owner re-made the seating at
  // 20:17 for a 19:30 evening still gathering, and nobody got it (2026-11-03).
  if (!evening || ['active', 'completed'].includes(String(evening.status))) return { queued: 0, skipped: 'started' as const };

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

/**
 * The whole seating to the evening's judge in personal messages (owner, 2026-11-03: «мне как судье тоже скидывать
 * рассадку отдельно в ЛС»): every game, every seat with the nickname. Sent again only when the seating changed.
 */
export async function queueEveningSeatingJudgeSummary(db: DatabaseWrapper, eveningId: string) {
  await ensureEveningSeatingSchema(db);
  const judgeId = await eveningJudgeId(db, eveningId);
  if (!judgeId) return { queued: false, reason: 'no_judge' as const };
  const evening = await db.get<any>('SELECT title FROM game_evenings WHERE id=?', [eveningId]);
  const rows = await db.all<any>(`
    SELECT s.slot_number, t.name AS table_name, b.seat_number, COALESCE(p.nickname, 'Игрок') AS nickname
      FROM evening_seat_plans b
      JOIN evening_game_slots s ON s.id = b.slot_id
      JOIN evening_tables t ON t.id = b.table_id
      LEFT JOIN players p ON p.id = b.player_id
     WHERE b.evening_id = ? AND b.started = 0
     ORDER BY s.slot_number, t.sort_order, b.seat_number`, [eveningId]);
  if (!rows.length) return { queued: false, reason: 'empty' as const };
  const blocks = new Map<string, string[]>();
  const tables = new Set(rows.map((row: any) => String(row.table_name)));
  for (const row of rows) {
    const title = tables.size > 1 ? `Игра №${row.slot_number} · ${row.table_name}` : `Игра №${row.slot_number}`;
    const lines = blocks.get(title) || [];
    lines.push(`${row.seat_number}. ${row.nickname}`);
    blocks.set(title, lines);
  }
  const body = [...blocks].map(([title, lines]) => `${title}\n${lines.join('\n')}`).join('\n\n');
  const fingerprint = createHash('sha256').update(body).digest('hex').slice(0, 24);
  try {
    const result = await queuePersonalNotification(db, {
      notificationKey: `evening-seating-judge:${eveningId}:${fingerprint}`,
      playerId: judgeId,
      eventType: 'evening_seating',
      entityId: eveningId,
      text: `🎭 Рассадка на вечер «${evening?.title || 'Игровой вечер'}» — для судьи\n\n${body}`,
      actionPath: '/player/events',
    });
    return { queued: Boolean(result.created), reason: null };
  } catch (error) {
    console.warn('[EVENING SEATING] Unable to queue the judge summary:', error);
    return { queued: false, reason: 'failed' as const };
  }
}
