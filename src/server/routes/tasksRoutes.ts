import { Router } from 'express';
import crypto from 'crypto';
import { getDb } from '../../db/index.ts';
import { requireOrganizerAuth } from '../auth.ts';
import { createTaskSchema, updateTaskSchema } from '../validation.ts';

const router = Router();

// GET /api/tasks - List tasks with CRM filters (Auth required)
router.get('/', requireOrganizerAuth, async (req, res) => {
  try {
    const { today, overdue, active, player_id, evening_id, status } = req.query;
    const db = (req as any).db || (await getDb());

    let query = `
      SELECT t.*, p.nickname as player_nickname, e.title as evening_title
      FROM organizer_tasks t
      LEFT JOIN players p ON t.player_id = p.id
      LEFT JOIN game_evenings e ON t.evening_id = e.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (player_id) {
      query += ` AND t.player_id = ?`;
      params.push(player_id);
    }

    if (evening_id) {
      query += ` AND t.evening_id = ?`;
      params.push(evening_id);
    }

    if (status) {
      query += ` AND t.status = ?`;
      params.push(status);
    }

    if (active === 'true' || active === '1') {
      query += ` AND t.status NOT IN ('done', 'cancelled')`;
    }

    query += ` ORDER BY CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END, t.due_at ASC, t.created_at DESC`;

    const tasks = await db.all(query, params);
    const nowMs = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const filtered = tasks.filter((t: any) => {
      if (today === 'true' || today === '1') {
        if (t.status === 'done' || t.status === 'cancelled' || !t.due_at) return false;
        const dueMs = new Date(t.due_at).getTime();
        if (isNaN(dueMs) || dueMs < todayStart.getTime() || dueMs > todayEnd.getTime()) return false;
      }

      if (overdue === 'true' || overdue === '1') {
        if (!t.due_at) return false;
        const dueMs = new Date(t.due_at).getTime();
        if (isNaN(dueMs) || dueMs >= nowMs || t.status === 'done' || t.status === 'cancelled') return false;
      }

      return true;
    });

    res.json(filtered);
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// POST /api/tasks - Create task (Auth required)
router.post('/', requireOrganizerAuth, async (req, res) => {
  try {
    const data = createTaskSchema.parse(req.body);
    const db = (req as any).db || (await getDb());
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const dueAt = data.due_at && data.due_at.trim() !== '' ? new Date(data.due_at).toISOString() : null;

    await db.run(
      `INSERT INTO organizer_tasks (id, title, description, type, status, priority, due_at, completed_at, player_id, evening_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.title,
        data.description || null,
        data.type || 'other',
        data.status || 'todo',
        data.priority || 'medium',
        dueAt,
        data.status === 'done' ? now : null,
        data.player_id || null,
        data.evening_id || null,
        now,
        now,
      ]
    );

    const created = await db.get(`
      SELECT t.*, p.nickname as player_nickname, e.title as evening_title
      FROM organizer_tasks t
      LEFT JOIN players p ON t.player_id = p.id
      LEFT JOIN game_evenings e ON t.evening_id = e.id
      WHERE t.id = ?
    `, [id]);

    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: 'Validation error', details: err.errors || err.message });
  }
});

// POST /api/tasks/:id/complete - Quick complete task (Auth required)
router.post('/:id/complete', requireOrganizerAuth, async (req, res) => {
  try {
    const db = (req as any).db || (await getDb());
    const now = new Date().toISOString();

    await db.run(
      'UPDATE organizer_tasks SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?',
      ['done', now, now, req.params.id]
    );

    const updated = await db.get(`
      SELECT t.*, p.nickname as player_nickname, e.title as evening_title
      FROM organizer_tasks t
      LEFT JOIN players p ON t.player_id = p.id
      LEFT JOIN game_evenings e ON t.evening_id = e.id
      WHERE t.id = ?
    `, [req.params.id]);

    if (!updated) {
      return res.status(404).json({ error: 'Задача не найдена' });
    }

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// PATCH /api/tasks/:id - Update task (Auth required)
router.patch('/:id', requireOrganizerAuth, async (req, res) => {
  try {
    const data = updateTaskSchema.parse(req.body);
    const db = (req as any).db || (await getDb());

    const task = await db.get('SELECT * FROM organizer_tasks WHERE id = ?', [req.params.id]);
    if (!task) {
      return res.status(404).json({ error: 'Задача не найдена' });
    }

    const fields: string[] = [];
    const values: any[] = [];

    const now = new Date().toISOString();
    let completedAt = data.status === 'done' ? now : data.status ? null : task.completed_at;

    let dueAt = task.due_at;
    if (data.due_at !== undefined) {
      dueAt = data.due_at && data.due_at.trim() !== '' ? new Date(data.due_at).toISOString() : null;
    }

    const updateData: any = {
      ...data,
      due_at: dueAt,
      completed_at: completedAt,
      updated_at: now,
    };

    Object.entries(updateData).forEach(([key, val]) => {
      if (val !== undefined) {
        fields.push(`${key} = ?`);
        values.push(val);
      }
    });

    values.push(req.params.id);
    await db.run(`UPDATE organizer_tasks SET ${fields.join(', ')} WHERE id = ?`, values);

    const updated = await db.get(`
      SELECT t.*, p.nickname as player_nickname, e.title as evening_title
      FROM organizer_tasks t
      LEFT JOIN players p ON t.player_id = p.id
      LEFT JOIN game_evenings e ON t.evening_id = e.id
      WHERE t.id = ?
    `, [req.params.id]);

    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: 'Validation error', details: err.errors || err.message });
  }
});

// DELETE /api/tasks/:id - Delete task (Auth required)
router.delete('/:id', requireOrganizerAuth, async (req, res) => {
  try {
    const db = (req as any).db || (await getDb());
    await db.run('DELETE FROM organizer_tasks WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Задача удалена' });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

export default router;
