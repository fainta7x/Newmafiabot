import { Router } from 'express';
import { getPlayerSessionId } from '../auth.ts';
import { loadCompletedGameSnapshots } from '../services/clubGameAnalyticsService.ts';

const router = Router();

type Result = { dateMs: number; won: boolean };

const requirePlayerId = (req: any, res: any): string | null => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) {
    res.status(401).json({ error: 'Player authentication required.' });
    return null;
  }
  return playerId;
};

const lastResultsAt = (results: Result[], cutoffMs = Number.POSITIVE_INFINITY) => results
  .filter((result) => result.dateMs <= cutoffMs)
  .sort((a, b) => b.dateMs - a.dateMs)
  .slice(0, 10);

const winStreak = (results: Result[]) => {
  let streak = 0;
  for (const result of results) {
    if (!result.won) break;
    streak += 1;
  }
  return streak;
};

const powerScore = (results: Result[]) => {
  if (!results.length) return 0;
  let weightedWins = 0;
  let totalWeight = 0;
  results.forEach((result, index) => {
    const weight = Math.max(1, 10 - index);
    totalWeight += weight;
    if (result.won) weightedWins += weight;
  });
  return Math.round((weightedWins / Math.max(1, totalWeight)) * 100 + Math.min(5, winStreak(results)) * 3);
};

router.get('/pulse', async (req, res) => {
  const viewerId = requirePlayerId(req, res);
  if (!viewerId) return;

  try {
    const db = (req as any).db;
    const [players, snapshots] = await Promise.all([
      db.all(`
        SELECT id, nickname, elo
          FROM players
         WHERE TRIM(COALESCE(nickname, '')) <> ''
         ORDER BY nickname COLLATE NOCASE ASC
      `),
      loadCompletedGameSnapshots(db),
    ]);

    const byPlayer = new Map<string, Result[]>();
    for (const game of snapshots) {
      for (const result of game.players) {
        const bucket = byPlayer.get(result.player_id) || [];
        bucket.push({ dateMs: game.dateMs, won: result.won });
        byPlayer.set(result.player_id, bucket);
      }
    }

    const now = Date.now();
    const previousCutoff = now - 7 * 24 * 60 * 60 * 1000;

    const currentEntries = players.flatMap((player: any) => {
      const results = lastResultsAt(byPlayer.get(String(player.id)) || []);
      if (results.length < 3) return [];
      const wins = results.filter((result) => result.won).length;
      const recentFive = results.slice(0, 5);
      return [{
        player_id: String(player.id),
        nickname: String(player.nickname),
        elo: Number(player.elo || 0),
        games: results.length,
        wins,
        win_rate: Math.round((wins / results.length) * 100),
        last5_wins: recentFive.filter((result) => result.won).length,
        streak: winStreak(results),
        score: powerScore(results),
      }];
    }).sort((a: any, b: any) => b.score - a.score || b.wins - a.wins || b.elo - a.elo || a.nickname.localeCompare(b.nickname, 'ru'));

    const previousEntries = players.flatMap((player: any) => {
      const results = lastResultsAt(byPlayer.get(String(player.id)) || [], previousCutoff);
      if (results.length < 3) return [];
      return [{ player_id: String(player.id), score: powerScore(results), games: results.length }];
    }).sort((a: any, b: any) => b.score - a.score || b.games - a.games);
    const previousRanks = new Map(previousEntries.map((entry: any, index: number) => [entry.player_id, index + 1]));

    const ranking = currentEntries.slice(0, 15).map((entry: any, index: number) => {
      const place = index + 1;
      const oldPlace = previousRanks.get(entry.player_id) as number | undefined;
      return {
        ...entry,
        place,
        movement: oldPlace == null ? null : oldPlace - place,
        avatar_url: `/api/player/players/${encodeURIComponent(entry.player_id)}/avatar`,
      };
    });

    const highlightCandidates = currentEntries.flatMap((entry: any) => {
      if (entry.streak >= 2) {
        return [{
          player_id: entry.player_id,
          nickname: entry.nickname,
          avatar_url: `/api/player/players/${encodeURIComponent(entry.player_id)}/avatar`,
          type: 'win_streak',
          value: entry.streak,
          text: `${entry.streak} побед подряд`,
          priority: 100 + entry.streak * 10,
        }];
      }
      if (entry.games >= 5 && entry.last5_wins >= 4) {
        return [{
          player_id: entry.player_id,
          nickname: entry.nickname,
          avatar_url: `/api/player/players/${encodeURIComponent(entry.player_id)}/avatar`,
          type: 'hot_form',
          value: entry.last5_wins,
          text: `${entry.last5_wins}/5 побед в последних играх`,
          priority: 50 + entry.last5_wins,
        }];
      }
      return [];
    }).sort((a: any, b: any) => b.priority - a.priority || a.nickname.localeCompare(b.nickname, 'ru'));

    return res.json({
      generated_at: new Date(now).toISOString(),
      viewer_id: String(viewerId),
      highlights: highlightCandidates.slice(0, 6).map(({ priority, ...item }: any) => item),
      power_ranking: ranking,
      players_with_form: currentEntries.length,
      meta: {
        formula: 'Последние 10 игр: свежие результаты имеют больший вес; победная серия даёт небольшой бонус. Это развлекательный рейтинг, не Elo.',
        previous_cutoff: new Date(previousCutoff).toISOString(),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось рассчитать пульс клуба' });
  }
});

export default router;
