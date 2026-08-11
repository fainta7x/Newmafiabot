import { Router } from 'express';
import { requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import { rebuildCanonicalEloRatings } from '../services/eloRatingService.ts';

const router = Router();

router.patch('/:id/elo-seed', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const db = (req as any).db;
    const player = await db.get('SELECT id, nickname FROM players WHERE id = ? LIMIT 1', [req.params.id]);
    if (!player) return res.status(404).json({ error: 'Игрок не найден' });

    const seed = Number(req.body?.elo_seed);
    if (!Number.isInteger(seed) || seed < 0 || seed > 10000) {
      return res.status(400).json({ error: 'Стартовый Elo должен быть целым числом от 0 до 10000' });
    }

    const reasonRaw = req.body?.reason;
    const reason = reasonRaw === null || reasonRaw === undefined ? null : String(reasonRaw).trim();
    if (reason && reason.length > 200) {
      return res.status(400).json({ error: 'Основание не должно быть длиннее 200 символов' });
    }

    const now = new Date().toISOString();
    await db.run(
      'UPDATE players SET elo_seed = ?, elo_seed_reason = ?, elo_seed_set_at = ?, updated_at = ? WHERE id = ?',
      [seed, reason || null, now, now, req.params.id],
    );

    const recalculated = await rebuildCanonicalEloRatings(db);
    const updated = await db.get('SELECT * FROM players WHERE id = ?', [req.params.id]);
    return res.json({ player: updated, recalculated_players: recalculated.length });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось изменить стартовый Elo' });
  }
});

export default router;
