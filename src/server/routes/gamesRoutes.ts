import { Router } from 'express';
import crypto from 'crypto';
import { getDb } from '../../db/index.ts';
import { requireOrganizerAuth } from '../auth.ts';
import { createGameSchema } from '../validation.ts';

const router = Router();

// GET /api/games - List all games with optional filters
router.get('/', async (req, res) => {
  try {
    const { evening_id } = req.query;
    const db = (req as any).db || (await getDb());

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

// POST /api/games - Record new game protocol & recalculate ELO/stats (Auth required)
router.post('/', requireOrganizerAuth, async (req, res) => {
  try {
    const data = createGameSchema.parse(req.body);
    const db = (req as any).db || (await getDb());
    const now = new Date().toISOString();

    let createdGame: any = null;

    await db.exec('BEGIN TRANSACTION');
    try {
      // 1. Insert Game Record
      await db.run(
        `INSERT INTO games (evening_id, global_game_number, game_date, winner_team, winner_label, judge_name, protocol_text, slots_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.evening_id || null,
          data.global_game_number,
          data.game_date,
          data.winner_team,
          data.winner_label,
          data.judge_name,
          data.protocol_text || '',
          JSON.stringify(data.slots),
          now,
        ]
      );

      // Fetch newly created game by unique global_game_number & created_at
      createdGame = await db.get(
        'SELECT * FROM games WHERE global_game_number = ? ORDER BY id DESC LIMIT 1',
        [data.global_game_number]
      );

      const isRedWin =
        data.winner_team.toLowerCase().includes('красн') ||
        data.winner_team.toLowerCase().includes('мирн') ||
        data.winner_team.toLowerCase().includes('red');

      // 2. Process players in slots: Update ELO & tokens
      for (const slot of data.slots) {
        let player = null;
        if (slot.player_id) {
          player = await db.get('SELECT * FROM players WHERE id = ?', [slot.player_id]);
        }
        if (!player && slot.nickname) {
          player = await db.get('SELECT * FROM players WHERE nickname = ?', [slot.nickname]);
        }

        // Auto-create player if doesn't exist
        if (!player && slot.nickname) {
          const playerId = crypto.randomUUID();
          await db.run(
            `INSERT INTO players (id, nickname, lifecycle_status, source, elo, tokens, created_at, updated_at)
             VALUES (?, ?, 'newcomer', 'game_protocol', 1000, 0, ?, ?)`,
            [playerId, slot.nickname, now, now]
          );
          player = await db.get('SELECT * FROM players WHERE id = ?', [playerId]);
        }

        if (player) {
          const isRedRole = slot.role === 'Мирный' || slot.role === 'Шериф';

          let eloDelta = 0;
          let tokensDelta = 0;

          if (isRedWin) {
            if (isRedRole) {
              eloDelta = 15;
              tokensDelta = 1;
            } else {
              eloDelta = -10;
            }
          } else {
            if (!isRedRole) {
              eloDelta = 20;
              tokensDelta = 2;
            } else {
              eloDelta = -15;
            }
          }

          const newElo = Math.max(100, (player.elo || 1000) + eloDelta);
          const newTokens = (player.tokens || 0) + tokensDelta;

          await db.run(
            'UPDATE players SET elo = ?, tokens = ?, updated_at = ? WHERE id = ?',
            [newElo, newTokens, now, player.id]
          );
        }
      }

      await db.exec('COMMIT');
    } catch (err: any) {
      try { await db.exec('ROLLBACK'); } catch (_) {}
      throw err;
    }

    res.status(201).json({
      ...createdGame,
      slots: JSON.parse(createdGame?.slots_json || '[]'),
    });
  } catch (err: any) {
    if (err.errors) {
      return res.status(400).json({ error: 'Ошибка валидации протокола игры', details: err.errors });
    }
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

export default router;
