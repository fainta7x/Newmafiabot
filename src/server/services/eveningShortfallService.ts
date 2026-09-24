import type { DatabaseWrapper } from '../../db/index.ts';
import { normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { loadEveningRecruitmentState } from './eveningRecruitmentService.ts';
import { requestBotEveningRecruitment } from './botTelegramSyncService.ts';
import { enqueueOrganizerNotification } from './organizerNotificationService.ts';
import { queuePersonalNotification } from './personalNotificationRouterService.ts';

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

export async function ensureEveningShortfallSchema(db: DatabaseWrapper) {
  await db.exec(`CREATE TABLE IF NOT EXISTS evening_shortfall_actions (
    evening_id TEXT PRIMARY KEY,
    call_sent_at TEXT,
    cancel_prompt_at TEXT
  )`);
}

/** Players who said they come (the same count the recruitment state uses) against the table minimum. */
export async function loadEveningShortfall(db: DatabaseWrapper, eveningId: string) {
  const state = await loadEveningRecruitmentState(db, eveningId);
  if (!state) return null;
  const minimum = eveningMinimumPlayers(state.evening.format);
  return { state, minimum, confirmed: Number(state.confirmed_players || 0), short: Number(state.confirmed_players || 0) < minimum };
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

    if (!evening.call_sent_at && shortfall.state.can_recruit) {
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

    if (!evening.cancel_prompt_at && start - now <= CANCEL_PROMPT_HOURS * HOUR && shortfall.short) {
      await enqueueOrganizerNotification(db, {
        messageKey: `evening-shortfall:${id}`,
        eventType: 'evening_shortfall',
        entityId: id,
        text: `⚠️ Недобор на «${String(evening.title || 'Игровой вечер')}»: записались ${shortfall.confirmed} из ${shortfall.minimum}. Отменить вечер? Кнопка — на главной CRM в «Порядке в клубе».`,
      });
      await db.run(
        `INSERT INTO evening_shortfall_actions (evening_id, cancel_prompt_at) VALUES (?, ?)
         ON CONFLICT(evening_id) DO UPDATE SET cancel_prompt_at = excluded.cancel_prompt_at`,
        [id, new Date(now).toISOString()],
      );
      actions += 1;
    }
  }
  return actions;
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
