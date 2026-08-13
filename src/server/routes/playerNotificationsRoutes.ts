import { Router } from 'express';
import { getPlayerSessionId } from '../auth.ts';
import { loadCompletedGameSnapshots } from '../services/clubGameAnalyticsService.ts';
import { loadPlayerEloHistory } from '../services/playerEloHistoryService.ts';
import { loadPlayerEveningSummaries } from '../services/playerEveningSummaryService.ts';

const router = Router();
const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

const requirePlayerId = (req: any, res: any): string | null => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) {
    res.status(401).json({ error: 'Player authentication required.' });
    return null;
  }
  return playerId;
};

const ensureSchema = async (db: any) => {
  await db.run(`
    CREATE TABLE IF NOT EXISTS player_notification_reads (
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      notification_key TEXT NOT NULL,
      read_at TEXT NOT NULL,
      PRIMARY KEY (player_id, notification_key)
    )
  `);
};

const safeTableExists = async (db: any, table: string) => {
  try {
    const row = await db.get(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`, [table]);
    return Boolean(row);
  } catch {
    return false;
  }
};

const signed = (value: number) => `${value > 0 ? '+' : ''}${Math.round(value * 100) / 100}`;

const buildNotifications = async (db: any, playerId: string) => {
  const now = Date.now();
  const items: Array<{
    key: string;
    type: string;
    icon: string;
    title: string;
    text: string;
    date: string;
    action?: { kind: string; target?: string };
    priority: number;
  }> = [];

  const upcoming = await db.get(`
    SELECT e.id, e.title, e.starts_at, e.venue, ep.response_status
      FROM evening_participants ep
      JOIN game_evenings e ON e.id = ep.evening_id
     WHERE ep.player_id = ?
       AND ep.response_status IN ('going', 'late')
       AND e.status IN ('published', 'active')
       AND e.settled_at IS NULL
       AND datetime(e.starts_at) >= datetime('now')
     ORDER BY datetime(e.starts_at) ASC
     LIMIT 1
  `, [playerId]);
  if (upcoming) {
    const starts = new Date(String(upcoming.starts_at));
    const diff = starts.getTime() - now;
    if (Number.isFinite(diff) && diff <= SEVEN_DAYS) {
      const days = Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
      const when = days === 0 ? 'сегодня' : days === 1 ? 'завтра' : `через ${days} дн.`;
      items.push({
        key: `upcoming:${upcoming.id}:${String(upcoming.response_status)}`,
        type: 'upcoming_evening',
        icon: '📅',
        title: `Игровой вечер ${when}`,
        text: `${String(upcoming.title || '2LA noire')}${upcoming.venue ? ` · ${upcoming.venue}` : ''}`,
        date: starts.toISOString(),
        action: { kind: 'player_home' },
        priority: diff <= 24 * 60 * 60 * 1000 ? 95 : 75,
      });
    }
  }

  if (await safeTableExists(db, 'evening_announcement_dm_tracking')) {
    const unanswered = await db.get(`
      SELECT e.id, e.title, e.starts_at
        FROM evening_announcement_dm_tracking t
        JOIN game_evenings e ON e.id = t.evening_id
   LEFT JOIN evening_participants ep ON ep.evening_id = e.id AND ep.player_id = t.player_id
       WHERE t.player_id = ?
         AND t.first_sent_at IS NOT NULL
         AND COALESCE(ep.response_status, 'unanswered') NOT IN ('going', 'late', 'thinking', 'declined')
         AND e.status IN ('published', 'active')
         AND e.settled_at IS NULL
         AND datetime(e.starts_at) >= datetime('now')
       ORDER BY datetime(e.starts_at) ASC
       LIMIT 1
    `, [playerId]);
    if (unanswered) {
      items.push({
        key: `answer:${unanswered.id}`,
        type: 'awaiting_response',
        icon: '💬',
        title: 'Нужен твой ответ',
        text: `Ответь на приглашение: ${String(unanswered.title || 'игровой вечер')}`,
        date: new Date(String(unanswered.starts_at)).toISOString(),
        action: { kind: 'player_home' },
        priority: 100,
      });
    }
  }

  const [snapshots, eloTimeline, eveningSummaries] = await Promise.all([
    loadCompletedGameSnapshots(db),
    loadPlayerEloHistory(db),
    loadPlayerEveningSummaries(db, playerId, 3),
  ]);

  const personalGames = snapshots.filter((game) => game.players.some((item) => item.player_id === playerId));
  const recentGame = personalGames[0];
  if (recentGame && now - recentGame.dateMs <= THREE_DAYS) {
    const me = recentGame.players.find((item) => item.player_id === playerId)!;
    items.push({
      key: `result:${recentGame.id}`,
      type: 'game_result',
      icon: me.won ? '🏆' : '🎭',
      title: me.won ? 'Новая победа в истории' : 'Результат игры опубликован',
      text: `${recentGame.title} · ${me.won ? 'победа' : 'поражение'} · ${me.role === 'sheriff' ? 'Шериф' : me.role === 'don' ? 'Дон' : me.role === 'mafia' ? 'Мафия' : 'Мирный'}`,
      date: recentGame.played_at,
      action: { kind: 'games', target: recentGame.id },
      priority: 70,
    });
  }

  const latestElo = eloTimeline.slice().reverse().find((event) => event.players.some((item) => item.playerId === playerId)) || null;
  const latestEloRow = latestElo?.players.find((item) => item.playerId === playerId) || null;
  const latestEloMs = latestElo ? new Date(latestElo.sortAt).getTime() : 0;
  if (latestElo && latestEloRow && Number.isFinite(latestEloMs) && now - latestEloMs <= THREE_DAYS && Math.abs(latestEloRow.totalDelta) >= 0.01) {
    items.push({
      key: `elo:${latestElo.source}:${latestElo.sourceId}:${Math.round(latestEloRow.eloAfter * 100)}`,
      type: 'elo_change',
      icon: latestEloRow.totalDelta > 0 ? '📈' : '📉',
      title: `Elo ${signed(latestEloRow.totalDelta)}`,
      text: `${Math.round(latestEloRow.eloBefore)} → ${Math.round(latestEloRow.eloAfter)} · команда имела ${Math.round(latestEloRow.expectedTeamResult * 100)}% расчётного шанса`,
      date: latestElo.sortAt,
      action: { kind: 'elo_journey', target: `${latestElo.source}:${latestElo.sourceId}` },
      priority: 82,
    });
  }

  const latestSummary = eveningSummaries[0] || null;
  if (latestSummary) {
    const summaryMs = new Date(String(latestSummary.settled_at || latestSummary.starts_at)).getTime();
    if (Number.isFinite(summaryMs) && now - summaryMs <= SEVEN_DAYS) {
      items.push({
        key: `evening-summary:${latestSummary.id}:${latestSummary.score}:${latestSummary.player.elo_delta}`,
        type: 'evening_summary',
        icon: '🎬',
        title: 'Итоги вечера готовы',
        text: `Красные ${latestSummary.red_wins}:${latestSummary.black_wins} чёрные · твой результат ${latestSummary.player.wins}/${latestSummary.player.games}${Math.abs(latestSummary.player.elo_delta) >= 0.01 ? ` · Elo ${signed(latestSummary.player.elo_delta)}` : ''}`,
        date: new Date(summaryMs).toISOString(),
        action: { kind: 'evening_summary', target: latestSummary.id },
        priority: 90,
      });
    }
  }

  let streak = 0;
  for (const game of personalGames) {
    const me = game.players.find((item) => item.player_id === playerId);
    if (!me?.won) break;
    streak += 1;
  }
  if (streak >= 3 && recentGame) {
    items.push({
      key: `streak:${playerId}:${streak}:${recentGame.id}`,
      type: 'streak',
      icon: '🔥',
      title: `${streak} побед подряд`,
      text: 'Ты на серии. Посмотри прогресс и форму клуба.',
      date: recentGame.played_at,
      action: { kind: 'club' },
      priority: 85,
    });
  }

  const attendedRecent = await db.all(`
    SELECT e.id, e.title, e.starts_at, e.settled_at
      FROM evening_participants ep
      JOIN game_evenings e ON e.id = ep.evening_id
     WHERE ep.player_id = ?
       AND ep.attendance_status = 'attended'
       AND (e.status = 'completed' OR e.settled_at IS NOT NULL)
       AND datetime(COALESCE(e.settled_at, e.starts_at)) >= datetime('now', '-7 days')
     ORDER BY datetime(COALESCE(e.settled_at, e.starts_at)) DESC
     LIMIT 3
  `, [playerId]);
  const votesTableExists = await safeTableExists(db, 'evening_player_votes');
  for (const evening of attendedRecent) {
    const baseMs = new Date(String(evening.settled_at || evening.starts_at)).getTime();
    if (!Number.isFinite(baseMs) || baseMs + SEVEN_DAYS <= now) continue;
    let votedCount = 0;
    if (votesTableExists) {
      const row = await db.get(`
        SELECT COUNT(DISTINCT category) AS count
          FROM evening_player_votes
         WHERE evening_id = ? AND voter_player_id = ?
      `, [evening.id, playerId]);
      votedCount = Number(row?.count || 0);
    }
    if (votedCount < 4) {
      items.push({
        key: `vote:${evening.id}:${votedCount}`,
        type: 'evening_vote',
        icon: '🗳️',
        title: votedCount ? `Голосование: ${votedCount}/4` : 'Выбери героев вечера',
        text: `${String(evening.title || 'Игровой вечер')} · симпатия, красный, чёрный и Шериф`,
        date: new Date(baseMs).toISOString(),
        action: { kind: 'club', target: String(evening.id) },
        priority: 80,
      });
      break;
    }
  }

  return items.sort((a, b) => b.priority - a.priority || new Date(b.date).getTime() - new Date(a.date).getTime());
};

router.get('/notifications', async (req, res) => {
  const playerId = requirePlayerId(req, res);
  if (!playerId) return;
  try {
    const db = (req as any).db;
    await ensureSchema(db);
    const [items, reads] = await Promise.all([
      buildNotifications(db, playerId),
      db.all(`SELECT notification_key FROM player_notification_reads WHERE player_id = ?`, [playerId]),
    ]);
    const readKeys = new Set(reads.map((row: any) => String(row.notification_key)));
    const payload = items.map((item) => ({ ...item, read: readKeys.has(item.key) }));
    return res.json({
      unread: payload.filter((item) => !item.read).length,
      items: payload,
      generated_at: new Date().toISOString(),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить уведомления' });
  }
});

router.post('/notifications/read', async (req, res) => {
  const playerId = requirePlayerId(req, res);
  if (!playerId) return;
  const keys = Array.isArray(req.body?.keys) ? req.body.keys.map((value: unknown) => String(value || '').trim()).filter(Boolean).slice(0, 50) : [];
  if (!keys.length) return res.json({ success: true, read: 0 });

  try {
    const db = (req as any).db;
    await ensureSchema(db);
    const now = new Date().toISOString();
    for (const key of keys) {
      await db.run(`
        INSERT INTO player_notification_reads (player_id, notification_key, read_at)
        VALUES (?, ?, ?)
        ON CONFLICT(player_id, notification_key) DO UPDATE SET read_at = excluded.read_at
      `, [playerId, key, now]);
    }
    return res.json({ success: true, read: keys.length, read_at: now });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось отметить уведомления' });
  }
});

export default router;
