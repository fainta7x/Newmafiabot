import { Router, Response } from 'express';
import crypto from 'crypto';
import { getDb } from '../../db/index.ts';
import { requireOrganizerAuth, AuthenticatedRequest } from '../auth.ts';
import { runCrmAutomations } from '../services/crmAutomationService.ts';
import {
  createEveningSchema,
  updateEveningSchema,
  bulkAddParticipantsSchema,
  addSingleParticipantSchema,
} from '../validation.ts';

const router = Router();

// POST /api/evenings/create-next-friday - Quick action to create next Friday evening with 2 tables
router.post('/create-next-friday', requireOrganizerAuth, async (req, res) => {
  try {
    const db = (req as any).db || (await getDb());
    const now = new Date();

    let dayOffset = (5 - now.getDay() + 7) % 7;
    if (dayOffset === 0) {
      if (now.getHours() >= 20) {
        dayOffset = 7;
      }
    }
    const nextFriday = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const day = nextFriday.getDate();
    const monthsRu = [
      'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
    ];
    const monthName = monthsRu[nextFriday.getMonth()];

    const yearStr = nextFriday.getFullYear();
    const monthStr = String(nextFriday.getMonth() + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const startsAtIso = `${yearStr}-${monthStr}-${dayStr}T20:00:00+03:00`;
    const title = `Игровой вечер — ${day} ${monthName}`;

    const lastEvening = await db.get('SELECT default_price FROM game_evenings ORDER BY starts_at DESC LIMIT 1');
    const defaultPrice = lastEvening?.default_price || 500;

    const eveningId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    await db.run(
      `INSERT INTO game_evenings (id, title, starts_at, timezone, venue, format, status, capacity, default_price, created_at, updated_at)
       VALUES (?, ?, ?, 'Europe/Moscow', 'Суп с Котом', 'STANDARD', 'draft', 20, ?, ?, ?)`,
      [eveningId, title, startsAtIso, defaultPrice, nowIso, nowIso]
    );

    const table1Id = `tbl_${Date.now()}_1`;
    const table2Id = `tbl_${Date.now()}_2`;

    await db.run(
      `INSERT INTO evening_tables (id, evening_id, name, format, capacity, sort_order, created_at, updated_at)
       VALUES (?, ?, 'Основной стол', 'STANDARD', 10, 1, ?, ?),
              (?, ?, 'Стол новичков', 'NOVICE', 10, 2, ?, ?)`,
      [table1Id, eveningId, nowIso, nowIso, table2Id, eveningId, nowIso, nowIso]
    );

    const evening = await db.get('SELECT * FROM game_evenings WHERE id = ?', [eveningId]);
    const tables = await db.all('SELECT * FROM evening_tables WHERE evening_id = ? ORDER BY sort_order ASC', [eveningId]);

    res.status(201).json({ ...evening, tables });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// POST /api/evenings/duplicate-last - Duplicate previous evening and its tables
router.post('/duplicate-last', requireOrganizerAuth, async (req, res) => {
  try {
    const db = (req as any).db || (await getDb());
    const lastEvening = await db.get('SELECT * FROM game_evenings ORDER BY starts_at DESC LIMIT 1');
    if (!lastEvening) {
      return res.status(404).json({ error: 'Предыдущий вечер не найден' });
    }

    const lastTables = await db.all('SELECT * FROM evening_tables WHERE evening_id = ? ORDER BY sort_order ASC', [lastEvening.id]);

    const newEveningId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const title = `${lastEvening.title} (копия)`;

    await db.run(
      `INSERT INTO game_evenings (id, title, starts_at, timezone, venue, format, status, capacity, default_price, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`,
      [
        newEveningId,
        title,
        lastEvening.starts_at,
        lastEvening.timezone || 'Europe/Moscow',
        lastEvening.venue || 'Суп с Котом',
        lastEvening.format || 'STANDARD',
        lastEvening.capacity || 20,
        lastEvening.default_price || 500,
        lastEvening.notes || null,
        nowIso,
        nowIso,
      ]
    );

    const newTables = [];
    for (const t of lastTables) {
      const newTblId = `tbl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      await db.run(
        `INSERT INTO evening_tables (id, evening_id, name, format, capacity, host_name, default_price, notes, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [newTblId, newEveningId, t.name, t.format, t.capacity, t.host_name, t.default_price, t.notes, t.sort_order, nowIso, nowIso]
      );
      newTables.push(await db.get('SELECT * FROM evening_tables WHERE id = ?', [newTblId]));
    }

    const evening = await db.get('SELECT * FROM game_evenings WHERE id = ?', [newEveningId]);
    res.status(201).json({ ...evening, tables: newTables });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// Table CRUD static helper endpoints
router.put('/tables/:tableId', requireOrganizerAuth, async (req, res) => {
  try {
    const db = (req as any).db || (await getDb());
    const { name, format, capacity, host_name, starts_at, default_price, notes } = req.body;
    const nowIso = new Date().toISOString();

    await db.run(
      `UPDATE evening_tables
       SET name = COALESCE(?, name),
           format = COALESCE(?, format),
           capacity = COALESCE(?, capacity),
           host_name = ?,
           starts_at = ?,
           default_price = ?,
           notes = ?,
           updated_at = ?
       WHERE id = ?`,
      [name, format, capacity, host_name || null, starts_at || null, default_price || null, notes || null, nowIso, req.params.tableId]
    );

    const updated = await db.get('SELECT * FROM evening_tables WHERE id = ?', [req.params.tableId]);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

router.delete('/tables/:tableId', requireOrganizerAuth, async (req, res) => {
  try {
    const db = (req as any).db || (await getDb());
    await db.run('UPDATE evening_participants SET table_id = NULL WHERE table_id = ?', [req.params.tableId]);
    await db.run('DELETE FROM evening_tables WHERE id = ?', [req.params.tableId]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

router.patch('/participants/:participantId/move-table', requireOrganizerAuth, async (req, res) => {
  try {
    const db = (req as any).db || (await getDb());
    const { table_id } = req.body;
    const participantId = req.params.participantId;

    const participant = await db.get('SELECT * FROM evening_participants WHERE id = ?', [participantId]);
    if (!participant) {
      return res.status(404).json({ error: 'Участник не найден' });
    }

    let targetRegStatus = participant.registration_status;

    if (table_id) {
      const targetTable = await db.get('SELECT * FROM evening_tables WHERE id = ?', [table_id]);
      if (targetTable) {
        const countRow = await db.get(
          `SELECT COUNT(*) as cnt FROM evening_participants WHERE table_id = ? AND id != ? AND registration_status NOT IN ('cancelled', 'waitlist')`,
          [table_id, participantId]
        );
        if ((countRow?.cnt || 0) >= targetTable.capacity && targetRegStatus !== 'cancelled') {
          targetRegStatus = 'waitlist';
        } else if (targetRegStatus === 'waitlist') {
          targetRegStatus = 'registered';
        }
      }
    }

    const nowIso = new Date().toISOString();
    await db.run(
      'UPDATE evening_participants SET table_id = ?, registration_status = ?, updated_at = ? WHERE id = ?',
      [table_id || null, targetRegStatus, nowIso, participantId]
    );

    const updated = await db.get(`
      SELECT ep.*, p.nickname, p.phone, p.telegram_username, p.lifecycle_status, p.elo
      FROM evening_participants ep
      JOIN players p ON ep.player_id = p.id
      WHERE ep.id = ?
    `, [participantId]);

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

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
    let tables = await db.all('SELECT * FROM evening_tables WHERE evening_id = ? ORDER BY sort_order ASC, created_at ASC', [req.params.id]);
    if (tables.length === 0) {
      const nowIso = new Date().toISOString();
      const defaultTableId = `tbl_${Date.now()}_def`;
      await db.run(
        `INSERT INTO evening_tables (id, evening_id, name, format, capacity, sort_order, created_at, updated_at)
         VALUES (?, ?, 'Основной стол', ?, ?, 1, ?, ?)`,
        [defaultTableId, evening.id, evening.format || 'STANDARD', evening.capacity || 10, nowIso, nowIso]
      );
      tables = await db.all('SELECT * FROM evening_tables WHERE evening_id = ? ORDER BY sort_order ASC', [req.params.id]);
    }

    const participants = await db.all(`
      SELECT ep.*, p.nickname, p.phone, p.telegram_username, p.lifecycle_status, p.elo
      FROM evening_participants ep
      JOIN players p ON ep.player_id = p.id
      WHERE ep.evening_id = ?
      ORDER BY ep.created_at ASC
    `, [req.params.id]);

    const games = await db.all('SELECT * FROM games WHERE evening_id = ? ORDER BY global_game_number ASC', [req.params.id]);

    res.json({ ...evening, tables, participants, games });
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
    const { player_ids, table_id, registration_status, amount_due } = bulkAddParticipantsSchema.parse(req.body);
    const db = (req as any).db || (await getDb());

    const evening = await db.get('SELECT * FROM game_evenings WHERE id = ?', [req.params.id]);
    if (!evening) {
      return res.status(404).json({ error: 'Игровой вечер не найден' });
    }

    if (evening.status === 'completed') {
      return res.status(400).json({ error: 'Запрещено добавлять игроков в завершённые вечера' });
    }

    const defaultPrice = amount_due !== undefined ? amount_due : evening.default_price;
    const now = new Date().toISOString();
    let addedCount = 0;
    let skippedCount = 0;
    let waitlistCount = 0;

    // Table capacity check preparation
    let currentRegCount = 0;
    let table: any = null;
    if (table_id) {
      table = await db.get('SELECT * FROM evening_tables WHERE id = ? AND evening_id = ?', [table_id, req.params.id]);
      if (!table) {
        return res.status(404).json({ error: 'Игровой стол не найден на этом вечере' });
      }
      const countRow = await db.get(
        `SELECT COUNT(*) as cnt FROM evening_participants WHERE table_id = ? AND registration_status NOT IN ('cancelled', 'waitlist')`,
        [table_id]
      );
      currentRegCount = countRow?.cnt || 0;
    } else {
      const currentRegRow = await db.get(
        `SELECT COUNT(*) as cnt FROM evening_participants WHERE evening_id = ? AND registration_status NOT IN ('cancelled', 'waitlist')`,
        [req.params.id]
      );
      currentRegCount = currentRegRow?.cnt || 0;
    }

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
          const limit = table ? table.capacity : evening.capacity;
          if (currentRegCount >= limit && regStatus !== 'cancelled') {
            regStatus = 'waitlist';
            waitlistCount++;
          } else {
            currentRegCount++;
            addedCount++;
          }

          const partId = crypto.randomUUID();
          await db.run(
            `INSERT INTO evening_participants (id, evening_id, player_id, table_id, registration_status, attendance_status, arrival_status, payment_status, amount_due, amount_paid, registered_at, confirmed_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              partId,
              req.params.id,
              playerId,
              table_id || null,
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

    // Run CRM automations
    await runCrmAutomations(db);

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
    const { updates } = req.body; // Array of { id, table_id, registration_status, attendance_status, arrival_status, payment_status, amount_due, amount_paid, notes }
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: 'Список обновлений участников пуст или некорректен' });
    }

    const db = (req as any).db || (await getDb());
    const evening = await db.get('SELECT * FROM game_evenings WHERE id = ?', [req.params.id]);
    if (!evening) {
      return res.status(404).json({ error: 'Игровой вечер не найден' });
    }

    if (evening.status === 'completed') {
      return res.status(400).json({ error: 'Запрещено изменять столы или статусы участников на завершённых вечерах' });
    }

    const now = new Date().toISOString();

    await db.exec('BEGIN TRANSACTION');
    try {
      for (const item of updates) {
        if (!item.id) continue;

        const fields: string[] = [];
        const values: any[] = [];

        ['table_id', 'registration_status', 'attendance_status', 'arrival_status', 'payment_status', 'amount_due', 'amount_paid', 'notes'].forEach((key) => {
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

    // Run CRM automations
    await runCrmAutomations(db);

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

    if (evening.status === 'completed') {
      return res.status(400).json({ error: 'Запрещено записывать игроков на завершённые вечера' });
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
          [playerId, data.nickname, data.phone || null, 'normal', 'quick_guest', now, now]
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
    let finalRegStatus = data.registration_status;
    if (data.table_id) {
      const table = await db.get('SELECT * FROM evening_tables WHERE id = ? AND evening_id = ?', [data.table_id, req.params.id]);
      if (!table) {
        return res.status(404).json({ error: 'Игровой стол не найден на этом вечере' });
      }
      const countRow = await db.get(
        `SELECT COUNT(*) as cnt FROM evening_participants WHERE table_id = ? AND registration_status NOT IN ('cancelled', 'waitlist')`,
        [data.table_id]
      );
      const currentCount = countRow?.cnt || 0;
      if (currentCount >= table.capacity && finalRegStatus !== 'cancelled' && !(req.body as any).force_over_capacity) {
        finalRegStatus = 'waitlist';
      }
    } else {
      const regCountRow = await db.get(
        `SELECT COUNT(*) as cnt FROM evening_participants WHERE evening_id = ? AND registration_status NOT IN ('cancelled', 'waitlist')`,
        [req.params.id]
      );
      const regCount = regCountRow?.cnt || 0;
      if (regCount >= evening.capacity && finalRegStatus !== 'cancelled' && !(req.body as any).force_over_capacity) {
        finalRegStatus = 'waitlist';
      }
    }

    const partId = crypto.randomUUID();
    const now = new Date().toISOString();
    const paymentStatus = data.amount_paid >= data.amount_due ? 'paid' : data.amount_paid > 0 ? 'partial' : 'unpaid';

    await db.run(
      `INSERT INTO evening_participants (id, evening_id, player_id, table_id, registration_status, attendance_status, arrival_status, payment_status, amount_due, amount_paid, notes, registered_at, confirmed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        partId,
        req.params.id,
        playerId,
        data.table_id || null,
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

    // Run CRM automations
    await runCrmAutomations(db);

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

    // Run CRM automations after closing the evening
    await runCrmAutomations(db);

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

// GET /api/evenings/:id/tables - Get tables of an evening
router.get('/:id/tables', requireOrganizerAuth, async (req, res) => {
  try {
    const db = (req as any).db || (await getDb());
    const tables = await db.all('SELECT * FROM evening_tables WHERE evening_id = ? ORDER BY sort_order ASC, created_at ASC', [req.params.id]);
    res.json(tables);
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// POST /api/evenings/:id/tables - Create a table for an evening
router.post('/:id/tables', requireOrganizerAuth, async (req, res) => {
  try {
    const db = (req as any).db || (await getDb());
    const evening = await db.get('SELECT * FROM game_evenings WHERE id = ?', [req.params.id]);
    if (!evening) {
      return res.status(404).json({ error: 'Игровой вечер не найден' });
    }
    if (evening.status === 'completed') {
      return res.status(400).json({ error: 'Запрещено изменять столы завершённых вечеров' });
    }

    const tableId = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO evening_tables (id, evening_id, name, format, capacity, host_name, default_price, notes, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tableId,
        req.params.id,
        req.body.name || 'Новый стол',
        req.body.format || 'STANDARD',
        req.body.capacity || 10,
        req.body.host_name || null,
        req.body.default_price || evening.default_price || 500,
        req.body.notes || null,
        req.body.sort_order || 0,
        now,
        now,
      ]
    );

    const table = await db.get('SELECT * FROM evening_tables WHERE id = ?', [tableId]);
    res.status(201).json(table);
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// PUT /api/evenings/tables/:tableId - Update a table
router.put('/tables/:tableId', requireOrganizerAuth, async (req, res) => {
  try {
    const db = (req as any).db || (await getDb());
    const table = await db.get('SELECT * FROM evening_tables WHERE id = ?', [req.params.tableId]);
    if (!table) {
      return res.status(404).json({ error: 'Стол не найден' });
    }

    const evening = await db.get('SELECT * FROM game_evenings WHERE id = ?', [table.evening_id]);
    if (evening?.status === 'completed') {
      return res.status(400).json({ error: 'Запрещено изменять столы завершённых вечеров' });
    }

    const now = new Date().toISOString();
    await db.run(
      `UPDATE evening_tables 
       SET name = ?, format = ?, capacity = ?, host_name = ?, default_price = ?, notes = ?, sort_order = ?, updated_at = ?
       WHERE id = ?`,
      [
        req.body.name !== undefined ? req.body.name : table.name,
        req.body.format !== undefined ? req.body.format : table.format,
        req.body.capacity !== undefined ? req.body.capacity : table.capacity,
        req.body.host_name !== undefined ? req.body.host_name : table.host_name,
        req.body.default_price !== undefined ? req.body.default_price : table.default_price,
        req.body.notes !== undefined ? req.body.notes : table.notes,
        req.body.sort_order !== undefined ? req.body.sort_order : table.sort_order,
        now,
        req.params.tableId,
      ]
    );

    const updated = await db.get('SELECT * FROM evening_tables WHERE id = ?', [req.params.tableId]);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// DELETE /api/evenings/tables/:tableId - Delete a table
router.delete('/tables/:tableId', requireOrganizerAuth, async (req, res) => {
  try {
    const db = (req as any).db || (await getDb());
    const table = await db.get('SELECT * FROM evening_tables WHERE id = ?', [req.params.tableId]);
    if (!table) {
      return res.status(404).json({ error: 'Стол не найден' });
    }

    const evening = await db.get('SELECT * FROM game_evenings WHERE id = ?', [table.evening_id]);
    if (evening?.status === 'completed') {
      return res.status(400).json({ error: 'Запрещено изменять столы завершённых вечеров' });
    }

    // Set all players currently assigned to this table to "Стол не назначен" (table_id = NULL)
    await db.run('UPDATE evening_participants SET table_id = NULL WHERE table_id = ?', [req.params.tableId]);

    // Delete table
    await db.run('DELETE FROM evening_tables WHERE id = ?', [req.params.tableId]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// PATCH /api/evenings/participants/:participantId/move-table - Move participant to another table
router.patch('/participants/:participantId/move-table', requireOrganizerAuth, async (req, res) => {
  try {
    const db = (req as any).db || (await getDb());
    const participant = await db.get('SELECT * FROM evening_participants WHERE id = ?', [req.params.participantId]);
    if (!participant) {
      return res.status(404).json({ error: 'Участник не найден' });
    }

    const evening = await db.get('SELECT * FROM game_evenings WHERE id = ?', [participant.evening_id]);
    if (evening?.status === 'completed') {
      return res.status(400).json({ error: 'Запрещено изменять столы завершённых вечеров' });
    }

    const { table_id } = req.body;
    let targetRegStatus = participant.registration_status;

    if (table_id) {
      const table = await db.get('SELECT * FROM evening_tables WHERE id = ?', [table_id]);
      if (!table) {
        return res.status(404).json({ error: 'Стол не найден' });
      }
      if (table.evening_id !== participant.evening_id) {
        return res.status(400).json({ error: 'Стол принадлежит другому вечеру' });
      }

      // Capacity check
      const countRow = await db.get(
        `SELECT COUNT(*) as cnt FROM evening_participants WHERE table_id = ? AND registration_status NOT IN ('cancelled', 'waitlist') AND id != ?`,
        [table_id, req.params.participantId]
      );
      const currentCount = countRow?.cnt || 0;
      if (currentCount >= table.capacity && targetRegStatus !== 'cancelled') {
        targetRegStatus = 'waitlist';
      } else if (targetRegStatus === 'waitlist') {
        // Move from waitlist to registered since there's room on the new table
        targetRegStatus = 'registered';
      }
    }

    const now = new Date().toISOString();
    await db.run(
      `UPDATE evening_participants 
       SET table_id = ?, registration_status = ?, updated_at = ? 
       WHERE id = ?`,
      [table_id || null, targetRegStatus, now, req.params.participantId]
    );

    // Run CRM automations
    await runCrmAutomations(db);

    const updated = await db.get(`
      SELECT ep.*, p.nickname, p.phone, p.telegram_username, p.lifecycle_status, p.elo
      FROM evening_participants ep
      JOIN players p ON ep.player_id = p.id
      WHERE ep.id = ?
    `, [req.params.participantId]);

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

export default router;
