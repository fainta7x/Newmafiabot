import crypto from 'crypto';
import { Router } from 'express';
import { requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import { rebuildCanonicalEloRatings } from '../services/eloRatingService.ts';

const router = Router();

router.patch('/:id/elo-seed', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
  const db = (req as any).db;
  let previous: any = null;
  let changed = false;
  try {
    previous = await db.get(
      'SELECT id, nickname, elo, elo_seed, elo_seed_reason, elo_seed_set_at FROM players WHERE id = ? LIMIT 1',
      [req.params.id],
    );
    if (!previous) return res.status(404).json({ error: 'Игрок не найден' });

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
    changed = true;

    const recalculated = await rebuildCanonicalEloRatings(db);
    const updated = await db.get('SELECT * FROM players WHERE id = ?', [req.params.id]);

    await db.run(
      `INSERT INTO admin_change_log
       (id, entity_type, entity_id, action, field_name, before_json, after_json, note, actor_type, created_at)
       VALUES (?, 'player', ?, 'elo_seed_update', 'elo_seed', ?, ?, ?, 'organizer', ?)`,
      [
        `acl_${crypto.randomUUID()}`,
        req.params.id,
        JSON.stringify({ elo_seed: previous.elo_seed, elo: previous.elo, reason: previous.elo_seed_reason || null }),
        JSON.stringify({ elo_seed: updated.elo_seed, elo: updated.elo, reason: updated.elo_seed_reason || null }),
        reason || null,
        now,
      ],
    );

    return res.json({ player: updated, recalculated_players: recalculated.length });
  } catch (error: any) {
    if (changed && previous) {
      try {
        const rollbackAt = new Date().toISOString();
        await db.run(
          'UPDATE players SET elo_seed = ?, elo_seed_reason = ?, elo_seed_set_at = ?, updated_at = ? WHERE id = ?',
          [previous.elo_seed, previous.elo_seed_reason, previous.elo_seed_set_at, rollbackAt, req.params.id],
        );
        await rebuildCanonicalEloRatings(db);
      } catch (rollbackError) {
        console.error('[ELO] Failed to restore Elo seed after recalculation error:', rollbackError);
      }
    }
    return res.status(500).json({ error: error?.message || 'Не удалось изменить стартовый Elo' });
  }
});

export default router;
