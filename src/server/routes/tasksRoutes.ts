import { Router } from 'express';
import crypto from 'crypto';
import { getDb } from '../../db/index.ts';
import { requireOrganizerAuth } from '../auth.ts';
import { createTaskSchema, updateTaskSchema } from '../validation.ts';

const router = Router();

type EveningTaskStage = 'preparation' | 'during' | 'after';
const EVENING_TASK_TEMPLATES: Array<{ id: string; title: string; description: string; stage: EveningTaskStage; type: string; priority: string }> = [
  { id: 'photo', title: 'Сделать фото вечера', description: 'Снять живой кадр клуба во время вечера.', stage: 'during', type: 'other', priority: 'medium' },
  { id: 'group-photo', title: 'Сделать общее фото', description: 'Не забыть общее фото участников, когда большинство уже в клубе.', stage: 'during', type: 'other', priority: 'medium' },
  { id: 'important-moment', title: 'Зафиксировать важный момент', description: 'Отметить событие вечера, которое стоит сохранить в клубной истории или рассказать позже.', stage: 'during', type: 'other', priority: 'medium' },
  { id: 'announcement', title: 'Сделать объявление игрокам', description: 'Рассказать участникам важную организационную информацию.', stage: 'during', type: 'reminder', priority: 'high' },
  { id: 'next-evening', title: 'Напомнить о следующем вечере', description: 'Перед завершением напомнить участникам о следующей дате клуба.', stage: 'after', type: 'reminder', priority: 'medium' },
  { id: 'wrapup-note', title: 'Записать итог организатора', description: 'Коротко зафиксировать, что прошло хорошо и что нужно поправить к следующему вечеру.', stage: 'after', type: 'feedback', priority: 'medium' },
];

const taskDueAtForStage = (evening: any, stage: EveningTaskStage) => {
  const startMs = new Date(String(evening.starts_at || '')).getTime();
  const endMs = evening.ends_at ? new Date(String(evening.ends_at)).getTime() : Number.NaN;
  if (!Number.isFinite(startMs)) return null;
  if (stage === 'preparation') return new Date(Math.max(Date.now(), startMs - 60 * 60 * 1000)).toISOString();
  if (stage === 'during') return new Date(Math.max(Date.now(), startMs)).toISOString();
  return new Date(Number.isFinite(endMs) ? endMs : startMs + 5 * 60 * 60 * 1000).toISOString();
};

const loadTask = (db: any, id: string) => db.get(`
  SELECT t.*, p.nickname as player_nickname, e.title as evening_title
  FROM organizer_tasks t
  LEFT JOIN players p ON t.player_id = p.id
  LEFT JOIN game_evenings e ON t.evening_id = e.id
  WHERE t.id = ?
`, [id]);

// GET /api/tasks - List tasks with CRM filters (Auth required)
router.get('/', requireOrganizerAuth, async (req, res) => {
  try {
    const { today, overdue, active, player_id, evening_id, status } = req.query;
    const db = req.db || (await getDb());

    let query = `
      SELECT t.*, p.nickname as player_nickname, e.title as evening_title
      FROM organizer_tasks t
      LEFT JOIN players p ON t.player_id = p.id
      LEFT JOIN game_evenings e ON t.evening_id = e.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (player_id) { query += ` AND t.player_id = ?`; params.push(player_id); }
    if (evening_id) { query += ` AND t.evening_id = ?`; params.push(evening_id); }
    if (status) { query += ` AND t.status = ?`; params.push(status); }
    if (active === 'true' || active === '1') query += ` AND t.status NOT IN ('done', 'cancelled')`;
    query += ` ORDER BY CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END, t.due_at ASC, t.created_at DESC`;

    const tasks = await db.all(query, params);
    const nowMs = Date.now();
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
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

router.get('/evening-templates', requireOrganizerAuth, (_req, res) => {
  res.json({ templates: EVENING_TASK_TEMPLATES });
});

router.post('/evening-template', requireOrganizerAuth, async (req, res) => {
  try {
    const eveningId = String(req.body?.evening_id || '').trim();
    const templateId = String(req.body?.template_id || '').trim();
    const template = EVENING_TASK_TEMPLATES.find((item) => item.id === templateId);
    if (!eveningId || !template) return res.status(400).json({ error: 'Некорректный шаблон задачи вечера' });
    const db = req.db || (await getDb());
    const evening = await db.get('SELECT id,title,starts_at,ends_at,status FROM game_evenings WHERE id=? LIMIT 1', [eveningId]);
    if (!evening) return res.status(404).json({ error: 'Вечер не найден' });
    const automationKey = `evening-template:${template.stage}:${eveningId}:${template.id}`;
    const existing = await db.get('SELECT id FROM organizer_tasks WHERE automation_key=? LIMIT 1', [automationKey]);
    if (existing) return res.json(await loadTask(db, String(existing.id)));
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO organizer_tasks (id,title,description,type,status,priority,due_at,completed_at,automation_key,player_id,evening_id,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, template.title, template.description, template.type, 'todo', template.priority, taskDueAtForStage(evening, template.stage), null, automationKey, null, eveningId, now, now],
    );
    return res.status(201).json(await loadTask(db, id));
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Не удалось добавить шаблонную задачу' });
  }
});

router.post('/evening-manual', requireOrganizerAuth, async (req, res) => {
  try {
    const eveningId = String(req.body?.evening_id || '').trim();
    const title = String(req.body?.title || '').trim().replace(/\s+/g, ' ').slice(0, 180);
    const description = String(req.body?.description || '').trim().slice(0, 1000) || null;
    const stage = String(req.body?.stage || 'during') as EveningTaskStage;
    if (!eveningId || !title || !['preparation', 'during', 'after'].includes(stage)) return res.status(400).json({ error: 'Заполни название и этап задачи' });
    const db = req.db || (await getDb());
    const evening = await db.get('SELECT id,title,starts_at,ends_at,status FROM game_evenings WHERE id=? LIMIT 1', [eveningId]);
    if (!evening) return res.status(404).json({ error: 'Вечер не найден' });
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const automationKey = `evening-manual:${stage}:${eveningId}:${id}`;
    await db.run(
      `INSERT INTO organizer_tasks (id,title,description,type,status,priority,due_at,completed_at,automation_key,player_id,evening_id,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, title, description, 'other', 'todo', 'medium', taskDueAtForStage(evening, stage), null, automationKey, null, eveningId, now, now],
    );
    return res.status(201).json(await loadTask(db, id));
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Не удалось создать задачу вечера' });
  }
});

// POST /api/tasks - Create task (Auth required)
router.post('/', requireOrganizerAuth, async (req, res) => {
  try {
    const data = createTaskSchema.parse(req.body);
    const db = req.db || (await getDb());
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const dueAt = data.due_at && data.due_at.trim() !== '' ? new Date(data.due_at).toISOString() : null;
    await db.run(
      `INSERT INTO organizer_tasks (id, title, description, type, status, priority, due_at, completed_at, player_id, evening_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, data.title, data.description || null, data.type || 'other', data.status || 'todo', data.priority || 'medium', dueAt, data.status === 'done' ? now : null, data.player_id || null, data.evening_id || null, now, now]
    );
    res.status(201).json(await loadTask(db, id));
  } catch (err: any) {
    res.status(400).json({ error: 'Validation error', details: err.errors || err.message });
  }
});

router.post('/:id/complete', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db || (await getDb());
    const now = new Date().toISOString();
    await db.run('UPDATE organizer_tasks SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?', ['done', now, now, req.params.id]);
    const updated = await loadTask(db, req.params.id);
    if (!updated) return res.status(404).json({ error: 'Задача не найдена' });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

router.patch('/:id', requireOrganizerAuth, async (req, res) => {
  try {
    const data = updateTaskSchema.parse(req.body);
    const db = req.db || (await getDb());
    const task = await db.get('SELECT * FROM organizer_tasks WHERE id = ?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Задача не найдена' });
    const fields: string[] = [];
    const values: any[] = [];
    const now = new Date().toISOString();
    const completedAt = data.status === 'done' ? now : data.status ? null : task.completed_at;
    let dueAt = task.due_at;
    if (data.due_at !== undefined) dueAt = data.due_at && data.due_at.trim() !== '' ? new Date(data.due_at).toISOString() : null;
    const updateData: any = { ...data, due_at: dueAt, completed_at: completedAt, updated_at: now };
    Object.entries(updateData).forEach(([key, val]) => { if (val !== undefined) { fields.push(`${key} = ?`); values.push(val); } });
    values.push(req.params.id);
    await db.run(`UPDATE organizer_tasks SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json(await loadTask(db, req.params.id));
  } catch (err: any) {
    res.status(400).json({ error: 'Validation error', details: err.errors || err.message });
  }
});

router.delete('/:id', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db || (await getDb());
    await db.run('DELETE FROM organizer_tasks WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Задача удалена' });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

export default router;
