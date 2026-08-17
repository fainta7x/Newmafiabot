import { Router, type Response } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { getRepositoryPlayerAvatarAsset } from '../../lib/playerAvatarManifest.ts';
import { getPlayerSessionId, type AuthenticatedRequest } from '../auth.ts';

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

router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  if (!requireClubUser(req, res)) return;

  try {
    const db = req.db as DatabaseWrapper;
    const rows = await db.all<any>(`
      SELECT
        p.id,
        p.nickname,
        p.elo,
        p.game_level,
        p.contact_status,
        EXISTS(SELECT 1 FROM player_avatars pa WHERE pa.player_id = p.id) AS has_db_avatar,
        EXISTS(SELECT 1 FROM player_avatar_repository_suppression s WHERE s.player_id = p.id) AS avatar_suppressed
      FROM players p
      WHERE COALESCE(p.contact_status, 'normal') != 'blocked'
      ORDER BY COALESCE(p.elo, 1000) DESC, p.nickname COLLATE NOCASE ASC, p.id ASC
    `);

    const leaderboard = rows.map((row: any, index: number) => {
      const playerId = String(row.id);
      return {
        place: index + 1,
        player_id: playerId,
        nickname: String(row.nickname || 'Игрок'),
        elo: Math.round(Number(row.elo || 1000)),
        game_level: row.game_level || 'club',
        avatar_url: playerAvatarUrl(playerId, row.has_db_avatar, row.avatar_suppressed),
      };
    });

    res.json({
      generated_at: new Date().toISOString(),
      players: leaderboard,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Не удалось загрузить рейтинг клуба' });
  }
});

export default router;
