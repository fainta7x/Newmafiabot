import { Router } from 'express';
import { getPlayerSessionId } from '../auth.ts';
import { EVENING_VOTE_CATEGORY, castEveningVote, ensureEveningVoteSchema as ensureSchema, loadVotingContext } from '../services/eveningVotingService.ts';

export { EVENING_VOTE_CATEGORY };

const router = Router();
// One question for the whole evening (owner, 2026-10-04): «Кто сыграл лучше всех?». The old role categories are retired;
// their stored votes stay in the table but are no longer offered or counted. The rules live in eveningVotingService.
const CATEGORIES = new Set([EVENING_VOTE_CATEGORY]);

const requirePlayerId = (req: any, res: any): string | null => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) {
    res.status(401).json({ error: 'Player authentication required.' });
    return null;
  }
  return playerId;
};

router.get('/stories/:eveningId/voting', async (req, res) => {
  const viewerId = requirePlayerId(req, res);
  if (!viewerId) return;

  try {
    const db = req.db;
    await ensureSchema(db);
    const context = await loadVotingContext(db, req.params.eveningId, viewerId);
    if (context.error === 'not_completed') return res.status(409).json({ error: 'Голосование доступно только после завершения вечера' });
    if (context.error === 'not_attended') return res.status(403).json({ error: 'Голосовать могут только игроки, которые были на этом вечере' });

    const [myVotes, resultRows] = await Promise.all([
      db.all(`
        SELECT category, nominee_player_id
          FROM evening_player_votes
         WHERE evening_id = ? AND voter_player_id = ? AND category = 'best_player'
      `, [req.params.eveningId, viewerId]),
      db.all(`
        SELECT category, nominee_player_id, COUNT(*) AS votes
          FROM evening_player_votes
         WHERE evening_id = ? AND category = 'best_player'
         GROUP BY category, nominee_player_id
      `, [req.params.eveningId]),
    ]);

    const myVoteMap = Object.fromEntries(myVotes.map((row: any) => [String(row.category), String(row.nominee_player_id)]));
    const results = resultRows.map((row: any) => ({
      category: String(row.category),
      nominee_player_id: String(row.nominee_player_id),
      votes: Number(row.votes || 0),
    }));

    return res.json({
      evening: { id: String(context.evening.id), title: String(context.evening.title || 'Игровой вечер') },
      voting_open: context.votingOpen,
      deadline: context.deadlineMs ? new Date(context.deadlineMs).toISOString() : null,
      categories: [EVENING_VOTE_CATEGORY],
      nominees: context.nominees,
      my_votes: myVoteMap,
      results,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить голосование вечера' });
  }
});

router.post('/stories/:eveningId/vote', async (req, res) => {
  const viewerId = requirePlayerId(req, res);
  if (!viewerId) return;
  const category = String(req.body?.category || '').trim();
  const nomineePlayerId = String(req.body?.nominee_player_id || '').trim();
  if (!CATEGORIES.has(category) || !nomineePlayerId) return res.status(400).json({ error: 'Некорректная категория или кандидат' });

  try {
    const result = await castEveningVote(req.db, req.params.eveningId, viewerId, nomineePlayerId);
    if (!result.ok) {
      if (result.code === 'not_completed') return res.status(409).json({ error: 'Вечер ещё не завершён' });
      if (result.code === 'not_attended') return res.status(403).json({ error: 'Голосовать могут только участники вечера' });
      if (result.code === 'closed') return res.status(409).json({ error: 'Голосование по этому вечеру уже закрыто' });
      return res.status(400).json({ error: 'Этот игрок не подходит для выбранной номинации' });
    }
    return res.json({ success: true, category, nominee_player_id: result.nominee.player_id, updated_at: result.updatedAt });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось сохранить голос' });
  }
});

export default router;
