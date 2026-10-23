import type { DatabaseWrapper } from '../../db/index.ts';
import { resolveOrganizerNotificationRecipientsWithAccess } from './organizerNotificationService.ts';

/**
 * Quick answers to organizer tasks from a Telegram notification (owner, 2026-10-23): «✅ Сделано» closes the task,
 * «⏰ Завтра» moves its deadline to tomorrow 10:00 Moscow time. The bot passes the Telegram id of the person who pressed
 * the button; only the organizers who receive these notifications may act.
 */
export const ORGANIZER_TASK_ACTIONS = ['done', 'snooze'] as const;
export type OrganizerTaskAction = (typeof ORGANIZER_TASK_ACTIONS)[number];

const CALLBACK_PREFIX = 'otask';
const TELEGRAM_CALLBACK_LIMIT = 64;

export const organizerTaskCallback = (action: OrganizerTaskAction, taskId: string) => `${CALLBACK_PREFIX}:${action}:${taskId}`;

const shortTitle = (title: string, max = 24) => (title.length > max ? `${title.slice(0, max - 1)}…` : title);

/** One row per task: «✅ <title>» and «⏰ Завтра». A task whose id does not fit Telegram's callback limit gets no row. */
export function organizerTaskButtons(tasks: Array<{ id: unknown; title: unknown }>, limit = 6) {
  const rows = tasks.slice(0, limit).flatMap((task) => {
    const id = String(task.id ?? '');
    if (!id || Buffer.byteLength(organizerTaskCallback('snooze', id)) > TELEGRAM_CALLBACK_LIMIT) return [];
    return [[
      { text: `✅ ${shortTitle(String(task.title || 'Задача'))}`, callback_data: organizerTaskCallback('done', id) },
      { text: '⏰ Завтра', callback_data: organizerTaskCallback('snooze', id) },
    ]];
  });
  return rows.length ? { inline_keyboard: rows } : null;
}

/** Tomorrow 10:00 in Moscow (UTC+3, no daylight saving) as an ISO string. */
export function tomorrowMorningMoscow(now = Date.now()) {
  const moscow = new Date(now + 3 * 3_600_000);
  return new Date(Date.UTC(moscow.getUTCFullYear(), moscow.getUTCMonth(), moscow.getUTCDate() + 1, 10 - 3, 0, 0)).toISOString();
}

export type OrganizerTaskActionResult =
  | { ok: true; task: { id: string; title: string; status: string; due_at: string | null } }
  | { ok: false; error: 'forbidden' | 'not_found' | 'invalid' | 'closed' };

export async function applyOrganizerTaskAction(
  db: DatabaseWrapper,
  input: { taskId: string; action: unknown; telegramUserId: unknown },
  now = Date.now(),
): Promise<OrganizerTaskActionResult> {
  const action = input.action as OrganizerTaskAction;
  if (!ORGANIZER_TASK_ACTIONS.includes(action)) return { ok: false, error: 'invalid' };
  const presser = String(input.telegramUserId ?? '').trim();
  const { recipients } = await resolveOrganizerNotificationRecipientsWithAccess(db);
  if (!presser || !recipients.map(String).includes(presser)) return { ok: false, error: 'forbidden' };

  const task = await db.get<any>('SELECT id, title, status, due_at FROM organizer_tasks WHERE id = ?', [input.taskId]);
  if (!task) return { ok: false, error: 'not_found' };
  const stamp = new Date(now).toISOString();
  // Old messages keep their buttons: a task closed elsewhere is not postponed or reopened. «Сделано» on a done task
  // is a harmless repeat; the status check sits in the update itself so two presses at once cannot race.
  if (action === 'done') {
    if (task.status === 'cancelled') return { ok: false, error: 'closed' };
    await db.run(`UPDATE organizer_tasks SET status = 'done', completed_at = ?, updated_at = ? WHERE id = ? AND status NOT IN ('done', 'cancelled')`, [stamp, stamp, task.id]);
  } else {
    const result = await db.run(`UPDATE organizer_tasks SET due_at = ?, updated_at = ? WHERE id = ? AND status NOT IN ('done', 'cancelled')`, [tomorrowMorningMoscow(now), stamp, task.id]);
    if (!result?.changes) return { ok: false, error: 'closed' };
  }
  const updated = await db.get<any>('SELECT id, title, status, due_at FROM organizer_tasks WHERE id = ?', [task.id]);
  return { ok: true, task: { id: String(updated.id), title: String(updated.title || 'Задача'), status: String(updated.status), due_at: updated.due_at ?? null } };
}
