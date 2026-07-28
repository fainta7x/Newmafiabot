import { Router } from 'express';
import { getDb } from '../../db/index.ts';
import { requireOrganizerAuth } from '../auth.ts';

const router = Router();

// GET /api/games - List all games with optional filters
router.get('/', async (req, res) => {
  try {
    const { evening_id } = req.query;
    const db = await getDb();

    let query = 'SELECT * FROM games WHERE 1=1';
    const params: any[] = [];

    if (evening_id) {
      query += ' AND evening_id = ?';
      params.push(evening_id);
    }

    query += ' ORDER BY global_game_number DESC';

    const games = await db.all(query, params);
    const parsed = games.map((g: any) => ({
      ...g,
      slots: JSON.parse(g.slots_json || '[]'),
    }));

    res.json(parsed);
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// POST /api/games - Record new game protocol (Auth required)
router.post('/', requireOrganizerAuth, async (req, res) => {
  try {
    const {
      evening_id,
      global_game_number,
      game_date,
      winner_team,
      winner_label,
      judge_name,
      protocol_text,
      slots,
    } = req.body;

    const db = await getDb();
    const now = new Date().toISOString();

    const result = await db.run(
      `INSERT INTO games (evening_id, global_game_number, game_date, winner_team, winner_label, judge_name, protocol_text, slots_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        evening_id || null,
        global_game_number || 1,
        game_date || new Date().toISOString().slice(0, 10),
        winner_team || winner_label || 'Чёрные',
        winner_label || 'Чёрные',
        judge_name || 'Главный судья',
        protocol_text || '',
        JSON.stringify(slots || []),
        now,
      ]
    );

    const created = await db.get('SELECT * FROM games WHERE id = ?', [result.lastID]);
    res.status(201).json({
      ...created,
      slots: JSON.parse(created.slots_json || '[]'),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

export default router;
