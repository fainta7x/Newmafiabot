import crypto from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { CURATOR_AREAS, curatorAreaLabel, normalizeCuratorAreas, type CuratorArea } from '../../lib/curatorAreas.ts';
import { queuePersonalNotification } from './personalNotificationRouterService.ts';

/**
 * Curator tasks (owner, 2026-10-01; item 21): the organizer gives a curator a task in his direction,
 * the curator sees it on the app's home screen and marks it done (optionally with a note).
 * A done task counts as the direction's activity in «Дела». Bonuses for tasks are a later step.
 */
export async function ensureCuratorTaskSchema(db: DatabaseWrapper) {
  await db.exec(`CREATE TABLE IF NOT EXISTS curator_tasks (
    id TEXT PRIMARY KEY,
    curator_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    area TEXT,
    title TEXT NOT NULL,
    description TEXT,
    due_at TEXT,
    status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'done', 'cancelled')),
    done_note TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  await db.exec('CREATE INDEX IF NOT EXISTS idx_curator_tasks_curator ON curator_tasks(curator_player_id, status)');
}

const clean = (value: unknown, max: number) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text.slice(0, max) : null;
};
const failure = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });

export async function createCuratorTask(db: DatabaseWrapper, input: { curatorPlayerId: unknown; area?: unknown; title: unknown; description?: unknown; dueAt?: unknown }) {
  await ensureCuratorTaskSchema(db);
  const curatorId = String(input.curatorPlayerId || '').trim();
  const title = clean(input.title, 200);
  if (!title) throw failure('Напишите, что сделать');
  const curator = await db.get<any>('SELECT id, nickname, curator_areas FROM players WHERE id = ? LIMIT 1', [curatorId]);
  if (!curator) throw failure('Куратор не найден', 404);
  const areas = normalizeCuratorAreas(curator.curator_areas);
  if (!areas.length) throw failure('Этот игрок не куратор — отметьте направление в его статусе');
  const area = input.area ? String(input.area).toUpperCase() as CuratorArea : (areas.length === 1 ? areas[0] : null);
  if (area && (!CURATOR_AREAS.includes(area) || !areas.includes(area))) throw failure('У куратора нет такого направления');
  const due = input.dueAt ? new Date(String(input.dueAt)) : null;
  if (due && Number.isNaN(due.getTime())) throw failure('Неверный срок');
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.run(
    `INSERT INTO curator_tasks (id, curator_player_id, area, title, description, due_at, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'todo', ?, ?)`,
    [id, curatorId, area, title, clean(input.description, 1000), due ? due.toISOString() : null, now, now],
  );
  // The curator hears about it in the bot (or VK), with a button to the app.
  await queuePersonalNotification(db, {
    notificationKey: `curator-task:${id}`, playerId: curatorId, eventType: 'curator_task', entityId: id,
    text: `📋 Новая задача куратора${area ? ` · ${curatorAreaLabel(area)}` : ''}\n${title}${due ? `\nСрок: ${due.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' })}` : ''}\nОтметь в приложении, когда сделаешь.`,
    actionPath: '/player',
  }).catch((error) => console.warn('[CURATOR TASK] notification failed:', error));
  return getCuratorTask(db, id);
}

export async function getCuratorTask(db: DatabaseWrapper, id: string) {
  return db.get<any>(
    `SELECT t.*, p.nickname AS curator_nickname FROM curator_tasks t JOIN players p ON p.id = t.curator_player_id WHERE t.id = ?`, [id]);
}

/** For the organizer: open tasks first (by due date), then the last 30 done or cancelled. */
export async function listCuratorTasks(db: DatabaseWrapper) {
  await ensureCuratorTaskSchema(db);
  const open = await db.all<any>(
    `SELECT t.*, p.nickname AS curator_nickname FROM curator_tasks t JOIN players p ON p.id = t.curator_player_id
      WHERE t.status = 'todo' ORDER BY t.due_at IS NULL, t.due_at, t.created_at`);
  const closed = await db.all<any>(
    `SELECT t.*, p.nickname AS curator_nickname FROM curator_tasks t JOIN players p ON p.id = t.curator_player_id
      WHERE t.status <> 'todo' ORDER BY t.updated_at DESC LIMIT 30`);
  const curators = (await db.all<any>("SELECT id, nickname, curator_areas FROM players WHERE COALESCE(curator_areas, '') <> '' ORDER BY nickname COLLATE NOCASE"))
    .map((row: any) => ({ id: String(row.id), nickname: String(row.nickname || 'Без ника'), areas: normalizeCuratorAreas(row.curator_areas) }))
    .filter((row: any) => row.areas.length);
  return { open, closed, curators };
}

export async function cancelCuratorTask(db: DatabaseWrapper, id: string) {
  await ensureCuratorTaskSchema(db);
  const now = new Date().toISOString();
  const result = await db.run("UPDATE curator_tasks SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'todo'", [now, id]);
  if (!result.changes) throw failure('Задача не найдена или уже закрыта', 404);
  return getCuratorTask(db, id);
}

/** For the curator: own open tasks and the last few done ones. */
export async function listOwnCuratorTasks(db: DatabaseWrapper, playerId: string) {
  await ensureCuratorTaskSchema(db);
  return db.all<any>(
    `SELECT id, area, title, description, due_at, status, done_note, completed_at, created_at FROM curator_tasks
      WHERE curator_player_id = ? AND (status = 'todo' OR (status = 'done' AND datetime(completed_at) > datetime('now', '-7 days')))
      ORDER BY status = 'done', due_at IS NULL, due_at, created_at`, [playerId]);
}

export async function completeOwnCuratorTask(db: DatabaseWrapper, playerId: string, id: string, note: unknown) {
  await ensureCuratorTaskSchema(db);
  const now = new Date().toISOString();
  const result = await db.run(
    "UPDATE curator_tasks SET status = 'done', done_note = ?, completed_at = ?, updated_at = ? WHERE id = ? AND curator_player_id = ? AND status = 'todo'",
    [clean(note, 500), now, now, id, playerId],
  );
  if (!result.changes) throw failure('Задача не найдена или уже закрыта', 404);
  return { id, status: 'done' };
}
