import { Router, Response } from 'express';
import crypto from 'crypto';
import { getDb } from '../../db/index.ts';
import { requireOrganizerAuth, AuthenticatedRequest } from '../auth.ts';
import {
  createEveningSchema,
  updateEveningSchema,
  bulkAddParticipantsSchema,
  addSingleParticipantSchema,
  updateParticipantSchema,
} from '../validation.ts';

const router = Router();

// GET /api/evenings - List all game evenings
router.get('/', async (req, res) => {
  try {
    const db = await getDb();
    const evenings = await db.all(`
      SELECT e.*, 
        (SELECT COUNT(*) FROM evening_participants p WHERE p.evening_id = e.id AND p.registration_status != 'cancelled') as registered_count,
        (SELECT COUNT(*) FROM evening_participants p WHERE p.evening_id = e.id AND p.registration_status = 'confirmed') as confirmed_count,
        (SELECT COUNT(*) FROM evening_participants p WHERE p.evening_id = e.id AND p.attendance_status = 'attended') as attended_count,
        (SELECT COUNT(*) FROM evening_participants p WHERE p.evening_id = e.id AND p.attendance_status = 'no_show') as no_show_count,
        (SELECT COALESCE(SUM(amount_paid), 0) FROM evening_participants p WHERE p.evening_id = e.id) as total_revenue
      FROM game_evenings e
      ORDER BY e.starts_at DESC
    `);
    res.json(evenings);
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// GET /api/evenings/:id - Get single evening details
router.get('/:id', async (req, res) => {
  try {
    const db = await getDb();
    const evening = await db.get('SELECT * FROM game_evenings WHERE id = ?', [req.params.id]);
    if (!evening) {
      return res.status(404).json({ error: 'Игровой вечер не найден' });
    }

    const participants = await db.all(`
      SELECT ep.*, p.nickname, p.phone, p.telegram_username, p.lifecycle_status, p.elo
      FROM evening_participants ep
      JOIN players p ON ep.player_id = p.id
      WHERE ep.evening_id = ?
      ORDER BY ep.created_at ASC
    `, [req.params.id]);

    const games = await db.all('SELECT * FROM games WHERE evening_id = ? ORDER BY global_game_number ASC', [req.params.id]);

    res.json({ ...evening, participants, games });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// POST /api/evenings - Create new evening (Auth required)
router.post('/', requireOrganizerAuth, async (req, res) => {
  try {
    const data = createEveningSchema.parse(req.body);
    const db = await getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.run(
      `INSERT INTO game_evenings (id, title, starts_at, ends_at, timezone, venue, format, status, capacity, default_price, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.title,
        data.starts_at,
        data.ends_at || null,
        data.timezone,
        data.venue || null,
        data.format,
        data.status,
        data.capacity,
        data.default_price,
        data.notes || null,
        now,
        now,
      ]
    );

    const created = await db.get('SELECT * FROM game_evenings WHERE id = ?', [id]);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: 'Validation error', details: err.errors || err.message });
  }
});

// PATCH /api/evenings/:id - Update evening (Auth required)
router.patch('/:id', requireOrganizerAuth, async (req, res) => {
  try {
    const data = updateEveningSchema.parse(req.body);
    const db = await getDb();
    const evening = await db.get('SELECT * FROM game_evenings WHERE id = ?', [req.params.id]);
    if (!evening) {
      return res.status(404).json({ error: 'Игровой вечер не найден' });
    }

    const fields: string[] = [];
    const values: any[] = [];

    Object.entries(data).forEach(([key, val]) => {
      if (val !== undefined) {
        fields.push(`${key} = ?`);
        values.push(val);
      }
    });

    if (fields.length > 0) {
      fields.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(req.params.id);

      await db.run(`UPDATE game_evenings SET ${fields.join(', ')} WHERE id = ?`, values);
    }

    const updated = await db.get('SELECT * FROM game_evenings WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: 'Validation error', details: err.errors || err.message });
  }
});

// DELETE /api/evenings/:id - Delete evening (Auth required)
router.delete('/:id', requireOrganizerAuth, async (req, res) => {
  try {
    const db = await getDb();
    await db.run('DELETE FROM game_evenings WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Игровой вечер успешно удален' });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// GET /api/evenings/:id/participants - List participants of an evening
router.get('/:id/participants', async (req, res) => {
  try {
    const db = await getDb();
    const participants = await db.all(`
      SELECT ep.*, p.nickname, p.phone, p.telegram_username, p.lifecycle_status, p.elo
      FROM evening_participants ep
      JOIN players p ON ep.player_id = p.id
      WHERE ep.evening_id = ?
      ORDER BY ep.created_at ASC
    `, [req.params.id]);
    res.json(participants);
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// POST /api/evenings/:id/participants/bulk - Bulk add 20+ players at once (Auth required)
router.post('/:id/participants/bulk', requireOrganizerAuth, async (req, res) => {
  try {
    const { player_ids, registration_status, amount_due } = bulkAddParticipantsSchema.parse(req.body);
    const db = await getDb();

    const evening = await db.get('SELECT * FROM game_evenings WHERE id = ?', [req.params.id]);
    if (!evening) {
      return res.status(404).json({ error: 'Игровой вечер не найден' });
    }

    const defaultPrice = amount_due !== undefined ? amount_due : evening.default_price;
    const now = new Date().toISOString();
    let addedCount = 0;
    let skippedCount = 0;

    await db.exec('BEGIN TRANSACTION');
    try {
      for (const playerId of player_ids) {
        const existing = await db.get(
          'SELECT id FROM evening_participants WHERE evening_id = ? AND player_id = ?',
          [req.params.id, playerId]
        );

        if (existing) {
          skippedCount++;
        } else {
          const partId = crypto.randomUUID();
          await db.run(
            `INSERT INTO evening_participants (id, evening_id, player_id, registration_status, attendance_status, arrival_status, payment_status, amount_due, amount_paid, registered_at, confirmed_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              partId,
              req.params.id,
              playerId,
              registration_status,
              'pending',
              'unknown',
              'unpaid',
              defaultPrice,
              0,
              now,
              registration_status === 'confirmed' ? now : null,
              now,
              now,
            ]
          );
          addedCount++;
        }
      }
      await db.exec('COMMIT');
    } catch (e: any) {
      console.error('INNER BULK ADD ERROR:', e.message);
      try { await db.exec('ROLLBACK'); } catch (_) {}
      throw e;
    }

    const updatedParticipants = await db.all(`
      SELECT ep.*, p.nickname, p.phone, p.telegram_username, p.lifecycle_status, p.elo
      FROM evening_participants ep
      JOIN players p ON ep.player_id = p.id
      WHERE ep.evening_id = ?
    `, [req.params.id]);

    res.json({
      success: true,
      addedCount,
      skippedCount,
      participants: updatedParticipants,
    });
  } catch (err: any) {
    res.status(400).json({ error: 'Validation or DB error', details: err.errors || err.message });
  }
});

// POST /api/evenings/:id/participants - Add single player or quick guest (Auth required)
router.post('/:id/participants', requireOrganizerAuth, async (req, res) => {
  try {
    const data = addSingleParticipantSchema.parse(req.body);
    const db = await getDb();

    const evening = await db.get('SELECT * FROM game_evenings WHERE id = ?', [req.params.id]);
    if (!evening) {
      return res.status(404).json({ error: 'Игровой вечер не найден' });
    }

    let playerId = data.player_id;

    // Quick guest creation if player_id is missing
    if (!playerId && data.nickname) {
      let existingPlayer = await db.get('SELECT id FROM players WHERE nickname = ?', [data.nickname]);
      if (existingPlayer) {
        playerId = existingPlayer.id;
      } else {
        playerId = crypto.randomUUID();
        const now = new Date().toISOString();
        await db.run(
          `INSERT INTO players (id, nickname, phone, lifecycle_status, source, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [playerId, data.nickname, data.phone || null, 'newcomer', 'quick_guest', now, now]
        );
      }
    }

    if (!playerId) {
      return res.status(400).json({ error: 'Укажите player_id или nickname игрока' });
    }

    const existingPart = await db.get(
      'SELECT id FROM evening_participants WHERE evening_id = ? AND player_id = ?',
      [req.params.id, playerId]
    );

    if (existingPart) {
      return res.status(400).json({ error: 'Игрок уже записан на этот вечер' });
    }

    const partId = crypto.randomUUID();
    const now = new Date().toISOString();
    const paymentStatus = data.amount_paid >= data.amount_due ? 'paid' : data.amount_paid > 0 ? 'partial' : 'unpaid';

    await db.run(
      `INSERT INTO evening_participants (id, evening_id, player_id, registration_status, attendance_status, arrival_status, payment_status, amount_due, amount_paid, notes, registered_at, confirmed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        partId,
        req.params.id,
        playerId,
        data.registration_status,
        'pending',
        'unknown',
        paymentStatus,
        data.amount_due,
        data.amount_paid,
        data.notes || null,
        now,
        data.registration_status === 'confirmed' ? now : null,
        now,
        now,
      ]
    );

    const participant = await db.get(`
      SELECT ep.*, p.nickname, p.phone, p.telegram_username, p.lifecycle_status, p.elo
      FROM evening_participants ep
      JOIN players p ON ep.player_id = p.id
      WHERE ep.id = ?
    `, [partId]);

    res.status(201).json(participant);
  } catch (err: any) {
    res.status(400).json({ error: 'Validation error', details: err.errors || err.message });
  }
});

// POST /api/evenings/:id/settle - Idempotent Evening Settlement (Auth required)
router.post('/:id/settle', requireOrganizerAuth, async (req, res) => {
  try {
    const db = await getDb();
    const evening = await db.get('SELECT * FROM game_evenings WHERE id = ?', [req.params.id]);
    if (!evening) {
      return res.status(404).json({ error: 'Игровой вечер не найден' });
    }

    if (evening.settled_at) {
      return res.json({
        success: true,
        alreadySettled: true,
        message: 'Вечер уже был закрыт ранее. Повторное начисление транзакций пропущено.',
        evening,
      });
    }

    const participants = await db.all('SELECT * FROM evening_participants WHERE evening_id = ?', [req.params.id]);
    const now = new Date().toISOString();

    await db.exec('BEGIN TRANSACTION');
    try {
      for (const p of participants) {
        // Automatically mark attendance to 'attended' if checked in or paying
        if (p.attendance_status === 'pending' && p.registration_status !== 'cancelled') {
          await db.run('UPDATE evening_participants SET attendance_status = ? WHERE id = ?', ['attended', p.id]);
        }

        const due = p.amount_due || 0;
        const paid = p.amount_paid || 0;
        const debt = due - paid;

        // 1. Record paid income if amount_paid > 0
        if (paid > 0) {
          const txId = crypto.randomUUID();
          await db.run(
            `INSERT INTO financial_transactions (id, type, amount, category, description, player_id, evening_id, source_type, source_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              txId,
              'income',
              paid,
              'Взнос за вечер',
              `Оплата за вечер ${evening.title}`,
              p.player_id,
              evening.id,
              'evening_settle',
              p.id,
              now,
            ]
          );
        }

        // 2. Record debt created if due > paid
        if (debt > 0) {
          const txId = crypto.randomUUID();
          await db.run(
            `INSERT INTO financial_transactions (id, type, amount, category, description, player_id, evening_id, source_type, source_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              txId,
              'debt_created',
              debt,
              'Неоплата за вечер',
              `Долг за вечер ${evening.title}`,
              p.player_id,
              evening.id,
              'evening_settle',
              p.id,
              now,
            ]
          );
        }
      }

      // Mark evening as settled and completed
      await db.run(
        'UPDATE game_evenings SET status = ?, settled_at = ?, updated_at = ? WHERE id = ?',
        ['completed', now, now, req.params.id]
      );

      await db.exec('COMMIT');
    } catch (e) {
      await db.exec('ROLLBACK');
      throw e;
    }

    const settledEvening = await db.get('SELECT * FROM game_evenings WHERE id = ?', [req.params.id]);
    res.json({
      success: true,
      alreadySettled: false,
      message: 'Игровой вечер успешно закрыт и рассчитан',
      evening: settledEvening,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Database transaction error', message: err.message });
  }
});

export default router;
