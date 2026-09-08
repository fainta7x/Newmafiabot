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
      WITH ranked_players AS (
      SELECT
        p.id,
        p.nickname,
        p.elo,
        p.game_level,
        p.contact_status,
        EXISTS(SELECT 1 FROM player_avatars pa WHERE pa.player_id = p.id) AS has_db_avatar,
        EXISTS(SELECT 1 FROM player_avatar_repository_suppression s WHERE s.player_id = p.id) AS avatar_suppressed,
        (
          SELECT COUNT(DISTINCT g.id)
            FROM games g,
                 json_each(CASE WHEN json_valid(g.protocol_text) THEN g.protocol_text ELSE '{}' END, '$.player_results') result
           WHERE g.archived_at IS NULL
             AND json_extract(g.protocol_text, '$.protocol.status') = 'completed'
             AND CAST(json_extract(result.value, '$.player_id') AS TEXT) = CAST(p.id AS TEXT)
        ) + (
          SELECT COUNT(DISTINCT tgs.game_id)
            FROM tournament_participants tp
            JOIN tournament_game_seats tgs ON tgs.participant_id = tp.id
            JOIN tournament_games tg ON tg.id = tgs.game_id
            JOIN tournament_game_protocols tgp ON tgp.game_id = tg.id
           WHERE tp.player_id = p.id
             AND tg.status = 'completed'
             AND tgp.status = 'completed'
        ) AS games
      FROM players p
      WHERE COALESCE(p.contact_status, 'normal') != 'blocked'
      )
      SELECT * FROM ranked_players
       WHERE games > 0
       ORDER BY COALESCE(elo, 1000) DESC, nickname COLLATE NOCASE ASC, id ASC
    `);

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

    res.json({
      generated_at: new Date().toISOString(),
      players: leaderboard,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Не удалось загрузить рейтинг клуба' });
  }
});

export default router;
