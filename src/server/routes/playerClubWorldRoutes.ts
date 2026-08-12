import { Router } from 'express';
import { getPlayerSessionId } from '../auth.ts';
import { loadCompletedGameSnapshots, type CompletedGameSnapshot } from '../services/clubGameAnalyticsService.ts';

const router = Router();
const ROLES = ['citizen', 'sheriff', 'mafia', 'don'] as const;
type Role = typeof ROLES[number];

type PlayerAggregate = {
  player_id: string;
  nickname: string;
  games: number;
  wins: number;
  red_wins: number;
  black_wins: number;
  role_games: Record<Role, number>;
  role_wins: Record<Role, number>;
  results: Array<{ dateMs: number; won: boolean }>;
};

const requirePlayerId = (req: any, res: any): string | null => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) {
    res.status(401).json({ error: 'Player authentication required.' });
    return null;
  }
  return playerId;
};

const avatarUrl = (playerId: string) => `/api/player/players/${encodeURIComponent(playerId)}/avatar`;
const rate = (wins: number, games: number) => games ? Math.round((wins / games) * 100) : 0;

const seasonForDate = (value: string | number | Date) => {
  const date = new Date(value);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  if (month === 11) return { key: `winter-${year}-${year + 1}`, label: `Зима ${year}/${String(year + 1).slice(-2)}`, start: Date.UTC(year, 11, 1), end: Date.UTC(year + 1, 2, 1) };
  if (month <= 1) return { key: `winter-${year - 1}-${year}`, label: `Зима ${year - 1}/${String(year).slice(-2)}`, start: Date.UTC(year - 1, 11, 1), end: Date.UTC(year, 2, 1) };
  if (month <= 4) return { key: `spring-${year}`, label: `Весна ${year}`, start: Date.UTC(year, 2, 1), end: Date.UTC(year, 5, 1) };
  if (month <= 7) return { key: `summer-${year}`, label: `Лето ${year}`, start: Date.UTC(year, 5, 1), end: Date.UTC(year, 8, 1) };
  return { key: `autumn-${year}`, label: `Осень ${year}`, start: Date.UTC(year, 8, 1), end: Date.UTC(year, 11, 1) };
};

const previousSeason = (season: ReturnType<typeof seasonForDate>) => seasonForDate(new Date(season.start - 1));

const aggregatePlayers = (games: CompletedGameSnapshot[]) => {
  const map = new Map<string, PlayerAggregate>();
  for (const game of games) {
    for (const result of game.players) {
      const current = map.get(result.player_id) || {
        player_id: result.player_id,
        nickname: result.nickname,
        games: 0,
        wins: 0,
        red_wins: 0,
        black_wins: 0,
        role_games: { citizen: 0, sheriff: 0, mafia: 0, don: 0 },
        role_wins: { citizen: 0, sheriff: 0, mafia: 0, don: 0 },
        results: [],
      };
      current.nickname = result.nickname || current.nickname;
      current.games += 1;
      if (result.won) {
        current.wins += 1;
        if (result.team === 'red') current.red_wins += 1;
        else current.black_wins += 1;
      }
      if (result.role && ROLES.includes(result.role as Role)) {
        current.role_games[result.role as Role] += 1;
        if (result.won) current.role_wins[result.role as Role] += 1;
      }
      current.results.push({ dateMs: game.dateMs, won: result.won });
      map.set(result.player_id, current);
    }
  }
  return map;
};

const longestStreak = (results: Array<{ dateMs: number; won: boolean }>) => {
  let best = 0;
  let current = 0;
  for (const result of results.slice().sort((a, b) => a.dateMs - b.dateMs)) {
    if (result.won) {
      current += 1;
      best = Math.max(best, current);
    } else current = 0;
  }
  return best;
};

const currentStreak = (results: Array<{ dateMs: number; won: boolean }>) => {
  let streak = 0;
  for (const result of results.slice().sort((a, b) => b.dateMs - a.dateMs)) {
    if (!result.won) break;
    streak += 1;
  }
  return streak;
};

const recordPayload = (stat: PlayerAggregate | null, value: number, label: string) => stat ? {
  label,
  value,
  player_id: stat.player_id,
  nickname: stat.nickname,
  avatar_url: avatarUrl(stat.player_id),
} : null;

router.get('/club-world', async (req, res) => {
  const viewerId = requirePlayerId(req, res);
  if (!viewerId) return;

  try {
    const db = (req as any).db;
    const snapshots = await loadCompletedGameSnapshots(db);
    const now = new Date();
    const currentSeason = seasonForDate(now);
    const prevSeason = previousSeason(currentSeason);
    const inRange = (game: CompletedGameSnapshot, season: ReturnType<typeof seasonForDate>) => game.dateMs >= season.start && game.dateMs < season.end;
    const currentGames = snapshots.filter((game) => inRange(game, currentSeason));
    const previousGames = snapshots.filter((game) => inRange(game, prevSeason));
    const currentStats = aggregatePlayers(currentGames);
    const allStats = aggregatePlayers(snapshots);

    const seasonRanking = [...currentStats.values()]
      .sort((a, b) => b.wins - a.wins || rate(b.wins, b.games) - rate(a.wins, a.games) || b.games - a.games || a.nickname.localeCompare(b.nickname, 'ru'))
      .slice(0, 15)
      .map((item, index) => ({
        place: index + 1,
        player_id: item.player_id,
        nickname: item.nickname,
        avatar_url: avatarUrl(item.player_id),
        games: item.games,
        wins: item.wins,
        win_rate: rate(item.wins, item.games),
      }));

    const roleChampions = ROLES.map((role) => {
      const candidates = [...currentStats.values()]
        .filter((item) => item.role_games[role] >= 2)
        .sort((a, b) => rate(b.role_wins[role], b.role_games[role]) - rate(a.role_wins[role], a.role_games[role]) || b.role_wins[role] - a.role_wins[role] || b.role_games[role] - a.role_games[role]);
      const winner = candidates[0];
      return winner ? {
        role,
        player_id: winner.player_id,
        nickname: winner.nickname,
        avatar_url: avatarUrl(winner.player_id),
        games: winner.role_games[role],
        wins: winner.role_wins[role],
        win_rate: rate(winner.role_wins[role], winner.role_games[role]),
      } : null;
    }).filter(Boolean);

    const all = [...allStats.values()];
    const mostGames = all.slice().sort((a, b) => b.games - a.games || b.wins - a.wins)[0] || null;
    const mostWins = all.slice().sort((a, b) => b.wins - a.wins || b.games - a.games)[0] || null;
    const bestRate = all.filter((item) => item.games >= 10).sort((a, b) => rate(b.wins, b.games) - rate(a.wins, a.games) || b.wins - a.wins)[0] || null;
    const bestStreak = all.slice().sort((a, b) => longestStreak(b.results) - longestStreak(a.results) || b.games - a.games)[0] || null;
    const mostRed = all.slice().sort((a, b) => b.red_wins - a.red_wins || b.games - a.games)[0] || null;
    const mostBlack = all.slice().sort((a, b) => b.black_wins - a.black_wins || b.games - a.games)[0] || null;
    const sheriff = all.filter((item) => item.role_games.sheriff >= 5).sort((a, b) => rate(b.role_wins.sheriff, b.role_games.sheriff) - rate(a.role_wins.sheriff, a.role_games.sheriff) || b.role_wins.sheriff - a.role_wins.sheriff)[0] || null;
    const don = all.filter((item) => item.role_games.don >= 3).sort((a, b) => rate(b.role_wins.don, b.role_games.don) - rate(a.role_wins.don, a.role_games.don) || b.role_wins.don - a.role_wins.don)[0] || null;

    const hallOfFame = [
      recordPayload(mostGames, mostGames?.games || 0, 'Больше всего игр'),
      recordPayload(mostWins, mostWins?.wins || 0, 'Больше всего побед'),
      recordPayload(bestRate, bestRate ? rate(bestRate.wins, bestRate.games) : 0, 'Лучший винрейт · мин. 10 игр'),
      recordPayload(bestStreak, bestStreak ? longestStreak(bestStreak.results) : 0, 'Рекордная серия побед'),
      recordPayload(mostRed, mostRed?.red_wins || 0, 'Побед за красных'),
      recordPayload(mostBlack, mostBlack?.black_wins || 0, 'Побед за чёрных'),
      recordPayload(sheriff, sheriff ? rate(sheriff.role_wins.sheriff, sheriff.role_games.sheriff) : 0, 'Лучший Шериф · мин. 5 игр'),
      recordPayload(don, don ? rate(don.role_wins.don, don.role_games.don) : 0, 'Лучший Дон · мин. 3 игры'),
    ].filter(Boolean);

    const feed: Array<any> = [];
    const clubGamesByEvent = new Map<string, CompletedGameSnapshot[]>();
    for (const game of snapshots.filter((item) => item.source === 'club')) {
      const bucket = clubGamesByEvent.get(game.event_id) || [];
      bucket.push(game);
      clubGamesByEvent.set(game.event_id, bucket);
    }
    for (const [eventId, games] of clubGamesByEvent.entries()) {
      const ordered = games.slice().sort((a, b) => a.dateMs - b.dateMs);
      let red = 0;
      let black = 0;
      for (const game of ordered) game.winner_team === 'red' ? red += 1 : black += 1;
      const latest = ordered[ordered.length - 1];
      feed.push({
        key: `evening:${eventId}`,
        type: 'evening_result',
        date: latest.played_at,
        icon: '🎬',
        title: latest.title,
        text: `${ordered.length} игр · итог красные ${red}:${black} чёрные`,
        event_id: eventId,
      });
    }

    const milestones = [10, 25, 50, 100, 200];
    for (const stat of all) {
      const chronological = stat.results.slice().sort((a, b) => a.dateMs - b.dateMs);
      for (const target of milestones) {
        if (chronological.length < target) continue;
        feed.push({
          key: `milestone:${stat.player_id}:${target}`,
          type: 'milestone',
          date: new Date(chronological[target - 1].dateMs).toISOString(),
          icon: target >= 100 ? '💯' : '🎖️',
          title: `${stat.nickname} · ${target} игр`,
          text: `Карьерная отметка: ${target} завершённых игр в 2LA noire`,
          player_id: stat.player_id,
          avatar_url: avatarUrl(stat.player_id),
        });
      }
      const streak = currentStreak(stat.results);
      if (streak >= 3) {
        const latest = stat.results.slice().sort((a, b) => b.dateMs - a.dateMs)[0];
        feed.push({
          key: `streak:${stat.player_id}:${streak}:${latest?.dateMs || 0}`,
          type: 'streak',
          date: latest ? new Date(latest.dateMs).toISOString() : new Date().toISOString(),
          icon: '🔥',
          title: `${stat.nickname} в огне`,
          text: `${streak} побед подряд`,
          player_id: stat.player_id,
          avatar_url: avatarUrl(stat.player_id),
        });
      }
    }

    const previousStatMap = aggregatePlayers(previousGames);
    const viewerSeason = currentStats.get(String(viewerId));
    const viewerPrevious = previousStatMap.get(String(viewerId));

    return res.json({
      viewer_id: String(viewerId),
      season: {
        ...currentSeason,
        games: currentGames.length,
        players: currentStats.size,
        ranking: seasonRanking,
        role_champions: roleChampions,
        viewer: viewerSeason ? { games: viewerSeason.games, wins: viewerSeason.wins, win_rate: rate(viewerSeason.wins, viewerSeason.games) } : null,
        previous_viewer: viewerPrevious ? { games: viewerPrevious.games, wins: viewerPrevious.wins, win_rate: rate(viewerPrevious.wins, viewerPrevious.games) } : null,
      },
      hall_of_fame: hallOfFame,
      feed: feed.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 30),
      meta: {
        season: 'Сезоны считаются по календарю: зима, весна, лето, осень. Это сезонная статистика, официальный Elo остаётся отдельным.',
        hall_of_fame: 'Рекорды строятся только по завершённым играм из канонических протоколов.',
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить мир клуба' });
  }
});

export default router;
