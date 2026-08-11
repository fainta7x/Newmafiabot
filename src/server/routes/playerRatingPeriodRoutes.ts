import { Router } from 'express';
import { getRepositoryPlayerAvatarAsset } from '../../lib/playerAvatarManifest.ts';
import { getPlayerSessionId } from '../auth.ts';
import { calculateRatingPeriodStandings } from '../services/ratingPeriodStandingsService.ts';

const router = Router();

const requirePlayerId = (req: any, res: any): string | null => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) {
    res.status(401).json({ error: 'Player authentication required.' });
    return null;
  }
  return playerId;
};

const repositoryAvatarAvailable = (playerId: string, suppressed: unknown) =>
  !Number(suppressed || 0) && Boolean(getRepositoryPlayerAvatarAsset(playerId));

const playerAvatarUrl = (playerId: string, hasDbAvatar: unknown, suppressed: unknown) =>
  Number(hasDbAvatar || 0) || repositoryAvatarAvailable(playerId, suppressed)
    ? `/api/player/players/${encodeURIComponent(playerId)}/avatar`
    : null;

const publicPeriod = (row: any) => ({
  id: String(row.id),
  title: String(row.title || 'Рейтинговый период'),
  type: String(row.type || 'RATING'),
  starts_at: String(row.starts_at || ''),
  ends_at: String(row.ends_at || ''),
  status: String(row.status || 'completed'),
  notes: row.notes ? String(row.notes) : null,
});

router.get('/rating-periods', async (req, res) => {
  const playerId = requirePlayerId(req, res);
  if (!playerId) return;

  try {
    const db = (req as any).db;
    const rows = await db.all<any>(`
      SELECT id, title, type, starts_at, ends_at, status, notes
        FROM rating_periods
       WHERE status IN ('active', 'completed')
       ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END,
                starts_at DESC,
                created_at DESC
    `);

    const periods = rows.map(publicPeriod);
    return res.json({
      active_periods: periods.filter((period: any) => period.status === 'active'),
      completed_periods: periods.filter((period: any) => period.status === 'completed'),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить рейтинговые периоды' });
  }
});

router.get('/rating-periods/:periodId', async (req, res) => {
  const playerId = requirePlayerId(req, res);
  if (!playerId) return;

  try {
    const db = (req as any).db;
    const period = await db.get<any>(
      `SELECT id, title, type, starts_at, ends_at, status, notes
         FROM rating_periods
        WHERE id = ? AND status IN ('active', 'completed')
        LIMIT 1`,
      [req.params.periodId],
    );
    if (!period) return res.status(404).json({ error: 'Рейтинговый период не найден' });

    const result = await calculateRatingPeriodStandings(db, String(period.id));
    const avatarRows = await db.all<any>(`
      SELECT p.id,
             EXISTS(SELECT 1 FROM player_avatars pa WHERE pa.player_id = p.id) AS has_db_avatar,
             EXISTS(SELECT 1 FROM player_avatar_repository_suppression s WHERE s.player_id = p.id) AS avatar_suppressed
        FROM players p
    `);
    const avatarMap = new Map(
      avatarRows.map((row: any) => [String(row.id), playerAvatarUrl(String(row.id), row.has_db_avatar, row.avatar_suppressed)]),
    );

    return res.json({
      period: publicPeriod(result.period),
      selected_games_count: Number(result.selected_games_count || 0),
      completed_games_count: Number(result.completed_games_count || 0),
      distance_games: Number(result.distance_games || 0),
      standings: (result.standings || []).map((item: any) => ({
        ...item,
        avatar_url: avatarMap.get(String(item.player_id)) || null,
      })),
      self_player_id: playerId,
      warnings: Array.isArray(result.warnings) ? result.warnings : [],
    });
  } catch (error: any) {
    if (error?.message === 'Рейтинговый период не найден') {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить таблицу рейтингового периода' });
  }
});

export default router;
