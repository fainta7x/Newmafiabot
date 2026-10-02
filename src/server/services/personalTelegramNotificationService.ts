import { runTodayPostSchedule } from './eveningTodayPostService.ts';
import type { DatabaseWrapper } from '../../db/index.ts';
import { loadPlayerEloHistory } from './playerEloHistoryService.ts';
import { queuePersonalNotification } from './personalNotificationRouterService.ts';
import { queueEveningRsvpNudges } from './eveningRsvpNudgeService.ts';
import { enforceTournamentPaymentDeadlines } from './tournamentEveningService.ts';
import { runEveningShortfallChecks } from './eveningShortfallService.ts';
import { runAutomaticUnansweredReminders } from './eveningAutoReminderService.ts';
import { runClubResultPosts } from './clubResultPostService.ts';

const SCAN_INTERVAL_MS = 60_000;
let timer: ReturnType<typeof setInterval> | null = null;
let scanInFlight = false;

const signed = (value: number) => `${value > 0 ? '+' : ''}${Math.round(value * 100) / 100}`;

// Evening messages depend on the player's answer; see eveningRsvpNudgeService.
// Tournament payment deadlines ride the same worker: reminders, releasing unpaid places, calling in the next.
// «Напомнить неответившим» goes out by itself two days before (eveningAutoReminderService).
const queueEveningNotifications = async (db: DatabaseWrapper) => (await queueEveningRsvpNudges(db)) + (await enforceTournamentPaymentDeadlines(db))
  + (await runEveningShortfallChecks(db)) + (await runAutomaticUnansweredReminders(db).catch((error) => { console.error('[AUTO REMINDER] failed:', error); return 0; }))
  // The game blank and the evening summary for the club chat (clubResultPostService).
  + (await runClubResultPosts(db).catch((error) => { console.error('[CLUB RESULTS] failed:', error); return 0; }))
  // «Сегодня играем» at 17:00 Moscow time, or the organizer's decision when the evening is short (eveningTodayPostService).
  + (await runTodayPostSchedule(db).catch((error) => { console.error('[TODAY POST] failed:', error); return 0; }));

// A tournament Elo note is news only shortly after the game; older games never get one.
const ELO_NOTE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

async function queueEloNotifications(db: DatabaseWrapper, now = Date.now()) {
  let queued = 0;
  // Club games: one personal message per evening after closing (clubResultPostService), not one per game.
  const eloTimeline = await loadPlayerEloHistory(db);
  for (const event of eloTimeline.slice(-100)) {
    // The club game's Elo rides in the evening's personal message; tournaments keep their own note.
    if (event.source === 'club') continue;
    const playedAt = new Date(String(event.sortAt || '')).getTime();
    if (!Number.isFinite(playedAt) || now - playedAt > ELO_NOTE_MAX_AGE_MS) continue;
    for (const player of event.players || []) {
      const playerId = String(player.playerId || '');
      const delta = Number(player.totalDelta || 0);
      if (!playerId || Math.abs(delta) < 0.01) continue;
      // One note per player and game. A recalculation (the ×5 scale, a corrected protocol) changes the
      // numbers but must not send the same game again; older keys carried the new Elo as a suffix.
      const notificationKey = `elo:${event.source}:${event.sourceId}:${playerId}`;
      // A note under the old suffixed key was already sent. The stable key still goes through
      // queuePersonalNotification, which is idempotent and repairs a missing outbox row after a crash.
      const sentUnderOldKey = await db.get(
        'SELECT 1 FROM personal_notification_deliveries WHERE notification_key LIKE ? LIMIT 1',
        [`${notificationKey}:%`],
      ).catch(() => null);
      if (sentUnderOldKey) continue;
      await queuePersonalNotification(db, {
        notificationKey,
        playerId, eventType: 'elo_change', entityId: `${event.source}:${event.sourceId}`,
        text: `📊 Рейтинг Elo изменился\n${signed(delta)} · ${Math.round(Number(player.eloBefore || 0))} → ${Math.round(Number(player.eloAfter || 0))}.`,
        actionPath: '/player/elo',
      });
      queued++;
    }
  }
  return queued;
}

async function queueBettingResults(db: DatabaseWrapper) {
  const rows = await db.all<any>(`
    SELECT bp.id AS pool_id, bp.game_id, bp.game_number, bp.status AS pool_status, bp.settlement_seq,
           bb.id AS bet_id, bb.player_id, bb.team, bb.amount, bb.status AS bet_status,
           bb.payout_amount, bb.final_coefficient
      FROM betting_bets bb
      JOIN betting_pools bp ON bp.id = bb.pool_id
      JOIN players p ON p.id = bb.player_id
     WHERE bp.status IN ('settled', 'refunded')
       AND COALESCE(p.contact_status, p.lifecycle_status, 'normal') NOT IN ('blocked', 'archived', 'inactive')
  `);
  let queued = 0;
  for (const row of rows) {
    const refunded = row.pool_status === 'refunded' || row.bet_status === 'refunded';
    const payout = Number(row.payout_amount || 0);
    const amount = Number(row.amount || 0);
    const coefficient = Number(row.final_coefficient || 0);
    const result = refunded
      ? `↩️ Ставка ${amount} жетонов возвращена.`
      : payout > 0
        ? `🏆 Выплата: ${payout} жетонов${coefficient > 0 ? ` · коэффициент ${coefficient.toFixed(2)}` : ''}.`
        : `Ставка ${amount} жетонов не сыграла.`;
    await queuePersonalNotification(db, {
      notificationKey: `bet-result:${row.pool_id}:${row.bet_id}:${row.pool_status}:${row.settlement_seq}`,
      playerId: String(row.player_id), eventType: refunded ? 'bet_refund' : 'bet_result', entityId: row.pool_id,
      text: `🎲 Итог ставки на игру №${row.game_number || row.game_id}\n${result}`,
      actionPath: '/player/wallet',
    });
    queued++;
  }
  return queued;
}

export async function reconcilePersonalNotifications(db: DatabaseWrapper) {
  const [evenings, gamesAndElo, betting] = await Promise.all([
    queueEveningNotifications(db), queueEloNotifications(db), queueBettingResults(db),
  ]);
  return { queued: evenings + gamesAndElo + betting, evenings, games_and_elo: gamesAndElo, betting };
}

// Compatibility exports while callers migrate; delivery itself is no longer Telegram-specific.
export const reconcilePersonalTelegramNotifications = reconcilePersonalNotifications;

export function startPersonalTelegramNotificationWorker(db: DatabaseWrapper) {
  if (timer) return;
  const run = () => {
    if (scanInFlight) return;
    scanInFlight = true;
    void reconcilePersonalNotifications(db)
      .catch((error) => console.error('[PERSONAL NOTIFICATIONS] reconciliation failed:', error instanceof Error ? error.message : String(error)))
      .finally(() => { scanInFlight = false; });
  };
  setTimeout(run, 3_000).unref?.();
  timer = setInterval(run, SCAN_INTERVAL_MS);
  timer.unref?.();
}
