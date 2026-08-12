import { Router } from 'express';
import { getPlayerSessionId } from '../auth.ts';

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

const safeJsonParse = (value: unknown): any => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try { return JSON.parse(value); } catch { return null; }
};

const normalizeWinner = (value: unknown): 'red' | 'black' | null => {
  const normalized = String(value || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  if (['red', 'красные', 'красная', 'город'].includes(normalized)) return 'red';
  if (['black', 'черные', 'черная', 'мафия'].includes(normalized)) return 'black';
  return null;
};

const teamFromRole = (value: unknown): 'red' | 'black' | null => {
  const role = String(value || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  if (['mafia', 'мафия', 'маф', 'don', 'дон'].includes(role)) return 'black';
  if (['citizen', 'мирный', 'мирный житель', 'красный', 'sheriff', 'шериф'].includes(role)) return 'red';
  return null;
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
    const [players, clubRows, tournamentRows] = await Promise.all([
      db.all(`
        SELECT id, nickname, elo
          FROM players
         WHERE TRIM(COALESCE(nickname, '')) <> ''
         ORDER BY nickname COLLATE NOCASE ASC
      `),
      db.all(`
        SELECT g.id, g.game_date, g.winner_team, g.protocol_text,
               e.starts_at AS evening_date
          FROM games g
     LEFT JOIN game_evenings e ON e.id = g.evening_id
         WHERE g.evening_id IS NOT NULL
           AND g.archived_at IS NULL
           AND g.protocol_text IS NOT NULL
      `),
      db.all(`
        SELECT tp.player_id, tg.id AS game_id, tg.winner_team, tg.completed_at,
               t.date AS tournament_date, tgs.role
          FROM tournament_game_seats tgs
          JOIN tournament_participants tp ON tp.id = tgs.participant_id
          JOIN tournament_games tg ON tg.id = tgs.game_id
          JOIN tournaments t ON t.id = tg.tournament_id
         WHERE tg.status = 'completed'
      `),
    ]);

    const byPlayer = new Map<string, Result[]>();
    const pushResult = (playerId: unknown, date: unknown, won: boolean) => {
      const id = String(playerId || '').trim();
      const dateMs = date ? new Date(String(date)).getTime() : 0;
      if (!id || !Number.isFinite(dateMs) || dateMs <= 0) return;
      const bucket = byPlayer.get(id) || [];
      bucket.push({ dateMs, won });
      byPlayer.set(id, bucket);
    };

    for (const row of clubRows) {
      const payload = safeJsonParse(row.protocol_text);
      if (!payload || payload.kind !== 'club_evening_protocol' || payload.protocol?.status !== 'completed' || !Array.isArray(payload.player_results)) continue;
      const winner = normalizeWinner(payload.protocol?.winner_team || row.winner_team);
      if (!winner) continue;
      const date = row.evening_date || row.game_date;
      for (const result of payload.player_results) {
        const team = teamFromRole(result.role);
        if (!team || !result.player_id) continue;
        pushResult(result.player_id, date, team === winner);
      }
    }

    for (const row of tournamentRows) {
      const winner = normalizeWinner(row.winner_team);
      const team = teamFromRole(row.role);
      if (!winner || !team) continue;
      pushResult(row.player_id, row.completed_at || row.tournament_date, team === winner);
    }

    const now = Date.now();
    const previousCutoff = now - 7 * 24 * 60 * 60 * 1000;
    const playerMeta = new Map(players.map((player: any) => [String(player.id), player]));

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
