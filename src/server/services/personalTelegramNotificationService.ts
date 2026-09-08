import type { DatabaseWrapper } from '../../db/index.ts';
import { loadPlayerEloHistory } from './playerEloHistoryService.ts';
import { enqueueTelegramMessage, kickTelegramMessageOutbox } from './telegramMessageOutboxService.ts';

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
           p.telegram_user_id, e.id AS evening_id, e.title, e.starts_at, e.venue, e.status
      FROM evening_participants ep
      JOIN players p ON p.id = ep.player_id
      JOIN game_evenings e ON e.id = ep.evening_id
     WHERE p.telegram_user_id IS NOT NULL AND TRIM(p.telegram_user_id) != ''
       AND e.status IN ('published', 'active') AND e.settled_at IS NULL
       AND datetime(e.starts_at) >= datetime('now', '-6 hours')
       AND datetime(e.starts_at) <= datetime('now', '+7 days')
  `);
  const now = Date.now();
  let queued = 0;
  for (const row of rows) {
    const playerId = String(row.player_id);
    const chatId = String(row.telegram_user_id);
    const eveningId = String(row.evening_id);
    const response = String(row.response_status || 'unanswered');
    const attendance = String(row.attendance_status || 'unknown');
    const startsAt = new Date(String(row.starts_at)).getTime();
    const title = String(row.title || 'Игровой вечер');
    const place = row.venue ? ` · ${String(row.venue)}` : '';
    const diff = startsAt - now;

    if (response === 'unanswered') {
      await enqueueTelegramMessage(db, {
        messageKey: `personal:invite:${eveningId}:${playerId}`,
        category: 'personal', eventType: 'invitation', entityId: eveningId, playerId, chatId,
        text: `💬 <b>Нужно подтвердить участие</b>\n${title}${place}\nОткрой личный кабинет и ответь на приглашение.`,
      });
      queued++;
    }

    if (Number.isFinite(diff) && diff >= 0 && diff <= 7 * DAY_MS && ['going', 'late'].includes(response)) {
      await enqueueTelegramMessage(db, {
        messageKey: `personal:upcoming:${eveningId}:${playerId}:${response}`,
        category: 'personal', eventType: 'upcoming_evening', entityId: eveningId, playerId, chatId,
        text: `📅 <b>Ты записан на игровой вечер</b>\n${title}${place}\nСтатус: ${response === 'late' ? 'буду позже' : 'иду'}.`,
      });
      queued++;
    }

    // A distinct canonical state is delivered once. Reconciliation does not require
    // the cabinet to open and does not manufacture a response for manual attendees.
    if (response !== 'unanswered' || attendance !== 'unknown') {
      await enqueueTelegramMessage(db, {
        messageKey: `personal:booking-state:${eveningId}:${playerId}:${response}:${attendance}`,
        category: 'personal', eventType: 'booking_attendance_status', entityId: eveningId, playerId, chatId,
        text: `✅ <b>Статус игрового вечера обновлён</b>\n${title}\nОтвет: ${response} · присутствие: ${attendance}.`,
      });
      queued++;
    }

    if (Number.isFinite(diff) && diff >= 0 && diff <= DAY_MS && ['going', 'late'].includes(response)) {
      await enqueueTelegramMessage(db, {
        messageKey: `personal:reminder:24h:${eveningId}:${playerId}`,
        category: 'personal', eventType: 'evening_reminder', entityId: eveningId, playerId, chatId,
        text: `⏰ <b>Напоминание об игровом вечере</b>\n${title}${place}\nНачало уже в ближайшие 24 часа.`,
      });
      queued++;
    }
    if (Number.isFinite(diff) && diff >= -2 * 60 * 60 * 1000 && diff <= 2 * 60 * 60 * 1000
      && ['going', 'late'].includes(response) && attendance !== 'attended') {
      await enqueueTelegramMessage(db, {
        messageKey: `personal:attendance-confirm:${eveningId}:${playerId}`,
        category: 'personal', eventType: 'attendance_confirmation', entityId: eveningId, playerId, chatId,
        text: `📍 <b>Ты уже на месте?</b>\n${title}\nПроверь свой статус посещения в личном кабинете.`,
      });
      queued++;
    }
  }
  return queued;
}

async function queueGameAndEloNotifications(db: DatabaseWrapper) {
  const linked = await db.all<any>(`
    SELECT id, telegram_user_id FROM players
     WHERE telegram_user_id IS NOT NULL AND TRIM(telegram_user_id) != ''
  `);
  const chatByPlayer = new Map(linked.map((row: any) => [String(row.id), String(row.telegram_user_id)]));
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
      ? envelope.protocol.winner_team
      : null;
    const results = Array.isArray(envelope.player_results) ? envelope.player_results : [];
    for (const result of results) {
      const playerId = String(result?.player_id || '');
      const chatId = chatByPlayer.get(playerId);
      if (!chatId) continue;
      const role = String(result?.role || '');
      const team = teamForRole(role);
      const won = Boolean(winner && team === winner);
      await enqueueTelegramMessage(db, {
        messageKey: `personal:game-result:${game.id}:${playerId}`,
        category: 'personal', eventType: 'game_result', entityId: game.id, playerId, chatId,
        text: `🎭 <b>Результат игры №${game.global_game_number || game.id}</b>\n${won ? 'Победа' : 'Поражение'}${role ? ` · роль: ${role}` : ''}.`,
      });
      queued++;
    }
  }

  const eloTimeline = await loadPlayerEloHistory(db);
  for (const event of eloTimeline.slice(-100)) {
    for (const player of event.players || []) {
      const playerId = String(player.playerId || '');
      const chatId = chatByPlayer.get(playerId);
      const delta = Number(player.totalDelta || 0);
      if (!chatId || Math.abs(delta) < 0.01) continue;
      await enqueueTelegramMessage(db, {
        messageKey: `personal:elo:${event.source}:${event.sourceId}:${playerId}:${Math.round(Number(player.eloAfter || 0) * 100)}`,
        category: 'personal', eventType: 'elo_change', entityId: `${event.source}:${event.sourceId}`, playerId, chatId,
        text: `📊 <b>Рейтинг Elo изменился</b>\n${signed(delta)} · ${Math.round(Number(player.eloBefore || 0))} → ${Math.round(Number(player.eloAfter || 0))}.`,
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
           bb.payout_amount, bb.final_coefficient, p.telegram_user_id
      FROM betting_bets bb
      JOIN betting_pools bp ON bp.id = bb.pool_id
      JOIN players p ON p.id = bb.player_id
     WHERE bp.status IN ('settled', 'refunded')
       AND p.telegram_user_id IS NOT NULL AND TRIM(p.telegram_user_id) != ''
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
    await enqueueTelegramMessage(db, {
      messageKey: `personal:bet-result:${row.pool_id}:${row.bet_id}:${row.pool_status}:${row.settlement_seq}`,
      category: 'personal', eventType: refunded ? 'bet_refund' : 'bet_result', entityId: row.pool_id,
      playerId: String(row.player_id), chatId: String(row.telegram_user_id),
      text: `🎲 <b>Итог ставки на игру №${row.game_number || row.game_id}</b>\n${result}`,
    });
    queued++;
  }
  return queued;
}

export async function reconcilePersonalTelegramNotifications(db: DatabaseWrapper) {
  const [evenings, gamesAndElo, betting] = await Promise.all([
    queueEveningNotifications(db),
    queueGameAndEloNotifications(db),
    queueBettingResults(db),
  ]);
  if (evenings + gamesAndElo + betting > 0) kickTelegramMessageOutbox(db);
  return { queued: evenings + gamesAndElo + betting, evenings, games_and_elo: gamesAndElo, betting };
}

export function startPersonalTelegramNotificationWorker(db: DatabaseWrapper) {
  if (timer) return;
  const run = () => {
    if (scanInFlight) return;
    scanInFlight = true;
    void reconcilePersonalTelegramNotifications(db)
      .catch((error) => console.error('[TELEGRAM PERSONAL] reconciliation failed:', error))
      .finally(() => { scanInFlight = false; });
  };
  setTimeout(run, 3_000).unref?.();
  timer = setInterval(run, SCAN_INTERVAL_MS);
  timer.unref?.();
}
