import { Router } from 'express';
import { getDb } from '../../db/index.ts';
import { requireOrganizerAuth } from '../auth.ts';

const router = Router();

router.get('/:id/staff', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db || (await getDb());
    const evening = await db.get<any>('SELECT id, organizer_player_id FROM game_evenings WHERE id = ?', [String(req.params.id)]);
    if (!evening) return res.status(404).json({ error: 'Игровой вечер не найден' });

    const organizers = await db.all<any>(
      `SELECT id, nickname, club_role, judge_level, game_level
       FROM players
       WHERE club_role = 'organizer'
       ORDER BY nickname COLLATE NOCASE ASC`,
    );
    const organizer = evening.organizer_player_id
      ? await db.get<any>('SELECT id, nickname, club_role, judge_level, game_level FROM players WHERE id = ?', [evening.organizer_player_id])
      : null;

    return res.json({ organizer_player_id: evening.organizer_player_id || null, organizer, organizers });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Не удалось загрузить организаторов вечера' });
  }
});

router.patch('/:id/organizer', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db || (await getDb());
    const evening = await db.get<any>('SELECT id FROM game_evenings WHERE id = ?', [String(req.params.id)]);
    if (!evening) return res.status(404).json({ error: 'Игровой вечер не найден' });

    const requested = req.body?.organizer_player_id;
    const organizerPlayerId = requested == null || requested === '' ? null : String(requested);
    let organizer: any = null;
    if (organizerPlayerId) {
      organizer = await db.get<any>(
        `SELECT id, nickname, club_role, judge_level, game_level
         FROM players WHERE id = ?`,
        [organizerPlayerId],
      );
      if (!organizer) return res.status(404).json({ error: 'Игрок не найден' });
      if (organizer.club_role !== 'organizer') {
        return res.status(400).json({ error: 'Для вечера можно назначить только игрока с ролью «Организатор»' });
      }
    }

    await db.run(
      'UPDATE game_evenings SET organizer_player_id = ?, updated_at = ? WHERE id = ?',
      [organizerPlayerId, new Date().toISOString(), String(req.params.id)],
    );
    return res.json({ organizer_player_id: organizerPlayerId, organizer });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Не удалось назначить организатора вечера' });
  }
});

export default router;
