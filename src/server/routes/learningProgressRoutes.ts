import { Router } from 'express';
import { requireOrganizerAuth } from '../auth.ts';
import { ensureSplitVoteProgressSchema } from '../../db/ensureSplitVoteProgressSchema.ts';
import { ensureLearningActivitySchema } from '../../db/ensureLearningActivitySchema.ts';
import { learningItemKey, type LearningActivityRow } from '../../lib/learningActivity.ts';
import type { LearningPlayerRow } from '../../lib/learningProgress.ts';

/** Curator view: which trainer exams each player passed and when. Read-only. */
const router = Router();
router.use(requireOrganizerAuth);

const loadRows = async (db: any, playerId?: string): Promise<LearningPlayerRow[]> => {
  await ensureSplitVoteProgressSchema(db);
  const players = await db.all(
    `SELECT id, nickname, club_stage, game_level FROM players
      WHERE ${playerId ? 'id = ?' : "COALESCE(lifecycle_status, 'normal') NOT IN ('archived', 'merged', 'deleted')"}
      ORDER BY nickname COLLATE NOCASE`,
    playerId ? [playerId] : [],
  );
  const progress = await db.all(
    `SELECT player_id, level, passed_at FROM player_split_vote_progress ${playerId ? 'WHERE player_id = ?' : ''}`,
    playerId ? [playerId] : [],
  );
  const byPlayer = new Map<string, LearningPlayerRow['passed']>();
  for (const row of progress) {
    const passed = byPlayer.get(String(row.player_id)) || {};
    passed[row.level as keyof LearningPlayerRow['passed']] = String(row.passed_at);
    byPlayer.set(String(row.player_id), passed);
  }
  return players.map((player: any) => ({
    id: String(player.id),
    nickname: String(player.nickname || 'Без ника'),
    club_stage: player.club_stage ?? null,
    game_level: player.game_level ?? null,
    passed: byPlayer.get(String(player.id)) || {},
  }));
};

router.get('/split-vote', async (req, res) => {
  try {
    return res.json({ players: await loadRows(req.db) });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить результаты обучения' });
  }
});

router.get('/split-vote/:playerId', async (req, res) => {
  try {
    const [row] = await loadRows(req.db, String(req.params.playerId));
    if (!row) return res.status(404).json({ error: 'Игрок не найден' });
    return res.json(row);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить результаты обучения' });
  }
});

/** Curator view of the reasoning school and the judge's trainer: tries, best score and when each item was passed. */
router.get('/activity', async (req, res) => {
  try {
    await ensureLearningActivitySchema(req.db);
    const players = await req.db.all(
      `SELECT id, nickname FROM players WHERE COALESCE(lifecycle_status, 'normal') NOT IN ('archived', 'merged', 'deleted') ORDER BY nickname COLLATE NOCASE`,
    );
    const activity = await req.db.all('SELECT player_id, track, item, attempts, best_score, max_score, passed_at, last_at FROM player_learning_activity');
    const byPlayer = new Map<string, LearningActivityRow['items']>();
    for (const row of activity as any[]) {
      const items = byPlayer.get(String(row.player_id)) || {};
      items[learningItemKey(row.track, row.item)] = {
        attempts: Number(row.attempts), best_score: row.best_score ?? null, max_score: row.max_score ?? null, passed_at: row.passed_at ?? null, last_at: String(row.last_at),
      };
      byPlayer.set(String(row.player_id), items);
    }
    const rows: LearningActivityRow[] = (players as any[]).map((player) => ({ id: String(player.id), nickname: String(player.nickname || 'Без ника'), items: byPlayer.get(String(player.id)) || {} }));
    return res.json({ players: rows });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить результаты обучения' });
  }
});

export default router;
