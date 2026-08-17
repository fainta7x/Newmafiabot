import { Router } from 'express';
import { getPlayerSessionId } from '../auth.ts';
import { loadCompletedGameSnapshots, type AnalyticsPlayerResult } from '../services/clubGameAnalyticsService.ts';

const router = Router();
const ROLES = ['citizen', 'sheriff', 'mafia', 'don'] as const;

type PersonalResult = {
  dateMs: number;
  date: string;
  won: boolean;
  team: 'red' | 'black';
  role: AnalyticsPlayerResult['role'];
  game_key: string;
  title: string;
};

const requirePlayerId = (req: any, res: any): string | null => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) {
    res.status(401).json({ error: 'Player authentication required.' });
    return null;
  }
  return playerId;
};

const rate = (wins: number, games: number) => games ? Math.round((wins / games) * 100) : 0;
const avatarUrl = (id: string) => `/api/player/players/${encodeURIComponent(id)}/avatar`;

const summarize = (games: PersonalResult[]) => {
  const wins = games.filter((item) => item.won).length;
  return { games: games.length, wins, win_rate: rate(wins, games.length) };
};

const tableExists = async (db: any, table: string) => {
  try {
    const row = await db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`, [table]);
    return Boolean(row);
  } catch {
    return false;
  }
};

const loadEloHistory = async (db: any, playerId: string, currentElo: number) => {
  const candidates = ['elo_ratings', 'elo_history', 'rating_history', 'player_elo_history'];
  for (const table of candidates) {
    if (!(await tableExists(db, table))) continue;
    try {
      const columns = await db.all(`PRAGMA table_info(${table})`);
      const names = new Set(columns.map((column: any) => String(column.name)));
      const playerColumn = ['player_id', 'user_id'].find((name) => names.has(name));
      const valueColumn = ['elo', 'rating', 'new_elo', 'elo_after', 'rating_after'].find((name) => names.has(name));
      const dateColumn = ['created_at', 'updated_at', 'date', 'game_date', 'rated_at'].find((name) => names.has(name));
      if (!playerColumn || !valueColumn || !dateColumn) continue;
      const rows = await db.all(`
        SELECT ${valueColumn} AS value, ${dateColumn} AS date
          FROM ${table}
         WHERE CAST(${playerColumn} AS TEXT) = ?
           AND ${valueColumn} IS NOT NULL
           AND ${dateColumn} IS NOT NULL
         ORDER BY ${dateColumn} ASC
         LIMIT 500
      `, [playerId]);
      const points = rows.flatMap((row: any) => {
        const value = Number(row.value);
        const date = new Date(String(row.date));
        if (!Number.isFinite(value) || Number.isNaN(date.getTime())) return [];
        return [{ value: Math.round(value * 10) / 10, date: date.toISOString() }];
      });
      if (points.length) return { source: table, points };
    } catch {
      // Try the next known legacy/history table shape.
    }
  }
  return {
    source: 'current_only',
    points: [{ value: Math.round(currentElo * 10) / 10, date: new Date().toISOString() }],
  };
};

router.get('/insights', async (req, res) => {
  const playerId = requirePlayerId(req, res);
  if (!playerId) return;

  try {
    const db = req.db;
    const [player, snapshots] = await Promise.all([
      db.get(`SELECT id, nickname, elo FROM players WHERE id = ? LIMIT 1`, [playerId]),
      loadCompletedGameSnapshots(db),
    ]);
    if (!player) return res.status(404).json({ error: 'Игрок не найден' });

    const personal: PersonalResult[] = snapshots.flatMap((game) => {
      const result = game.players.find((item) => item.player_id === playerId);
      if (!result) return [];
      return [{
        dateMs: game.dateMs,
        date: game.played_at,
        won: result.won,
        team: result.team,
        role: result.role,
        game_key: game.id,
        title: game.title,
      }];
    }).sort((a, b) => b.dateMs - a.dateMs);

    const career = summarize(personal);
    const recent10 = summarize(personal.slice(0, 10));
    const recent20 = summarize(personal.slice(0, 20));
    const red = summarize(personal.filter((item) => item.team === 'red'));
    const black = summarize(personal.filter((item) => item.team === 'black'));
    const roles = ROLES.map((role) => ({
      role,
      ...summarize(personal.filter((item) => item.role === role)),
    }));

    const last30Days = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const month = summarize(personal.filter((item) => item.dateMs >= last30Days));
    const trend = recent10.games >= 5 && career.games >= 10
      ? recent10.win_rate - career.win_rate
      : null;

    const vs = new Map<string, { player_id: string; nickname: string; games: number; wins: number }>();
    const together = new Map<string, {
      player_id: string;
      nickname: string;
      total_games: number;
      same_team_games: number;
      opposite_games: number;
      same_team_wins: number;
    }>();

    for (const game of snapshots) {
      const me = game.players.find((item) => item.player_id === playerId);
      if (!me) continue;
      for (const other of game.players) {
        if (other.player_id === playerId) continue;
        const social = together.get(other.player_id) || {
          player_id: other.player_id,
          nickname: other.nickname,
          total_games: 0,
          same_team_games: 0,
          opposite_games: 0,
          same_team_wins: 0,
        };
        social.nickname = other.nickname || social.nickname;
        social.total_games += 1;
        if (other.team === me.team) {
          social.same_team_games += 1;
          if (me.won) social.same_team_wins += 1;
        } else {
          social.opposite_games += 1;
          const opponent = vs.get(other.player_id) || { player_id: other.player_id, nickname: other.nickname, games: 0, wins: 0 };
          opponent.nickname = other.nickname || opponent.nickname;
          opponent.games += 1;
          if (me.won) opponent.wins += 1;
          vs.set(other.player_id, opponent);
        }
        together.set(other.player_id, social);
      }
    }

    const opponentPool = [...vs.values()].filter((item) => item.games >= 3).map((item) => ({
      ...item,
      win_rate: rate(item.wins, item.games),
      avatar_url: avatarUrl(item.player_id),
    }));
    const nemesis = opponentPool.slice().sort((a, b) => a.win_rate - b.win_rate || b.games - a.games).slice(0, 5);
    const comfortable = opponentPool.slice().sort((a, b) => b.win_rate - a.win_rate || b.games - a.games).slice(0, 5);

    const socialNodes = [...together.values()]
      .sort((a, b) => b.total_games - a.total_games || b.same_team_games - a.same_team_games || a.nickname.localeCompare(b.nickname, 'ru'))
      .slice(0, 14)
      .map((item) => ({
        ...item,
        same_team_win_rate: rate(item.same_team_wins, item.same_team_games),
        avatar_url: avatarUrl(item.player_id),
        closeness: Math.min(1, item.total_games / Math.max(1, Math.max(...[...together.values()].map((value) => value.total_games)))),
      }));

    const strongestRole = roles.filter((item) => item.games >= 2).sort((a, b) => b.win_rate - a.win_rate || b.games - a.games)[0] || null;
    const weakestRole = roles.filter((item) => item.games >= 2).sort((a, b) => a.win_rate - b.win_rate || b.games - a.games)[0] || null;
    const insights: Array<{ kind: string; title: string; text: string }> = [];
    if (trend != null && Math.abs(trend) >= 10) {
      insights.push({
        kind: trend > 0 ? 'improving' : 'cooling',
        title: trend > 0 ? 'Форма выше карьерной' : 'Форма ниже карьерной',
        text: `Последние 10: ${recent10.win_rate}% против карьерных ${career.win_rate}% (${trend > 0 ? '+' : ''}${trend} п.п.).`,
      });
    }
    if (strongestRole && weakestRole && strongestRole.role !== weakestRole.role && strongestRole.win_rate - weakestRole.win_rate >= 20) {
      insights.push({
        kind: 'role_gap',
        title: 'Выраженная ролевая разница',
        text: `Лучше всего: ${strongestRole.role} ${strongestRole.win_rate}%; сложнее всего: ${weakestRole.role} ${weakestRole.win_rate}%.`,
      });
    }
    if (red.games >= 5 && black.games >= 5 && Math.abs(red.win_rate - black.win_rate) >= 15) {
      const better = red.win_rate > black.win_rate ? 'красных' : 'чёрных';
      insights.push({
        kind: 'side_gap',
        title: `Сильнее за ${better}`,
        text: `Красные ${red.win_rate}% · чёрные ${black.win_rate}%.`,
      });
    }

    const eloHistory = await loadEloHistory(db, playerId, Number(player.elo || 0));

    return res.json({
      player: {
        id: String(player.id),
        nickname: String(player.nickname || 'Игрок'),
        elo: Number(player.elo || 0),
        avatar_url: avatarUrl(playerId),
      },
      performance: {
        career,
        recent10,
        recent20,
        last30_days: month,
        red,
        black,
        roles,
        trend_vs_career: trend,
      },
      insights,
      opponents: { nemesis, comfortable },
      social_graph: {
        center: { player_id: playerId, nickname: String(player.nickname || 'Игрок'), avatar_url: avatarUrl(playerId) },
        nodes: socialNodes,
      },
      elo_history: eloHistory,
      meta: {
        opponents: 'Nemesis/удобные соперники показываются только при минимум трёх очных играх по разные стороны и описывают прошлую статистику, а не прогноз будущей партии.',
        elo_history: eloHistory.source === 'current_only' ? 'Историческая таблица Elo не найдена в совместимом формате; показано только текущее значение без выдуманного прошлого.' : `История Elo взята из ${eloHistory.source}.`,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить персональную аналитику' });
  }
});

export default router;
