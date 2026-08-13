import { Router } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { getPlayerSessionId } from '../auth.ts';
import { loadVkJoinCounts } from './vkJoinRegistrationService.ts';

const router = Router();

router.get('/evenings/:id/join-state', async (req, res) => {
  const db = req.db as DatabaseWrapper;
  const playerId = getPlayerSessionId(req);
  const player = playerId ? await db.get<any>('SELECT id,nickname FROM players WHERE id=? LIMIT 1', [playerId]) : null;
  const participant = player ? await db.get<any>('SELECT response_status FROM evening_participants WHERE evening_id=? AND player_id=? LIMIT 1', [req.params.id, player.id]) : null;
  return res.json({
    authenticated: Boolean(player),
    player: player ? { id: player.id, nickname: player.nickname } : null,
    response_status: participant?.response_status || 'unanswered',
    counts: await loadVkJoinCounts(db, req.params.id),
  });
});

export default router;
