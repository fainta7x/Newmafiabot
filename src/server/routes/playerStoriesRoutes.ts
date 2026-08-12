import { Router } from 'express';
import { getPlayerSessionId } from '../auth.ts';
import { loadCompletedGameSnapshots, type CompletedGameSnapshot } from '../services/clubGameAnalyticsService.ts';

const router = Router();

const requirePlayerId = (req: any, res: any): string | null => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) {
    res.status(401).json({ error: 'Player authentication required.' });
    return null;
  }
  return playerId;
};

const avatarUrl = (playerId: string) => `/api/player/players/${encodeURIComponent(playerId)}/avatar`;
const winRate = (wins: number, games: number) => games ? Math.round((wins / games) * 100) : 0;

const summarizeEvening = (evening: any, games: CompletedGameSnapshot[], attendanceCount: number) => {
  const chronological = games.slice().sort((a, b) => a.dateMs - b.dateMs || a.game_number - b.game_number);
  let red = 0;
  let black = 0;
  const playerStats = new Map<string, { player_id: string; nickname: string; games: number; wins: number }>();

  const timeline = chronological.map((game, index) => {
    if (game.winner_team === 'red') red += 1;
    else black += 1;

    for (const player of game.players) {
      const stat = playerStats.get(player.player_id) || {
        player_id: player.player_id,
        nickname: player.nickname,
        games: 0,
        wins: 0,
      };
      stat.games += 1;
      if (player.won) stat.wins += 1;
      playerStats.set(player.player_id, stat);
    }

    return {
      type: 'game_result' as const,
      game_key: game.id,
      local_number: index + 1,
      played_at: game.played_at,
      winner_team: game.winner_team,
      score_after: { red, black },
      player_count: game.players.length,
    };
  });

  const allStats = [...playerStats.values()];
  const candidates = allStats.some((item) => item.games >= 2)
    ? allStats.filter((item) => item.games >= 2)
    : allStats;
  const playerOfEvening = candidates
    .slice()
    .sort((a, b) => b.wins - a.wins || winRate(b.wins, b.games) - winRate(a.wins, a.games) || b.games - a.games || a.nickname.localeCompare(b.nickname, 'ru'))[0] || null;

  return {
    id: String(evening.id),
    title: String(evening.title || games[0]?.title || 'Игровой вечер'),
    starts_at: evening.starts_at || games[0]?.date || null,
    settled_at: evening.settled_at || null,
    venue: evening.venue || null,
    format: evening.format || null,
    games: chronological.length,
    players: new Set(chronological.flatMap((game) => game.players.map((player) => player.player_id))).size,
    attended: Number(attendanceCount || 0),
    score: { red, black },
    winner_side: red === black ? 'draw' : red > black ? 'red' : 'black',
    timeline,
    player_of_evening: playerOfEvening ? {
      ...playerOfEvening,
      win_rate: winRate(playerOfEvening.wins, playerOfEvening.games),
      avatar_url: avatarUrl(playerOfEvening.player_id),
      basis: 'По результатам вечера: сначала число побед, затем винрейт и количество сыгранных игр.',
    } : null,
  };
};

router.get('/stories', async (req, res) => {
  const viewerId = requirePlayerId(req, res);
  if (!viewerId) return;

  try {
    const db = (req as any).db;
    const [snapshots, eveningRows, attendanceRows] = await Promise.all([
      loadCompletedGameSnapshots(db),
      db.all(`
        SELECT id, title, starts_at, settled_at, venue, format, status
          FROM game_evenings
         WHERE status = 'completed' OR settled_at IS NOT NULL
         ORDER BY COALESCE(settled_at, starts_at) DESC
         LIMIT 12
      `),
      db.all(`
        SELECT evening_id, COUNT(*) AS attended
          FROM evening_participants
         WHERE attendance_status = 'attended'
         GROUP BY evening_id
      `),
    ]);

    const attendanceByEvening = new Map(attendanceRows.map((row: any) => [String(row.evening_id), Number(row.attended || 0)]));
    const clubByEvening = new Map<string, CompletedGameSnapshot[]>();
    for (const game of snapshots.filter((item) => item.source === 'club')) {
      const bucket = clubByEvening.get(game.event_id) || [];
      bucket.push(game);
      clubByEvening.set(game.event_id, bucket);
    }

    const eveningById = new Map(eveningRows.map((row: any) => [String(row.id), row]));
    const eventIds = [...new Set([
      ...eveningRows.map((row: any) => String(row.id)),
      ...clubByEvening.keys(),
    ])];

    const eveningRecaps = eventIds.flatMap((eventId) => {
      const games = clubByEvening.get(eventId) || [];
      if (!games.length) return [];
      const evening = eveningById.get(eventId) || {
        id: eventId,
        title: games[0]?.title,
        starts_at: games[0]?.date,
        settled_at: null,
        venue: null,
        format: null,
      };
      return [summarizeEvening(evening, games, attendanceByEvening.get(eventId) || 0)];
    }).sort((a, b) => {
      const aTime = new Date(a.settled_at || a.starts_at || 0).getTime();
      const bTime = new Date(b.settled_at || b.starts_at || 0).getTime();
      return bTime - aTime;
    });

    const recentGames = snapshots.slice(0, 16).map((game) => ({
      game_key: game.id,
      source: game.source,
      event_id: game.event_id,
      title: game.title,
      played_at: game.played_at,
      game_number: game.game_number,
      winner_team: game.winner_team,
      players: game.players
        .slice()
        .sort((a, b) => a.seat_number - b.seat_number)
        .map((player) => ({
          player_id: player.player_id,
          nickname: player.nickname,
          seat_number: player.seat_number,
        })),
    }));

    return res.json({
      viewer_id: String(viewerId),
      evenings: eveningRecaps.slice(0, 8),
      recent_games: recentGames,
      latest_evening: eveningRecaps[0] || null,
      meta: {
        player_of_evening: 'Автоматическая развлекательная номинация по результатам вечера; не является официальной судейской наградой.',
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить ленту клуба' });
  }
});

export default router;
