import { Router } from 'express';
import crypto from 'crypto';
import { getDb } from '../../db/index.ts';
import { requireOrganizerAuth } from '../auth.ts';
import { createTaskSchema, updateTaskSchema } from '../validation.ts';

const router = Router();

// GET /api/tasks - List tasks with CRM filters
router.get('/', async (req, res) => {
  try {
    const { today, overdue, player_id, evening_id, status } = req.query;
    const db = await getDb();

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

    query += ` ORDER BY t.due_at ASC, t.created_at DESC`;

    const tasks = await db.all(query, params);
    const nowIso = new Date().toISOString().slice(0, 10);

    const filtered = tasks.filter((t) => {
      if (today === 'true' || today === '1') {
        if (!t.due_at || !t.due_at.startsWith(nowIso)) return false;
      }

      if (overdue === 'true' || overdue === '1') {
        if (!t.due_at || t.due_at >= nowIso || t.status === 'done' || t.status === 'cancelled') return false;
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
    const db = await getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.run(
      `INSERT INTO organizer_tasks (id, title, description, type, status, priority, due_at, completed_at, player_id, evening_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.title,
        data.description || null,
        data.type,
        data.status,
        data.priority,
        data.due_at || null,
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

// PATCH /api/tasks/:id - Update task (Auth required)
router.patch('/:id', requireOrganizerAuth, async (req, res) => {
  try {
    const data = updateTaskSchema.parse(req.body);
    const db = await getDb();

    const task = await db.get('SELECT * FROM organizer_tasks WHERE id = ?', [req.params.id]);
    if (!task) {
      return res.status(404).json({ error: 'Задача не найдена' });
    }

    const fields: string[] = [];
    const values: any[] = [];

    const now = new Date().toISOString();
    let completedAt = (data.status as any) === 'done' ? now : data.status && (data.status as any) !== 'done' ? null : task.completed_at;

    const updateData = {
      ...data,
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
    const db = await getDb();
    await db.run('DELETE FROM organizer_tasks WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Задача удалена' });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

export default router;
