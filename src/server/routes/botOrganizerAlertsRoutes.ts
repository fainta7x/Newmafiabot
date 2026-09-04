import { Router } from 'express';
import { botServiceAuth } from '../botServiceAuth.ts';

const router = Router();
router.use(botServiceAuth);

const protocolStatus = (value: unknown): 'draft' | 'completed' => {
  if (typeof value !== 'string' || !value.trim()) return 'draft';
  try {
    return JSON.parse(value)?.protocol?.status === 'completed' ? 'completed' : 'draft';
  } catch {
    return 'draft';
  }
};

router.get('/organizer-operations', async (req, res) => {
  try {
    const db = req.db;
    const now = new Date();
    const dueSoon = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const tasks = await db.all(
      `SELECT t.id, t.title, t.type, t.status, t.priority, t.due_at,
              t.player_id, t.evening_id, p.nickname AS player_nickname,
              e.title AS evening_title
         FROM organizer_tasks t
    LEFT JOIN players p ON p.id = t.player_id
    LEFT JOIN game_evenings e ON e.id = t.evening_id
        WHERE t.status NOT IN ('done', 'cancelled')
          AND (t.priority = 'high' OR (t.due_at IS NOT NULL AND t.due_at <= ?))
        ORDER BY CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                 CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END,
                 t.due_at ASC
        LIMIT 40`,
      [dueSoon],
    );

    const gameRows = await db.all(
      `SELECT g.id, g.evening_id, g.global_game_number, g.protocol_text,
              e.title AS evening_title, e.starts_at
         FROM games g
         JOIN game_evenings e ON e.id = g.evening_id
        WHERE g.archived_at IS NULL
          AND e.settled_at IS NULL
          AND e.status IN ('published', 'active')
        ORDER BY e.starts_at ASC, g.global_game_number ASC, g.id ASC`,
    );
    const draftGames = gameRows
      .filter((row: any) => protocolStatus(row.protocol_text) === 'draft')
      .map((row: any) => ({
        id: row.id,
        evening_id: row.evening_id,
        evening_title: row.evening_title,
        starts_at: row.starts_at,
        global_game_number: row.global_game_number,
      }));

    return res.json({ generated_at: now.toISOString(), tasks, draft_games: draftGames });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось собрать организационные уведомления' });
  }
});

export default router;
