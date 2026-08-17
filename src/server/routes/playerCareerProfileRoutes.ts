import { Router } from 'express';
import { getPlayerTitleMeta } from '../../lib/playerTitles.ts';
import { getPlayerSessionId, type AuthenticatedRequest } from '../auth.ts';
import { loadCompletedGameSnapshots } from '../services/clubGameAnalyticsService.ts';

const router = Router();
const ROLES = ['citizen', 'sheriff', 'mafia', 'don'] as const;
type Role = typeof ROLES[number];

const requireViewer = (req: AuthenticatedRequest, res: any) => {
  const viewerId = getPlayerSessionId(req);
  if (viewerId) return String(viewerId);
  if (req.userRole === 'ORGANIZER') return 'organizer';
  res.status(401).json({ error: 'Player or organizer authentication required.' });
  return null;
};

const rate = (wins: number, games: number) => games ? Math.round((wins / games) * 100) : 0;
const avatarUrl = (id: string) => `/api/player/players/${encodeURIComponent(id)}/avatar`;
const roleLabel = (role: Role) => role === 'citizen' ? 'Мирный' : role === 'sheriff' ? 'Шериф' : role === 'mafia' ? 'Мафия' : 'Дон';

const currentSeasonBounds = () => {
  const date = new Date();
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  if (month === 11) return { label: `Зима ${year}/${String(year + 1).slice(-2)}`, start: Date.UTC(year, 11, 1), end: Date.UTC(year + 1, 2, 1) };
  if (month <= 1) return { label: `Зима ${year - 1}/${String(year).slice(-2)}`, start: Date.UTC(year - 1, 11, 1), end: Date.UTC(year, 2, 1) };
  if (month <= 4) return { label: `Весна ${year}`, start: Date.UTC(year, 2, 1), end: Date.UTC(year, 5, 1) };
  if (month <= 7) return { label: `Лето ${year}`, start: Date.UTC(year, 5, 1), end: Date.UTC(year, 8, 1) };
  return { label: `Осень ${year}`, start: Date.UTC(year, 8, 1), end: Date.UTC(year, 11, 1) };
};

const safeTable = async (db: any, name: string) => {
  try {
    const row = await db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`, [name]);
    return Boolean(row);
  } catch { return false; }
};

router.get('/career/:playerId', async (req: AuthenticatedRequest, res) => {
  const viewerId = requireViewer(req, res);
  if (!viewerId) return;
  const requested = String(req.params.playerId || '').trim();
  const playerId = requested === 'me' ? (viewerId === 'organizer' ? '' : viewerId) : requested;
  if (!playerId) return res.status(400).json({ error: 'Игрок не указан' });

  try {
    const db = req.db;
    const [player, snapshots] = await Promise.all([
      db.get(`SELECT id, nickname, elo, game_level, created_at FROM players WHERE id = ? LIMIT 1`, [playerId]),
      loadCompletedGameSnapshots(db),
    ]);
    if (!player) return res.status(404).json({ error: 'Игрок не найден' });

    let selectedTitle: ReturnType<typeof getPlayerTitleMeta> = null;
    if (await safeTable(db, 'player_profile_cosmetics')) {
      const cosmetics = await db.get(`SELECT selected_title FROM player_profile_cosmetics WHERE player_id = ? LIMIT 1`, [playerId]);
      selectedTitle = getPlayerTitleMeta(cosmetics?.selected_title);
    }

    const personal = snapshots.flatMap((game) => {
      const result = game.players.find((item) => item.player_id === playerId);
      if (!result) return [];
      return [{ game, result }];
    }).sort((a, b) => b.game.dateMs - a.game.dateMs);

    const wins = personal.filter((item) => item.result.won).length;
    let currentStreak = 0;
    for (const item of personal) {
      if (!item.result.won) break;
      currentStreak += 1;
    }
    let bestStreak = 0;
    let running = 0;
    for (const item of personal.slice().reverse()) {
      if (item.result.won) {
        running += 1;
        bestStreak = Math.max(bestStreak, running);
      } else running = 0;
    }

    const roleStats = ROLES.map((role) => {
      const games = personal.filter((item) => item.result.role === role);
      const roleWins = games.filter((item) => item.result.won).length;
      return { role, label: roleLabel(role), games: games.length, wins: roleWins, win_rate: rate(roleWins, games.length) };
    });

    const redGames = personal.filter((item) => item.result.team === 'red');
    const blackGames = personal.filter((item) => item.result.team === 'black');
    const redWins = redGames.filter((item) => item.result.won).length;
    const blackWins = blackGames.filter((item) => item.result.won).length;

    const season = currentSeasonBounds();
    const seasonGames = personal.filter((item) => item.game.dateMs >= season.start && item.game.dateMs < season.end);
    const seasonWins = seasonGames.filter((item) => item.result.won).length;
    const seasonAll = new Map<string, { player_id: string; nickname: string; games: number; wins: number }>();
    for (const game of snapshots.filter((item) => item.dateMs >= season.start && item.dateMs < season.end)) {
      for (const result of game.players) {
        const stat = seasonAll.get(result.player_id) || { player_id: result.player_id, nickname: result.nickname, games: 0, wins: 0 };
        stat.nickname = result.nickname || stat.nickname;
        stat.games += 1;
        if (result.won) stat.wins += 1;
        seasonAll.set(result.player_id, stat);
      }
    }
    const seasonRanking = [...seasonAll.values()].sort((a, b) => b.wins - a.wins || rate(b.wins, b.games) - rate(a.wins, a.games) || b.games - a.games || a.nickname.localeCompare(b.nickname, 'ru'));
    const seasonPlace = seasonRanking.findIndex((item) => item.player_id === playerId) + 1;

    let achievementCount = 0;
    for (const table of ['user_achievements', 'player_achievements']) {
      if (!(await safeTable(db, table))) continue;
      try {
        const columns = await db.all(`PRAGMA table_info(${table})`);
        const names = new Set(columns.map((column: any) => String(column.name)));
        const playerColumn = ['player_id', 'user_id'].find((name) => names.has(name));
        if (!playerColumn) continue;
        const row = await db.get(`SELECT COUNT(*) AS count FROM ${table} WHERE CAST(${playerColumn} AS TEXT) = ?`, [playerId]);
        achievementCount = Math.max(achievementCount, Number(row?.count || 0));
      } catch {}
    }

    const recent = personal.slice(0, 20).map(({ game, result }) => ({
      game_key: game.id,
      date: game.played_at,
      title: game.title,
      game_number: game.game_number,
      source: game.source,
      role: result.role,
      team: result.team,
      won: result.won,
    }));

    const strongestRole = roleStats.filter((item) => item.games >= 2).sort((a, b) => b.win_rate - a.win_rate || b.games - a.games)[0] || null;

    return res.json({
      viewer_id: viewerId,
      is_self: viewerId !== 'organizer' && playerId === viewerId,
      player: {
        id: String(player.id),
        nickname: String(player.nickname || 'Игрок'),
        elo: Number(player.elo || 0),
        game_level: String(player.game_level || 'club'),
        member_since: player.created_at || null,
        avatar_url: avatarUrl(playerId),
        title: selectedTitle,
      },
      career: {
        games: personal.length,
        wins,
        win_rate: rate(wins, personal.length),
        current_streak: currentStreak,
        best_streak: bestStreak,
        achievements: achievementCount,
        red: { games: redGames.length, wins: redWins, win_rate: rate(redWins, redGames.length) },
        black: { games: blackGames.length, wins: blackWins, win_rate: rate(blackWins, blackGames.length) },
        roles: roleStats,
        strongest_role: strongestRole,
        form: personal.slice(0, 10).map((item) => item.result.won),
      },
      season: {
        label: season.label,
        games: seasonGames.length,
        wins: seasonWins,
        win_rate: rate(seasonWins, seasonGames.length),
        place: seasonPlace || null,
        total_players: seasonRanking.length,
      },
      recent_games: recent,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить карьерный профиль' });
  }
});

export default router;
