import { Router } from 'express';
import { getPlayerSessionId } from '../auth.ts';
import { loadCompletedGameSnapshots, type AnalyticsTeam } from '../services/clubGameAnalyticsService.ts';

const router = Router();

type Result = { dateMs: number; won: boolean };
type PersonStat = { player_id: string; nickname: string; games: number; wins: number };
type DuoStat = {
  a_id: string;
  a_name: string;
  b_id: string;
  b_name: string;
  team: AnalyticsTeam;
  games: number;
  wins: number;
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
const winRate = (wins: number, games: number) => games ? Math.round((wins / games) * 100) : 0;

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
    const db = req.db;
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
        avatar_url: avatarUrl(entry.player_id),
      };
    });

    const highlightCandidates = currentEntries.flatMap((entry: any) => {
      if (entry.streak >= 2) {
        return [{
          player_id: entry.player_id,
          nickname: entry.nickname,
          avatar_url: avatarUrl(entry.player_id),
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
          avatar_url: avatarUrl(entry.player_id),
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

router.get('/relationships', async (req, res) => {
  const viewerId = requirePlayerId(req, res);
  if (!viewerId) return;

  try {
    const db = req.db;
    const snapshots = await loadCompletedGameSnapshots(db);
    const opponents = new Map<string, PersonStat>();
    const teammates = new Map<string, PersonStat>();
    const duos = new Map<string, DuoStat>();

    const bumpPerson = (target: Map<string, PersonStat>, playerId: string, nickname: string, won: boolean) => {
      const stat = target.get(playerId) || { player_id: playerId, nickname, games: 0, wins: 0 };
      stat.games += 1;
      if (won) stat.wins += 1;
      target.set(playerId, stat);
    };

    for (const game of snapshots) {
      const viewer = game.players.find((player) => player.player_id === String(viewerId));
      if (viewer) {
        for (const other of game.players) {
          if (other.player_id === String(viewerId)) continue;
          if (other.team === viewer.team) bumpPerson(teammates, other.player_id, other.nickname, viewer.won);
          else bumpPerson(opponents, other.player_id, other.nickname, viewer.won);
        }
      }

      for (const team of ['red', 'black'] as const) {
        const members = game.players.filter((player) => player.team === team);
        for (let first = 0; first < members.length; first += 1) {
          for (let second = first + 1; second < members.length; second += 1) {
            const a = members[first];
            const b = members[second];
            const [left, right] = a.player_id.localeCompare(b.player_id) <= 0 ? [a, b] : [b, a];
            const key = `${team}:${left.player_id}:${right.player_id}`;
            const stat = duos.get(key) || {
              a_id: left.player_id,
              a_name: left.nickname,
              b_id: right.player_id,
              b_name: right.nickname,
              team,
              games: 0,
              wins: 0,
            };
            stat.games += 1;
            if (a.won) stat.wins += 1;
            duos.set(key, stat);
          }
        }
      }
    }

    const personPayload = (stat: PersonStat) => ({
      ...stat,
      win_rate: winRate(stat.wins, stat.games),
      avatar_url: avatarUrl(stat.player_id),
    });

    const rivals = [...opponents.values()]
      .sort((a, b) => b.games - a.games || Math.abs(winRate(a.wins, a.games) - 50) - Math.abs(winRate(b.wins, b.games) - 50) || a.nickname.localeCompare(b.nickname, 'ru'))
      .slice(0, 8)
      .map(personPayload);

    const personalDuos = [...teammates.values()]
      .sort((a, b) => b.games - a.games || winRate(b.wins, b.games) - winRate(a.wins, a.games) || a.nickname.localeCompare(b.nickname, 'ru'))
      .slice(0, 8)
      .map(personPayload);

    const duoPool = [...duos.values()].filter((duo) => duo.games >= 2);
    const rankDuos = (team: AnalyticsTeam) => duoPool
      .filter((duo) => duo.team === team)
      .sort((a, b) => {
        const aRate = winRate(a.wins, a.games);
        const bRate = winRate(b.wins, b.games);
        const aScore = aRate + Math.min(10, a.games) * 2;
        const bScore = bRate + Math.min(10, b.games) * 2;
        return bScore - aScore || b.games - a.games || bRate - aRate;
      })
      .slice(0, 5)
      .map((duo) => ({
        ...duo,
        win_rate: winRate(duo.wins, duo.games),
        a_avatar_url: avatarUrl(duo.a_id),
        b_avatar_url: avatarUrl(duo.b_id),
      }));

    return res.json({
      viewer_id: String(viewerId),
      rivals,
      teammates: personalDuos,
      club_duos: {
        red: rankDuos('red'),
        black: rankDuos('black'),
      },
      meta: {
        rivalry: 'Считаются только завершённые игры, где игроки были по разные стороны.',
        duo: 'Связки считаются по завершённым играм в одной команде. В клубный топ попадают пары минимум с двумя совместными играми.',
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось рассчитать связи игроков' });
  }
});

export default router;
