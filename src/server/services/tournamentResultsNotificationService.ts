import type { DatabaseWrapper } from '../../db/index.ts';
import { queuePersonalNotification } from './personalNotificationRouterService.ts';

/** Every participant hears once that the results are published, with his place (owner audit, 2026-10-04). */
export async function notifyTournamentResultsPublished(
  db: DatabaseWrapper,
  tournamentId: string,
  title: string,
  publicToken: string,
  standings: Array<{ player_id?: string | null; place?: number; total_points?: number }>,
) {
  let notified = 0;
  for (const row of standings) {
    if (!row.player_id) continue;
    const result = await queuePersonalNotification(db, {
      notificationKey: `tournament:${tournamentId}:results:${row.player_id}`,
      playerId: String(row.player_id),
      eventType: 'tournament_results_published',
      entityId: tournamentId,
      text: `Результаты турнира «${title}» опубликованы. Ваше место: ${row.place}, баллов: ${row.total_points}.`,
      actionPath: `/tournaments/results/${encodeURIComponent(publicToken)}`,
    });
    if (result?.created) notified += 1;
  }
  return notified;
}
