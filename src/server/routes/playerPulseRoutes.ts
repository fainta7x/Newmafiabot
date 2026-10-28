import { playerFormScore, formWinStreak, comparePlayerForm, FORM_WINDOW } from '../../shared/playerForm.ts';
import { Router } from 'express';
import { getPlayerSessionId } from '../auth.ts';
import { loadCompletedGameSnapshots } from '../services/clubGameAnalyticsService.ts';
import { ensurePlayerProfileVisibilitySchema, parsePlayerProfileVisibility } from '../services/playerProfileVisibilityService.ts';
import { buildClubRelationships } from '../services/clubRelationshipsService.ts';
import { buildPersonalTeamwork } from '../services/personalTeamworkService.ts';
import { winRatePercent } from '../../shared/stats.ts';

import {EVENING_FORMATS,EVENING_FORMAT_LABELS} from '../../lib/eveningFormat.ts';
import {loadMetricScope} from '../services/metricRatingService.ts';
import {buildConnectionContent} from '../services/connectionContentService.ts';

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

const avatarUrl = (playerId: string) => `/api/player/players/${encodeURIComponent(playerId)}/avatar`;

const lastResultsAt = (results: Result[], cutoffMs = Number.POSITIVE_INFINITY) => results
  .filter((result) => result.dateMs <= cutoffMs)
  .sort((a, b) => b.dateMs - a.dateMs)
  .slice(0, FORM_WINDOW);

router.get('/pulse', async (req, res) => {
  const viewerId = requirePlayerId(req, res);
  if (!viewerId) return;

  try {
    const db = req.db;
    const [players, snapshots] = await Promise.all([
      db.all(`
        SELECT id, nickname, elo, profile_visibility_json
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
        win_rate: winRatePercent(wins, results.length),
        last5_wins: recentFive.filter((result) => result.won).length,
        streak: formWinStreak(results),
        score: playerFormScore(results),
        last_results: String(player.id)===String(viewerId)||parsePlayerProfileVisibility(player.profile_visibility_json).game_statistics?results.map(result=>result.won?'W':'L'):undefined,
        last_game_at: results.length&&(String(player.id)===String(viewerId)||parsePlayerProfileVisibility(player.profile_visibility_json).game_statistics)?new Date(results[0].dateMs).toISOString():null,
      }];
    }).sort(comparePlayerForm);

    const previousEntries = players.flatMap((player: any) => {
      const results = lastResultsAt(byPlayer.get(String(player.id)) || [], previousCutoff);
      if (results.length < 3) return [];
      return [{ player_id: String(player.id), nickname:String(player.nickname), elo:Number(player.elo||0), wins:results.filter(result=>result.won).length, score: playerFormScore(results), games: results.length }];
    }).sort(comparePlayerForm);
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
        formula: 'Считаем последние 10 игр: чем свежее результат, тем он важнее; серия побед даёт небольшой бонус. Это развлекательный рейтинг, не Elo.',
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
    await ensurePlayerProfileVisibilitySchema(db);
    const one=(value:unknown)=>typeof value==='string'?value:undefined;
    const [snapshots, players, scope] = await Promise.all([
      loadCompletedGameSnapshots(db),
      db.all('SELECT id, nickname, profile_visibility_json FROM players'),
      loadMetricScope(db,{period:one(req.query.period),format:one(req.query.format)}),
    ]);
    const visibleIds = new Set(players.filter((player: any) => parsePlayerProfileVisibility(player.profile_visibility_json).connections).map((player: any) => String(player.id)));
    const canViewConnections = (id: string) => id === String(viewerId) || visibleIds.has(id);
    const selected=[one(req.query.a),one(req.query.b)].filter((id):id is string=>!!id);
    const content=buildConnectionContent(snapshots,scope.scoped,canViewConnections,selected);
    return res.json({...buildClubRelationships(scope.scoped,viewerId,canViewConnections),content:{...content,filters:{period:scope.season?.key||'all',format:scope.formatKey,period_label:scope.season?.label||'Всё время',format_label:scope.formatKey==='all'?'Все форматы':EVENING_FORMAT_LABELS[scope.formatKey],seasons:scope.availablePeriods,formats:EVENING_FORMATS.map(key=>({key,label:EVENING_FORMAT_LABELS[key]}))},players:scope.playerRows.filter((p:any)=>canViewConnections(String(p.id))).map((p:any)=>({player_id:String(p.id),nickname:String(p.nickname||'Игрок')}))}});
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось рассчитать связи игроков' });
  }
});

router.get('/team-connections', async (req, res) => {
  const viewerId = requirePlayerId(req, res);
  if (!viewerId) return;

  try {
    const db = req.db;
    await ensurePlayerProfileVisibilitySchema(db);
    const [snapshots, players] = await Promise.all([
      loadCompletedGameSnapshots(db),
      db.all('SELECT id, profile_visibility_json FROM players'),
    ]);
    const visibleIds = new Set(players.filter((player: any) => parsePlayerProfileVisibility(player.profile_visibility_json).connections).map((player: any) => String(player.id)));
    const canViewConnections = (id: string) => id === String(viewerId) || visibleIds.has(id);
    const avatarUrl = (id: string) => `/api/player/players/${encodeURIComponent(id)}/avatar`;
    return res.json(buildPersonalTeamwork(snapshots, viewerId, canViewConnections, avatarUrl));
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось собрать твою команду' });
  }
});

export default router;
