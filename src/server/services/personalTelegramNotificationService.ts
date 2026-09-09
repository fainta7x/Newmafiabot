import type { DatabaseWrapper } from '../../db/index.ts';
import { loadPlayerEloHistory } from './playerEloHistoryService.ts';
import { queuePersonalNotification } from './personalNotificationRouterService.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const SCAN_INTERVAL_MS = 60_000;
let timer: ReturnType<typeof setInterval> | null = null;
let scanInFlight = false;

const safeJson = (value: unknown): any => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try { return JSON.parse(value); } catch { return null; }
};
const signed = (value: number) => `${value > 0 ? '+' : ''}${Math.round(value * 100) / 100}`;
const teamForRole = (role: unknown): 'red' | 'black' | null => {
  const value = String(role || '').toLocaleLowerCase('ru-RU');
  if (value === 'don' || value === 'mafia' || value === 'дон' || value === 'мафия') return 'black';
  if (value === 'citizen' || value === 'sheriff' || value === 'мирный' || value === 'шериф') return 'red';
  return null;
};

async function queueEveningNotifications(db: DatabaseWrapper) {
  const rows = await db.all<any>(`
    SELECT ep.id AS participant_id, ep.player_id, ep.response_status, ep.attendance_status,
           e.id AS evening_id, e.title, e.starts_at, e.venue, e.status
      FROM evening_participants ep
      JOIN players p ON p.id = ep.player_id
      JOIN game_evenings e ON e.id = ep.evening_id
     WHERE e.status IN ('published', 'active') AND e.settled_at IS NULL
       AND COALESCE(p.contact_status, p.lifecycle_status, 'normal') NOT IN ('blocked', 'archived', 'inactive')
       AND datetime(e.starts_at) >= datetime('now', '-6 hours')
       AND datetime(e.starts_at) <= datetime('now', '+7 days')
  `);
  const now = Date.now();
  let queued = 0;
  for (const row of rows) {
    const playerId = String(row.player_id);
    const eveningId = String(row.evening_id);
    const response = String(row.response_status || 'unanswered');
    const attendance = String(row.attendance_status || 'unknown');
    const startsAt = new Date(String(row.starts_at)).getTime();
    const title = String(row.title || 'Игровой вечер');
    const place = row.venue ? ` · ${String(row.venue)}` : '';
    const diff = startsAt - now;

    if (response === 'unanswered') {
      await queuePersonalNotification(db, {
        notificationKey: `invite:${eveningId}:${playerId}`,
        playerId, eventType: 'invitation', entityId: eveningId,
        text: `💬 Нужно подтвердить участие\n${title}${place}\nОткрой личный кабинет и ответь на приглашение.`,
        actionPath: `/player/events/${encodeURIComponent(eveningId)}`,
      });
      queued++;
    }
    if (Number.isFinite(diff) && diff >= 0 && diff <= 7 * DAY_MS && ['going', 'late'].includes(response)) {
      await queuePersonalNotification(db, {
        notificationKey: `upcoming:${eveningId}:${playerId}:${response}`,
        playerId, eventType: 'upcoming_evening', entityId: eveningId,
        text: `📅 Ты записан на игровой вечер\n${title}${place}\nСтатус: ${response === 'late' ? 'буду позже' : 'иду'}.`,
        actionPath: `/player/events/${encodeURIComponent(eveningId)}`,
      });
      queued++;
    }
    if (response !== 'unanswered' || attendance !== 'unknown') {
      await queuePersonalNotification(db, {
        notificationKey: `booking-state:${eveningId}:${playerId}:${response}:${attendance}`,
        playerId, eventType: 'booking_attendance_status', entityId: eveningId,
        text: `✅ Статус игрового вечера обновлён\n${title}\nОтвет: ${response} · присутствие: ${attendance}.`,
        actionPath: `/player/events/${encodeURIComponent(eveningId)}`,
      });
      queued++;
    }
    if (Number.isFinite(diff) && diff >= 0 && diff <= DAY_MS && ['going', 'late'].includes(response)) {
      await queuePersonalNotification(db, {
        notificationKey: `reminder:24h:${eveningId}:${playerId}`,
        playerId, eventType: 'evening_reminder', entityId: eveningId,
        text: `⏰ Напоминание об игровом вечере\n${title}${place}\nНачало уже в ближайшие 24 часа.`,
        actionPath: `/player/events/${encodeURIComponent(eveningId)}`,
      });
      queued++;
    }
    if (Number.isFinite(diff) && diff >= -2 * 60 * 60 * 1000 && diff <= 2 * 60 * 60 * 1000
      && ['going', 'late'].includes(response) && attendance !== 'attended') {
      await queuePersonalNotification(db, {
        notificationKey: `attendance-confirm:${eveningId}:${playerId}`,
        playerId, eventType: 'attendance_confirmation', entityId: eveningId,
        text: `📍 Ты уже на месте?\n${title}\nПроверь свой статус посещения в личном кабинете.`,
        actionPath: `/player/events/${encodeURIComponent(eveningId)}`,
      });
      queued++;
    }
  }
  return queued;
}

async function queueGameAndEloNotifications(db: DatabaseWrapper) {
  let queued = 0;
  const games = await db.all<any>(`
    SELECT id, global_game_number, game_date, protocol_text
      FROM games
     WHERE archived_at IS NULL
     ORDER BY id DESC LIMIT 100
  `);
  for (const game of games) {
    const envelope = safeJson(game.protocol_text);
    if (envelope?.kind !== 'club_evening_protocol' || envelope?.protocol?.status !== 'completed') continue;
    const winner = envelope?.protocol?.winner_team === 'red' || envelope?.protocol?.winner_team === 'black'
      ? envelope.protocol.winner_team : null;
    const results = Array.isArray(envelope.player_results) ? envelope.player_results : [];
    for (const result of results) {
      const playerId = String(result?.player_id || '');
      if (!playerId) continue;
      const role = String(result?.role || '');
      const team = teamForRole(role);
      const won = Boolean(winner && team === winner);
      await queuePersonalNotification(db, {
        notificationKey: `game-result:${game.id}:${playerId}`,
        playerId, eventType: 'game_result', entityId: game.id,
        text: `🎭 Результат игры №${game.global_game_number || game.id}\n${won ? 'Победа' : 'Поражение'}${role ? ` · роль: ${role}` : ''}.`,
        actionPath: `/player/games/${encodeURIComponent(String(game.id))}`,
      });
      queued++;
    }
  }

  const eloTimeline = await loadPlayerEloHistory(db);
  for (const event of eloTimeline.slice(-100)) {
    for (const player of event.players || []) {
      const playerId = String(player.playerId || '');
      const delta = Number(player.totalDelta || 0);
      if (!playerId || Math.abs(delta) < 0.01) continue;
      await queuePersonalNotification(db, {
        notificationKey: `elo:${event.source}:${event.sourceId}:${playerId}:${Math.round(Number(player.eloAfter || 0) * 100)}`,
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
    queueEveningNotifications(db), queueGameAndEloNotifications(db), queueBettingResults(db),
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
