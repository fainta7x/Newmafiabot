import { Router, type Response } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { getPlayerSessionId, type AuthenticatedRequest } from '../auth.ts';

const router = Router();

const requireClubUser = (req: AuthenticatedRequest, res: Response): string | null => {
  if (req.userRole === 'ORGANIZER') return 'organizer';
  const playerId = getPlayerSessionId(req);
  if (playerId) return playerId;
  res.status(401).json({ error: 'Требуется авторизация игрока или организатора' });
  return null;
};

router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  if (!requireClubUser(req, res)) return;

  try {
    const db = (req as any).db as DatabaseWrapper;
    const rows = await db.all<any>(`
      SELECT
        p.id,
        p.nickname,
        p.elo,
        p.game_level,
        p.contact_status,
        (SELECT updated_at FROM player_avatars pa WHERE pa.player_id = p.id) AS avatar_updated_at
      FROM players p
      WHERE COALESCE(p.contact_status, 'normal') != 'blocked'
      ORDER BY COALESCE(p.elo, 1000) DESC, p.nickname COLLATE NOCASE ASC, p.id ASC
    `);

    const leaderboard = rows.map((row: any, index: number) => ({
      place: index + 1,
      player_id: String(row.id),
      nickname: String(row.nickname || 'Игрок'),
      elo: Math.round(Number(row.elo || 1000)),
      game_level: row.game_level || 'club',
      avatar_updated_at: row.avatar_updated_at || null,
    }));

    res.json({
      generated_at: new Date().toISOString(),
      players: leaderboard,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Не удалось загрузить рейтинг клуба' });
  }
});

export default router;
