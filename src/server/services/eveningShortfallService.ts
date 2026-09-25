import type { DatabaseWrapper } from '../../db/index.ts';
import { normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { loadEveningRecruitmentState } from './eveningRecruitmentService.ts';
import { requestBotEveningRecruitment } from './botTelegramSyncService.ts';
import { enqueueOrganizerNotification } from './organizerNotificationService.ts';
import { queuePersonalNotification } from './personalNotificationRouterService.ts';
import { finalizeExistingVkEveningPublications } from './vkDirectJoinPublishingService.ts';

/**
 * Shortfall (user-approved 2026-09-24):
 * - 3 hours before, if games are short of players, the app itself posts the call in the group of the
 *   main announcement;
 * - 1 hour before, if the evening still has fewer than the table minimum (10 players, 8 on a novice
 *   evening), the organizer is asked «Недобор — отменить вечер?»; cancelling tells every registered player.
 */
const HOUR = 3_600_000;
export const CALL_HOURS = 3;
export const CANCEL_PROMPT_HOURS = 1;

export const eveningMinimumPlayers = (format: unknown) => (normalizeEveningFormat(format) === 'NOVICE' ? 8 : 10);

export async function cancelEveningForShortfall(db: DatabaseWrapper, eveningId: string, now = Date.now(), automatic = false) {
  const evening = await db.get<any>('SELECT id, format, status, starts_at, settled_at FROM game_evenings WHERE id = ?', [eveningId]);
  if (!evening) throw Object.assign(new Error('Вечер не найден'), { statusCode: 404 });
  if (evening.status === 'cancelled') return false;
  if (!['published', 'active'].includes(evening.status) || evening.settled_at || normalizeEveningFormat(evening.format) === 'TOURNAMENT')
    throw Object.assign(new Error('Этот вечер нельзя отменить из-за недобора'), { statusCode: 409 });
  const games = await db.get<any>('SELECT 1 AS present FROM games WHERE evening_id = ? AND archived_at IS NULL LIMIT 1', [eveningId]);
  if (games) throw Object.assign(new Error('По вечеру уже есть игры; сначала проверьте их результаты'), { statusCode: 409 });
  const attended = Number((await db.get<any>("SELECT COUNT(*) AS count FROM evening_participants WHERE evening_id = ? AND attendance_status = 'attended'", [eveningId]))?.count || 0);
  if (attended >= eveningMinimumPlayers(evening.format))
    throw Object.assign(new Error('На вечер пришло достаточно игроков'), { statusCode: 409 });
  if (automatic && (evening.status !== 'published' || new Date(evening.starts_at).getTime() <= now)) return false;
  const changed = await db.run("UPDATE game_evenings SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = ? AND settled_at IS NULL", [new Date(now).toISOString(), eveningId, evening.status]);
  if (!changed.changes) return false;
  await recordEveningCancellation(db, eveningId, 'shortfall');
  await notifyEveningCancelled(db, eveningId, 'shortfall');
  await finalizeExistingVkEveningPublications(db, eveningId).catch((error) => console.warn('[SHORTFALL] VK finalization failed:', error));
  return true;
}

export async function ensureEveningShortfallSchema(db: DatabaseWrapper) {
  await db.exec(`CREATE TABLE IF NOT EXISTS evening_shortfall_actions (
    evening_id TEXT PRIMARY KEY,
    call_sent_at TEXT,
    cancel_prompt_at TEXT
  )`);
  const columns = await db.all<any>('PRAGMA table_info(evening_shortfall_actions)');
  // The reason is kept so cancellation notices can be re-sent after a failed delivery.
  if (!columns.some((column: any) => column.name === 'cancel_reason')) await db.run('ALTER TABLE evening_shortfall_actions ADD COLUMN cancel_reason TEXT');
  if (!columns.some((column: any) => column.name === 'cancelled_at')) await db.run('ALTER TABLE evening_shortfall_actions ADD COLUMN cancelled_at TEXT');
}

/** Players who said they come (the same count the recruitment state uses) against the table minimum. */
export async function loadEveningShortfall(db: DatabaseWrapper, eveningId: string) {
  const state = await loadEveningRecruitmentState(db, eveningId);
  if (!state) return null;
  const minimum = eveningMinimumPlayers(state.evening.format);
  // Guests recorded without a club profile sit at the table too.
  const hasGuests = await db.get<any>("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'guest_player_placeholders'");
  const guests = hasGuests
    ? Number((await db.get<any>("SELECT COUNT(*) AS count FROM guest_player_placeholders WHERE evening_id = ? AND COALESCE(response_status, '') IN ('going', 'late')", [eveningId]))?.count || 0)
    : 0;
  const confirmed = Number(state.confirmed_players || 0) + guests;
  return { state, minimum, confirmed, short: confirmed < minimum };
}

export async function runEveningShortfallChecks(
  db: DatabaseWrapper,
  now = Date.now(),
  recruit: (eveningId: string) => Promise<{ success: boolean }> = requestBotEveningRecruitment,
) {
  await ensureEveningShortfallSchema(db);
  const evenings = await db.all<any>(
    `SELECT e.id, e.title, e.format, e.starts_at, a.call_sent_at, a.cancel_prompt_at
       FROM game_evenings e LEFT JOIN evening_shortfall_actions a ON a.evening_id = e.id
      WHERE e.status = 'published' AND e.settled_at IS NULL AND UPPER(COALESCE(e.format, '')) <> 'TOURNAMENT'
        AND datetime(e.starts_at) > datetime(?) AND datetime(e.starts_at) <= datetime(?)`,
    [new Date(now).toISOString(), new Date(now + CALL_HOURS * HOUR).toISOString()],
  );
  let actions = 0;
  for (const evening of evenings) {
    const id = String(evening.id);
    const start = new Date(String(evening.starts_at)).getTime();
    const shortfall = await loadEveningShortfall(db, id);
    if (!shortfall) continue;

    // The call goes out only for a real shortfall against the approved table size (10, novice 8).
    if (!evening.call_sent_at && shortfall.short) {
      const delivery = await recruit(id).catch(() => ({ success: false }));
      // Only a delivered call is recorded, so a bot outage is retried on the next run.
      if (delivery.success) {
        await db.run(
          `INSERT INTO evening_shortfall_actions (evening_id, call_sent_at) VALUES (?, ?)
           ON CONFLICT(evening_id) DO UPDATE SET call_sent_at = excluded.call_sent_at`,
          [id, new Date(now).toISOString()],
        );
        actions += 1;
      }
    }

    if (start - now <= CANCEL_PROMPT_HOURS * HOUR && shortfall.short) {
      try {
        if (await cancelEveningForShortfall(db, id, now, true)) { actions += 1; continue; }
      } catch (error) {
        console.warn('[SHORTFALL] Automatic cancellation needs organizer review:', error);
      }
    }
    if (!evening.cancel_prompt_at && start - now <= CANCEL_PROMPT_HOURS * HOUR && shortfall.short) {
      await enqueueOrganizerNotification(db, {
        messageKey: `evening-shortfall:${id}`,
        eventType: 'evening_shortfall',
        entityId: id,
        text: `⚠️ Недобор на «${String(evening.title || 'Игровой вечер')}»: записались ${shortfall.confirmed} из ${shortfall.minimum}. Отменить вечер? Кнопка — на главной кабинета организатора, в «Порядке в клубе».`,
      });
      await db.run(
        `INSERT INTO evening_shortfall_actions (evening_id, cancel_prompt_at) VALUES (?, ?)
         ON CONFLICT(evening_id) DO UPDATE SET cancel_prompt_at = excluded.cancel_prompt_at`,
        [id, new Date(now).toISOString()],
      );
      actions += 1;
    }
  }
  // Re-send cancellation notices that did not get queued (idempotent per player), for cancelled
  // evenings that have not happened yet.
  for (const row of await db.all<any>(
    `SELECT e.id, a.cancel_reason FROM game_evenings e JOIN evening_shortfall_actions a ON a.evening_id = e.id
      WHERE e.status = 'cancelled' AND a.cancelled_at IS NOT NULL AND datetime(e.starts_at) > datetime(?) AND datetime(e.starts_at) <= datetime(?)`,
    [new Date(now).toISOString(), new Date(now + 14 * 24 * HOUR).toISOString()],
  )) {
    actions += await notifyEveningCancelled(db, String(row.id), row.cancel_reason || null).catch(() => 0);
  }
  return actions;
}

/** Remember why an evening was cancelled, so the notices can be re-sent with the same reason. */
export async function recordEveningCancellation(db: DatabaseWrapper, eveningId: string, reason?: string | null) {
  await ensureEveningShortfallSchema(db);
  await db.run(
    `INSERT INTO evening_shortfall_actions (evening_id, cancel_reason, cancelled_at) VALUES (?, ?, ?)
     ON CONFLICT(evening_id) DO UPDATE SET cancel_reason = excluded.cancel_reason, cancelled_at = excluded.cancelled_at`,
    [eveningId, reason || null, new Date().toISOString()],
  );
}

/** Tell everyone who was coming or still deciding that the evening is cancelled. */
export async function notifyEveningCancelled(db: DatabaseWrapper, eveningId: string, reason?: string | null) {
  const evening = await db.get<any>('SELECT id, title, starts_at FROM game_evenings WHERE id = ? LIMIT 1', [eveningId]);
  if (!evening) return 0;
  const when = Number.isFinite(new Date(String(evening.starts_at)).getTime())
    ? ` (${new Date(String(evening.starts_at)).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })})`
    : '';
  const why = reason === 'shortfall' ? ': не набралось игроков' : '';
  const rows = await db.all<any>(
    `SELECT player_id FROM evening_participants
      WHERE evening_id = ? AND player_id IS NOT NULL AND COALESCE(response_status, 'unanswered') IN ('going', 'late', 'thinking')`,
    [eveningId],
  );
  let sent = 0;
  for (const row of rows) {
    const result = await queuePersonalNotification(db, {
      notificationKey: `evening-cancelled:${eveningId}:${row.player_id}`,
      playerId: String(row.player_id),
      eventType: 'evening_cancelled',
      entityId: eveningId,
      text: `😔 Вечер «${String(evening.title || 'Игровой вечер')}»${when} отменён${why}. Ждём вас на следующем — анонс придёт, как обычно.`,
      actionPath: '/player/events',
    });
    if (result?.created) sent += 1;
  }
  return sent;
}
