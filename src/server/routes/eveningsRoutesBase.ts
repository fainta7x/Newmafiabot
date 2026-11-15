import { loadEveningPrices } from '../services/eveningPriceSettingsService.ts';
import { Router } from 'express';
import crypto from 'crypto';
import { getDb } from '../../db/index.ts';
import { normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { requireOrganizerAuth } from '../auth.ts';
import { withdrawAttendanceRewards } from '../services/eveningAttendanceRewardService.ts';

// The evening list, card, create/update, participants and settle live in eveningsRoutes.ts; this file keeps only
// deletion, adjustments and tables (the shadowed legacy copies were removed, domain model audit 2026-10-23).
const router = Router();
const isRegularEvening = (format: unknown) => normalizeEveningFormat(format) === 'CASUAL';

// DELETE /api/evenings/:id - Delete evening (Auth required, completed evenings cannot be deleted)
router.delete('/:id', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db || (await getDb());
    const evening = await db.get('SELECT * FROM game_evenings WHERE id = ?', [String(req.params.id)]);
    if (!evening) {
      return res.status(404).json({ error: 'Игровой вечер не найден' });
    }

    if (evening.status === 'completed' || evening.settled_at) {
      return res.status(400).json({
        error: 'Завершённый вечер нельзя удалить',
        message: 'Игровой вечер уже рассчитан и содержит закрытые финансовые операции.',
      });
    }

    await withdrawAttendanceRewards(db, { eveningId: String(req.params.id) });
    await db.run('DELETE FROM game_evenings WHERE id = ?', [String(req.params.id)]);
    res.json({ success: true, message: 'Игровой вечер успешно удален' });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// POST /api/evenings/:id/adjustments - Financial Adjustment Log after closure (Auth required)
router.post('/:id/adjustments', requireOrganizerAuth, async (req, res) => {
  try {
    const { player_id, amount, type, reason } = req.body; // type: 'income' | 'refund' | 'expense' | 'debt_paid'
    if (!amount || !type || !reason) {
      return res.status(400).json({ error: 'Укажите сумму, тип корректировки (income/refund/expense/debt_paid) и причину' });
    }

    const db = req.db || (await getDb());
    const evening = await db.get('SELECT * FROM game_evenings WHERE id = ?', [String(req.params.id)]);
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

// A table's judge is a linked club player; its name is copied for the screens that only show text.
async function tableHost(db: any, body: any, current: any = {}) {
  if (body.host_player_id === undefined) return { id: current.host_player_id ?? null, name: body.host_name !== undefined ? body.host_name : (current.host_name ?? null) };
  const id = body.host_player_id ? String(body.host_player_id) : null;
  if (!id) return { id: null, name: null };
  const player = await db.get('SELECT id, nickname FROM players WHERE id = ?', [id]);
  if (!player) throw Object.assign(new Error('Судья не найден'), { statusCode: 400 });
  return { id, name: String(player.nickname) };
}

// GET /api/evenings/:id/tables - Get tables of an evening
router.get('/:id/tables', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db || (await getDb());
    const tables = await db.all('SELECT * FROM evening_tables WHERE evening_id = ? ORDER BY sort_order ASC, created_at ASC', [String(req.params.id)]);
    res.json(tables);
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// POST /api/evenings/:id/tables - Create a table for an evening
router.post('/:id/tables', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db || (await getDb());
    const evening = await db.get('SELECT * FROM game_evenings WHERE id = ?', [String(req.params.id)]);
    if (!evening) {
      return res.status(404).json({ error: 'Игровой вечер не найден' });
    }
    if (evening.status === 'completed' || evening.settled_at) {
      return res.status(400).json({ error: 'Запрещено изменять столы завершённых вечеров' });
    }

    const host = await tableHost(db, req.body);
    const tableId = crypto.randomUUID();
    const now = new Date().toISOString();
    // Table price is owned by the parent evening pricing policy. Legacy 400/500/600
    // input must never be persisted for CASUAL/legacy STANDARD evenings.
    const defaultPrice = isRegularEvening(evening.format)
      ? (await loadEveningPrices(db, String(evening.id))).casual_game
      : (req.body.default_price ?? evening.default_price ?? 500);
    await db.run(
      `INSERT INTO evening_tables (id, evening_id, name, format, capacity, host_name, host_player_id, default_price, notes, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tableId,
        String(req.params.id),
        req.body.name || 'Новый стол',
        req.body.format || 'STANDARD',
        req.body.capacity || 10,
        host.name || null,
        host.id,
        defaultPrice,
        req.body.notes || null,
        req.body.sort_order || 0,
        now,
        now,
      ]
    );

    const table = await db.get('SELECT * FROM evening_tables WHERE id = ?', [tableId]);
    res.status(201).json(table);
  } catch (err: any) {
    if (err?.statusCode === 400) return res.status(400).json({ error: err.message });
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// PUT /api/evenings/tables/:tableId - Update a table
router.put('/tables/:tableId', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db || (await getDb());
    const table = await db.get('SELECT * FROM evening_tables WHERE id = ?', [String(req.params.tableId)]);
    if (!table) {
      return res.status(404).json({ error: 'Стол не найден' });
    }

    const evening = await db.get('SELECT * FROM game_evenings WHERE id = ?', [table.evening_id]);
    if (evening?.status === 'completed' || evening?.settled_at) {
      return res.status(400).json({ error: 'Запрещено изменять столы завершённых вечеров' });
    }

    const host = await tableHost(db, req.body, table);
    const now = new Date().toISOString();
    const defaultPrice = isRegularEvening(evening?.format)
      ? (await loadEveningPrices(db, String(evening.id))).casual_game
      : (req.body.default_price !== undefined ? req.body.default_price : table.default_price);
    await db.run(
      `UPDATE evening_tables 
       SET name = ?, format = ?, capacity = ?, host_name = ?, host_player_id = ?, default_price = ?, notes = ?, sort_order = ?, updated_at = ?
       WHERE id = ?`,
      [
        req.body.name !== undefined ? req.body.name : table.name,
        req.body.format !== undefined ? req.body.format : table.format,
        req.body.capacity !== undefined ? req.body.capacity : table.capacity,
        host.name,
        host.id,
        defaultPrice,
        req.body.notes !== undefined ? req.body.notes : table.notes,
        req.body.sort_order !== undefined ? req.body.sort_order : table.sort_order,
        now,
        String(req.params.tableId),
      ]
    );

    const updated = await db.get('SELECT * FROM evening_tables WHERE id = ?', [String(req.params.tableId)]);
    res.json(updated);
  } catch (err: any) {
    if (err?.statusCode === 400) return res.status(400).json({ error: err.message });
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// DELETE /api/evenings/tables/:tableId - Delete a table
router.delete('/tables/:tableId', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db || (await getDb());
    const table = await db.get('SELECT * FROM evening_tables WHERE id = ?', [String(req.params.tableId)]);
    if (!table) {
      return res.status(404).json({ error: 'Стол не найден' });
    }

    const evening = await db.get('SELECT * FROM game_evenings WHERE id = ?', [table.evening_id]);
    if (evening?.status === 'completed' || evening?.settled_at) {
      return res.status(400).json({ error: 'Запрещено изменять столы завершённых вечеров' });
    }

    // The first table is the evening's own table with the evening judge (owner, 2026-11-15); seating needs it.
    const primary = await db.get('SELECT id FROM evening_tables WHERE evening_id = ? ORDER BY sort_order ASC, created_at ASC LIMIT 1', [table.evening_id]);
    if (primary && String(primary.id) === String(table.id)) {
      return res.status(400).json({ error: 'Основной стол вечера удалить нельзя' });
    }

    // Set all players currently assigned to this table to "Стол не назначен" (table_id = NULL)
    await db.run('UPDATE evening_participants SET table_id = NULL WHERE table_id = ?', [String(req.params.tableId)]);

    // Delete table
    await db.run('DELETE FROM evening_tables WHERE id = ?', [String(req.params.tableId)]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

export default router;
