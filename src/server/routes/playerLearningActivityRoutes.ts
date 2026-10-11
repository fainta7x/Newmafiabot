import { Router } from 'express';
import { ensureLearningActivitySchema } from '../../db/ensureLearningActivitySchema.ts';
import { isLearningItem } from '../../lib/learningActivity.ts';
import { getPlayerSessionId } from '../auth.ts';

const router = Router();

const score = (value: unknown) => (Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 10_000 ? (value as number) : null);

/**
 * A player finished one try of a practice (a step of the reasoning school, a practice, the judge's trainer). The public
 * guide also opens without an account: then there is nobody to record and the answer is empty, not an error.
 */
router.post('/learning-activity', async (req, res) => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) return res.status(204).end();
  const { track, item, passed } = req.body || {};
  if (!isLearningItem(track, item) || typeof passed !== 'boolean') return res.status(400).json({ error: 'Неизвестное упражнение' });
  try {
    await ensureLearningActivitySchema(req.db);
    const now = new Date().toISOString();
    await req.db.run(
      `INSERT INTO player_learning_activity (player_id, track, item, attempts, best_score, max_score, passed_at, first_at, last_at)
       VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)
       ON CONFLICT(player_id, track, item) DO UPDATE SET
         attempts = attempts + 1,
         best_score = MAX(COALESCE(best_score, 0), COALESCE(excluded.best_score, 0)),
         max_score = COALESCE(excluded.max_score, max_score),
         passed_at = COALESCE(passed_at, excluded.passed_at),
         last_at = excluded.last_at`,
      [String(playerId), track, item, score(req.body?.score), score(req.body?.maxScore), passed ? now : null, now, now],
    );
    return res.status(204).end();
  } catch (error) {
    console.error('[LEARNING] Failed to record activity:', error instanceof Error ? error.message : String(error));
    return res.status(500).json({ error: 'Не удалось сохранить результат' });
  }
});

export default router;
