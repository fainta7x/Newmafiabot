import { Router, Response } from 'express';
import crypto from 'crypto';
import { getDb } from '../../db/index.ts';
import { requireOrganizerAuth, AuthenticatedRequest } from '../auth.ts';
import {
  createEveningSchema,
  updateEveningSchema,
  bulkAddParticipantsSchema,
  addSingleParticipantSchema,
} from '../validation.ts';

const router = Router();

// GET /api/evenings - List game evenings (Public gets published/active, Organizer gets all)
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = (req as any).db || (await getDb());
    const isOrganizer = req.userRole === 'ORGANIZER';

    if (!isOrganizer) {
      // Public View: Only published/active future/recent evenings with safe public fields
      const evenings = await db.all(`
        SELECT id, title, starts_at, ends_at, timezone, venue, format, status, capacity, default_price,
          (SELECT COUNT(*) FROM evening_participants p WHERE p.evening_id = e.id AND p.registration_status NOT IN ('cancelled', 'waitlist')) as registered_count
        FROM game_evenings e
        WHERE e.status IN ('published', 'active')
        ORDER BY e.starts_at ASC
      `);

      const publicEvenings = evenings.map((e: any) => ({
        id: e.id,
        title: e.title,
        starts_at: e.starts_at,
        ends_at: e.ends_at,
        venue: e.venue,
        format: e.format,
        status: e.status,
        capacity: e.capacity,
        default_price: e.default_price,
        registered_count: e.registered_count,
        available_spots: Math.max(0, e.capacity - e.registered_count),
      }));

      return res.json(publicEvenings);
    }

    // Organizer View: Full details and revenue aggregates
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

// GET /api/evenings/:id - Get single evening
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = (req as any).db || (await getDb());
    const isOrganizer = req.userRole === 'ORGANIZER';

    const evening = await db.get('SELECT * FROM game_evenings WHERE id = ?', [req.params.id]);
    if (!evening) {
      return res.status(404).json({ error: 'Игровой вечер не найден' });
    }

    if (!isOrganizer) {
      // Public sanitized view
      const registeredCountRow = await db.get(
        `SELECT COUNT(*) as cnt FROM evening_participants WHERE evening_id = ? AND registration_status NOT IN ('cancelled', 'waitlist')`,
        [req.params.id]
      );
      const registered_count = registeredCountRow?.cnt || 0;

      return res.json({
        id: evening.id,
        title: evening.title,
        starts_at: evening.starts_at,
        ends_at: evening.ends_at,
        venue: evening.venue,
        format: evening.format,
        status: evening.status,
        capacity: evening.capacity,
        default_price: evening.default_price,
        registered_count,
        available_spots: Math.max(0, evening.capacity - registered_count),
      });
    }

    // Organizer detailed view
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
    const db = (req as any).db || (await getDb());
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
    const db = (req as any).db || (await getDb());
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

// DELETE /api/evenings/:id - Delete evening (Auth required, completed evenings cannot be deleted)
router.delete('/:id', requireOrganizerAuth, async (req, res) => {
  try {
    const db = (req as any).db || (await getDb());
    const evening = await db.get('SELECT * FROM game_evenings WHERE id = ?', [req.params.id]);
    if (!evening) {
      return res.status(404).json({ error: 'Игровой вечер не найден' });
    }

    if (evening.status === 'completed' || evening.settled_at) {
      return res.status(400).json({
        error: 'Завершённый вечер нельзя удалить',
        message: 'Игровой вечер уже рассчитан и содержит закрытые финансовые операции.',
      });
    }

    await db.run('DELETE FROM game_evenings WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Игровой вечер успешно удален' });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// GET /api/evenings/:id/participants - List participants (Auth required)
router.get('/:id/participants', requireOrganizerAuth, async (req, res) => {
  try {
    const db = (req as any).db || (await getDb());
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

// POST /api/evenings/:id/participants/bulk - Bulk add players (Auth required)
router.post('/:id/participants/bulk', requireOrganizerAuth, async (req, res) => {
  try {
    const { player_ids, registration_status, amount_due } = bulkAddParticipantsSchema.parse(req.body);
    const db = (req as any).db || (await getDb());

    const evening = await db.get('SELECT * FROM game_evenings WHERE id = ?', [req.params.id]);
    if (!evening) {
      return res.status(404).json({ error: 'Игровой вечер не найден' });
    }

    const defaultPrice = amount_due !== undefined ? amount_due : evening.default_price;
    const now = new Date().toISOString();
    let addedCount = 0;
    let skippedCount = 0;
    let waitlistCount = 0;

    const currentRegRow = await db.get(
      `SELECT COUNT(*) as cnt FROM evening_participants WHERE evening_id = ? AND registration_status NOT IN ('cancelled', 'waitlist')`,
      [req.params.id]
    );
    let currentRegCount = currentRegRow?.cnt || 0;

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
          let regStatus = registration_status;
          if (currentRegCount >= evening.capacity && regStatus !== 'cancelled') {
            regStatus = 'waitlist';
            waitlistCount++;
          } else {
            currentRegCount++;
            addedCount++;
          }

          const partId = crypto.randomUUID();
          await db.run(
            `INSERT INTO evening_participants (id, evening_id, player_id, registration_status, attendance_status, arrival_status, payment_status, amount_due, amount_paid, registered_at, confirmed_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              partId,
              req.params.id,
              playerId,
              regStatus,
              'pending',
              'unknown',
              'unpaid',
              defaultPrice,
              0,
              now,
              regStatus === 'confirmed' ? now : null,
              now,
              now,
            ]
          );
        }
      }
      await db.exec('COMMIT');
    } catch (e: any) {
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
      waitlistCount,
      skippedCount,
      participants: updatedParticipants,
    });
  } catch (err: any) {
    res.status(400).json({ error: 'Validation or DB error', details: err.errors || err.message });
  }
});

// PATCH /api/evenings/:id/participants/bulk - Bulk update participant statuses in single transaction (Auth required)
router.patch('/:id/participants/bulk', requireOrganizerAuth, async (req, res) => {
  try {
    const { updates } = req.body; // Array of { id, registration_status, attendance_status, arrival_status, payment_status, amount_due, amount_paid, notes }
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: 'Список обновлений участников пуст или некорректен' });
    }

    const db = (req as any).db || (await getDb());
    const now = new Date().toISOString();

    await db.exec('BEGIN TRANSACTION');
    try {
      for (const item of updates) {
        if (!item.id) continue;

        const fields: string[] = [];
        const values: any[] = [];

        ['registration_status', 'attendance_status', 'arrival_status', 'payment_status', 'amount_due', 'amount_paid', 'notes'].forEach((key) => {
          if (item[key] !== undefined) {
            fields.push(`${key} = ?`);
            values.push(item[key]);
          }
        });

        if (fields.length > 0) {
          fields.push('updated_at = ?');
          values.push(now);
          values.push(item.id);

          await db.run(`UPDATE evening_participants SET ${fields.join(', ')} WHERE id = ? AND evening_id = ?`, [...values, req.params.id]);
        }
      }
      await db.exec('COMMIT');
    } catch (err) {
      try { await db.exec('ROLLBACK'); } catch (_) {}
      throw err;
    }

    const updatedParticipants = await db.all(`
      SELECT ep.*, p.nickname, p.phone, p.telegram_username, p.lifecycle_status, p.elo
      FROM evening_participants ep
      JOIN players p ON ep.player_id = p.id
      WHERE ep.evening_id = ?
    `, [req.params.id]);

    res.json({ success: true, participants: updatedParticipants });
  } catch (err: any) {
    res.status(500).json({ error: 'Database transaction error', message: err.message });
  }
});

// POST /api/evenings/:id/participants - Add single player with capacity check (Auth required)
router.post('/:id/participants', requireOrganizerAuth, async (req, res) => {
  try {
    const data = addSingleParticipantSchema.parse(req.body);
    const db = (req as any).db || (await getDb());

    const evening = await db.get('SELECT * FROM game_evenings WHERE id = ?', [req.params.id]);
    if (!evening) {
      return res.status(404).json({ error: 'Игровой вечер не найден' });
    }

    let playerId = data.player_id;

    // Quick guest creation
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

    // Capacity Check
    const regCountRow = await db.get(
      `SELECT COUNT(*) as cnt FROM evening_participants WHERE evening_id = ? AND registration_status NOT IN ('cancelled', 'waitlist')`,
      [req.params.id]
    );
    const regCount = regCountRow?.cnt || 0;

    let finalRegStatus = data.registration_status;
    if (regCount >= evening.capacity && finalRegStatus !== 'cancelled' && !(req.body as any).force_over_capacity) {
      finalRegStatus = 'waitlist';
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
        finalRegStatus,
        'pending',
        'unknown',
        paymentStatus,
        data.amount_due,
        data.amount_paid,
        data.notes || null,
        now,
        finalRegStatus === 'confirmed' ? now : null,
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

// POST /api/evenings/:id/settle - Safe & Idempotent Evening Settlement (Auth required)
router.post('/:id/settle', requireOrganizerAuth, async (req, res) => {
  try {
    const db = (req as any).db || (await getDb());

    // 1. Fetch evening with lock check
    const evening = await db.get('SELECT * FROM game_evenings WHERE id = ?', [req.params.id]);
    if (!evening) {
      return res.status(404).json({ error: 'Игровой вечер не найден' });
    }

    if (evening.status === 'completed' || evening.settled_at) {
      return res.json({
        success: true,
        alreadySettled: true,
        message: 'Вечер уже был закрыт ранее.',
        evening,
      });
    }

    // 2. Check pending participants
    const pendingParticipants = await db.all(
      `SELECT ep.*, p.nickname FROM evening_participants ep
       JOIN players p ON ep.player_id = p.id
       WHERE ep.evening_id = ? AND ep.attendance_status = 'pending' AND ep.registration_status NOT IN ('cancelled', 'waitlist')`,
      [req.params.id]
    );

    if (pendingParticipants.length > 0) {
      return res.status(409).json({
        error: 'Есть участники с невыясненным статусом явки (pending)',
        pendingParticipants: pendingParticipants.map((p: any) => ({
          id: p.id,
          nickname: p.nickname,
          player_id: p.player_id,
        })),
        message: 'Перед закрытием вечера укажите явку каждого участника (пришёл / не пришёл / отменил).',
      });
    }

    const participants = await db.all('SELECT * FROM evening_participants WHERE evening_id = ?', [req.params.id]);
    const now = new Date().toISOString();

    await db.exec('BEGIN TRANSACTION');
    try {
      // 3. Atomic status update
      await db.run(
        `UPDATE game_evenings SET status = 'completed', settled_at = ?, updated_at = ? WHERE id = ? AND status != 'completed'`,
        [now, now, req.params.id]
      );

      for (const p of participants) {
        // Exclude cancelled and waitlist from financial debt calculation
        if (p.registration_status === 'cancelled' || p.registration_status === 'waitlist' || p.payment_status === 'waived') {
          continue;
        }

        const due = p.amount_due || 0;
        const paid = p.amount_paid || 0;
        const debt = Math.max(0, due - paid);

        // Record income
        if (paid > 0) {
          const txId = crypto.randomUUID();
          await db.run(
            `INSERT INTO financial_transactions (id, type, amount, category, description, player_id, evening_id, source_type, source_id, created_at)
             VALUES (?, 'income', ?, 'Взнос за вечер', ?, ?, ?, 'evening_settle', ?, ?)`,
            [
              txId,
              paid,
              `Оплата за вечер ${evening.title}`,
              p.player_id,
              evening.id,
              p.id,
              now,
            ]
          );
        }

        // Record debt created
        if (debt > 0) {
          const txId = crypto.randomUUID();
          await db.run(
            `INSERT INTO financial_transactions (id, type, amount, category, description, player_id, evening_id, source_type, source_id, created_at)
             VALUES (?, 'debt_created', ?, 'Неоплата за вечер', ?, ?, ?, 'evening_settle', ?, ?)`,
            [
              txId,
              debt,
              `Долг за вечер ${evening.title}`,
              p.player_id,
              evening.id,
              p.id,
              now,
            ]
          );
        }
      }

      await db.exec('COMMIT');
    } catch (e: any) {
      try { await db.exec('ROLLBACK'); } catch (_) {}
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

// POST /api/evenings/:id/adjustments - Financial Adjustment Log after closure (Auth required)
router.post('/:id/adjustments', requireOrganizerAuth, async (req, res) => {
  try {
    const { player_id, amount, type, reason } = req.body; // type: 'income' | 'refund' | 'expense' | 'debt_paid'
    if (!amount || !type || !reason) {
      return res.status(400).json({ error: 'Укажите сумму, тип корректировки (income/refund/expense/debt_paid) и причину' });
    }

    const db = (req as any).db || (await getDb());
    const evening = await db.get('SELECT * FROM game_evenings WHERE id = ?', [req.params.id]);
    if (!evening) {
      return res.status(404).json({ error: 'Игровой вечер не найден' });
    }

    const txId = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.run(
      `INSERT INTO financial_transactions (id, type, amount, category, description, player_id, evening_id, source_type, source_id, created_at)
       VALUES (?, ?, ?, 'Корректировка вечера', ?, ?, ?, 'post_settlement_adjustment', ?, ?)`,
      [
        txId,
        type,
        amount,
        `Корректировка [${evening.title}]: ${reason}`,
        player_id || null,
        evening.id,
        txId,
        now,
      ]
    );

    const createdTx = await db.get('SELECT * FROM financial_transactions WHERE id = ?', [txId]);
    res.status(201).json({
      success: true,
      transaction: createdTx,
      message: 'Корректировка успешно сохранена в финансовом журнале',
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

export default router;
