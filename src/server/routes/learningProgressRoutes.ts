import { Router } from 'express';
import { requireOrganizerAuth } from '../auth.ts';
import { ensureSplitVoteProgressSchema } from '../../db/ensureSplitVoteProgressSchema.ts';
import type { LearningPlayerRow } from '../../lib/learningProgress.ts';

/** Curator view: which trainer exams each player passed and when. Read-only. */
const router = Router();
router.use(requireOrganizerAuth);

const loadRows = async (db: any, playerId?: string): Promise<LearningPlayerRow[]> => {
  await ensureSplitVoteProgressSchema(db);
  const players = await db.all(
    `SELECT id, nickname, club_stage, game_level FROM players
      WHERE ${playerId ? 'id = ?' : "COALESCE(lifecycle_status, 'normal') NOT IN ('archived', 'deleted')"}
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

export default router;
