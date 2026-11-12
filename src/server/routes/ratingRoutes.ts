import { Router, type Response } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { getRepositoryPlayerAvatarAsset } from '../../lib/playerAvatarManifest.ts';
import { getPlayerSessionId, type AuthenticatedRequest } from '../auth.ts';
import { loadMetricRating, loadRoleRating } from '../services/metricRatingService.ts';

import { loadMetricTable } from '../services/metricTableService.ts';
import { loadClubLeaderboardRows } from '../services/clubLeaderboardService.ts';

const router = Router();

const requireClubUser = (req: AuthenticatedRequest, res: Response): string | null => {
  if (req.userRole === 'ORGANIZER') return 'organizer';
  const playerId = getPlayerSessionId(req);
  if (playerId) return playerId;
  res.status(401).json({ error: 'Требуется авторизация игрока или организатора' });
  return null;
};

const repositoryAvatarAvailable = (playerId: string, suppressed: unknown) =>
  !Number(suppressed || 0) && Boolean(getRepositoryPlayerAvatarAsset(playerId));

const playerAvatarUrl = (playerId: string, hasDbAvatar: unknown, suppressed: unknown) =>
  Number(hasDbAvatar || 0) || repositoryAvatarAvailable(playerId, suppressed)
    ? `/api/player/players/${encodeURIComponent(playerId)}/avatar`
    : null;

router.get('/metrics/table', async (req: AuthenticatedRequest, res: Response) => {
  const viewerId = requireClubUser(req, res);
  if (!viewerId) return;
  const one = (value: unknown) => typeof value === 'string' ? value : undefined;
  try { res.json(await loadMetricTable(req.db as DatabaseWrapper, viewerId, {category:one(req.query.category),context:one(req.query.context),period:one(req.query.period),format:one(req.query.format)})); }
  catch (err: any) { res.status(500).json({error:err.message || 'Не удалось загрузить показатели'}); }
});

/** Rankings by one figure of the statistics (wins, streak, Elo gain…) over a season or all time and an evening format. */
router.get('/metrics', async (req: AuthenticatedRequest, res: Response) => {
  const viewerId = requireClubUser(req, res);
  if (!viewerId) return;
  try {
    const one = (value: unknown) => typeof value === 'string' ? value : undefined;
    res.json(await loadMetricRating(req.db as DatabaseWrapper, viewerId, { metric: one(req.query.metric), period: one(req.query.period), format: one(req.query.format) }));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Не удалось загрузить рейтинг по показателю' });
  }
});

/** The club's players per role (Don, mafia, Sheriff, citizen) with the role's own figures, over a season and evening format. */
router.get('/roles', async (req: AuthenticatedRequest, res: Response) => {
  const viewerId = requireClubUser(req, res);
  if (!viewerId) return;
  try {
    const one = (value: unknown) => typeof value === 'string' ? value : undefined;
    res.json(await loadRoleRating(req.db as DatabaseWrapper, viewerId, { role: one(req.query.role), period: one(req.query.period), format: one(req.query.format) }));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Не удалось загрузить таблицу по ролям' });
  }
});

router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  if (!requireClubUser(req, res)) return;

  try {
    const db = req.db as DatabaseWrapper;
    const rows = await loadClubLeaderboardRows(db);

    const leaderboard = rows.map((row: any, index: number) => {
      const playerId = String(row.id);
      return {
        place: index + 1,
        player_id: playerId,
        nickname: String(row.nickname || 'Игрок'),
        elo: Math.round(Number(row.elo || 1000)),
        game_level: row.game_level || 'club',
        games: Number(row.games || 0),
        avatar_url: playerAvatarUrl(playerId, row.has_db_avatar, row.avatar_suppressed),
      };
    });

    res.json({ generated_at: new Date().toISOString(), players: leaderboard });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Не удалось загрузить рейтинг клуба' });
  }
});

export default router;
