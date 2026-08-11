import { Router } from 'express';
import { requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import { normalizeJudgeLevel } from '../../db/ensureJudgeAuthoritySchema.ts';

const router = Router();

// Validation middleware that runs before the existing tournament judge-assignment route.
// External text judges remain possible for legacy/history corrections; linked CRM judges
// must hold the full `judge` authority before they can be assigned to a tournament game.
router.patch('/:id/games/:gameId/judge', requireOrganizerAuth, async (req: AuthenticatedRequest, res, next) => {
  const playerId = typeof req.body?.judge_player_id === 'string' ? req.body.judge_player_id.trim() : '';
  if (!playerId) return next();

  try {
    const db = (req as any).db;
    const player = await db.get('SELECT id, nickname, judge_level FROM players WHERE id = ? LIMIT 1', [playerId]);
    if (!player) return res.status(400).json({ error: 'Игрок-судья не найден в CRM' });
    if (normalizeJudgeLevel(player.judge_level) !== 'judge') {
      return res.status(400).json({
        error: `${player.nickname}: турнирную игру может вести только игрок со званием «Судья»`,
      });
    }
    return next();
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось проверить полномочия судьи' });
  }
});

export default router;
