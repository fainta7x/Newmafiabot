import { Router } from 'express';
import { getDb } from '../../db/index.ts';
import { ensureClubOperationsSchema } from '../../db/ensureClubOperationsSchema.ts';
import { requireOrganizerAuth } from '../auth.ts';

const router = Router();

async function loadStaff(db: any, eveningId: string) {
  await ensureClubOperationsSchema(db);
  const evening = await db.get<any>('SELECT id, title, status FROM game_evenings WHERE id = ? LIMIT 1', [eveningId]);
  if (!evening) return null;

  const assignment = await db.get<any>(`
    SELECT s.evening_id, s.organizer_player_id, s.assigned_at, s.updated_at,
           p.nickname AS organizer_nickname
      FROM evening_staff_assignments s
      LEFT JOIN players p ON p.id = s.organizer_player_id
     WHERE s.evening_id = ?
     LIMIT 1
  `, [eveningId]);

  const organizers = await db.all<any>(`
    SELECT id, nickname, club_role, judge_level
      FROM players
     WHERE COALESCE(club_role, 'member') = 'organizer'
       AND COALESCE(contact_status, 'normal') != 'blocked'
     ORDER BY nickname COLLATE NOCASE
  `);

  const judges = await db.all<any>(`
    SELECT id, nickname, club_role, judge_level
      FROM players
     WHERE COALESCE(judge_level, 'none') != 'none'
       AND COALESCE(contact_status, 'normal') != 'blocked'
     ORDER BY nickname COLLATE NOCASE
  `);

  const gameJudges = await db.all<any>(`
    SELECT g.id AS game_id, g.global_game_number, g.judge_player_id, g.judge_name,
           p.nickname AS linked_judge_nickname
      FROM games g
      LEFT JOIN players p ON p.id = g.judge_player_id
     WHERE g.evening_id = ? AND g.archived_at IS NULL
     ORDER BY g.global_game_number ASC
  `, [eveningId]);

  return {
    evening,
    organizer: assignment ? {
      player_id: assignment.organizer_player_id || null,
      nickname: assignment.organizer_nickname || null,
      assigned_at: assignment.assigned_at,
      updated_at: assignment.updated_at,
    } : null,
    organizers,
    judges,
    game_judges: gameJudges.map((game: any) => ({
      game_id: game.game_id,
      game_number: game.global_game_number,
      player_id: game.judge_player_id || null,
      nickname: game.linked_judge_nickname || game.judge_name || null,
      linked: Boolean(game.judge_player_id),
    })),
  };
}

router.get('/:id/staff', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db || (await getDb());
    const staff = await loadStaff(db, String(req.params.id));
    if (!staff) return res.status(404).json({ error: 'Вечер не найден' });
    return res.json(staff);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить команду вечера' });
  }
});

router.patch('/:id/staff', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db || (await getDb());
    await ensureClubOperationsSchema(db);
    const eveningId = String(req.params.id);
    const evening = await db.get<any>('SELECT id FROM game_evenings WHERE id = ? LIMIT 1', [eveningId]);
    if (!evening) return res.status(404).json({ error: 'Вечер не найден' });

    const organizerPlayerId = String(req.body?.organizer_player_id || '').trim();
    if (!organizerPlayerId) return res.status(400).json({ error: 'Выбери организатора вечера' });

    const organizer = await db.get<any>(`
      SELECT id, nickname, club_role
        FROM players
       WHERE id = ? AND COALESCE(club_role, 'member') = 'organizer'
       LIMIT 1
    `, [organizerPlayerId]);
    if (!organizer) return res.status(400).json({ error: 'Организатор вечера должен иметь роль «Организатор» в профиле' });

    const now = new Date().toISOString();
    await db.run(`
      INSERT INTO evening_staff_assignments (evening_id, organizer_player_id, assigned_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(evening_id) DO UPDATE SET
        organizer_player_id = excluded.organizer_player_id,
        updated_at = excluded.updated_at
    `, [eveningId, organizerPlayerId, now, now]);

    return res.json(await loadStaff(db, eveningId));
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось назначить организатора вечера' });
  }
});

export default router;
