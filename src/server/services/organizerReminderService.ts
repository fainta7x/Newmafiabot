import {loadPlayerEveningDebts} from './playerEveningDebts.ts';
import {birthdayTaskTitle} from '../../shared/birthdayTask.ts';
import { openEveningSql } from '../../lib/eveningStatus.ts';
import type { DatabaseWrapper } from '../../db/index.ts';
import { loadEveningRoute } from './eveningRouteService.ts';
import { enqueueOrganizerNotification } from './organizerNotificationService.ts';
import { escapeTelegramHtml } from './personalNotificationText.ts';
import { organizerTaskButtons } from './organizerTaskQuickActions.ts';

/**
 * Reminders for the organizer in Telegram (owner request, 2026-10-22): what is still open on the route of an evening,
 * an evening that was never closed, the debts after closed evenings and overdue organizer tasks. Every message has a
 * key per evening/day, so the minute scan sends each one once; the outbox keeps a sent message sent.
 */
const HOUR = 3_600_000;
const MORNING_HOUR = 9;
const DAILY_HOUR = 10;
const DEBTS_HOUR = 12;

const mskDate = (ms: number) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });
const mskHour = (ms: number) => Number(new Date(ms).toLocaleTimeString('en-GB', { timeZone: 'Europe/Moscow', hour: '2-digit', hour12: false }).slice(0, 2));
const whenText = (ms: number) => new Date(ms).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
const rubles = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₽`;
const lines = (items: string[], limit = 6) => items.slice(0, limit).map((item) => `• ${escapeTelegramHtml(item)}`).concat(items.length > limit ? [`… и ещё ${items.length - limit}`] : []);

/** True when a message with this key was queued before (the key is stored with a chat id suffix). */
async function queued(db: DatabaseWrapper, key: string) {
  const row = await db.get<any>("SELECT 1 AS present FROM telegram_message_outbox WHERE message_key LIKE ? LIMIT 1", [`${key}:%`]).catch(() => null);
  return Boolean(row);
}

async function send(db: DatabaseWrapper, key: string, entityId: string, text: string, replyMarkup: Record<string, unknown> | null = null) {
  if (await queued(db, key)) return 0;
  const result = await enqueueOrganizerNotification(db, { messageKey: key, eventType: 'organizer_reminder', entityId, text, replyMarkup });
  return result.queued > 0 ? 1 : 0;
}

export async function runOrganizerReminders(db: DatabaseWrapper, now = Date.now()): Promise<number> {
  let sent = 0;
  const hour = mskHour(now);
  const today = mskDate(now);

  const evenings = await db.all<any>(
    `SELECT id, title, format, status, starts_at FROM game_evenings
      WHERE ${openEveningSql()}
        AND datetime(starts_at) >= datetime(?) AND datetime(starts_at) <= datetime(?)`,
    [new Date(now - 14 * 24 * HOUR).toISOString(), new Date(now + 2 * 24 * HOUR).toISOString()],
  );
  for (const evening of evenings) {
    const id = String(evening.id);
    const start = new Date(String(evening.starts_at)).getTime();
    if (!Number.isFinite(start)) continue;
    const title = String(evening.title || 'Игровой вечер');
    const untilStart = start - now;

    // What is still open on the route: in the morning of the evening day and three hours before the start.
    const slot = untilStart > 3 * HOUR && mskDate(start) === today && hour >= MORNING_HOUR ? 'morning'
      : untilStart > 0 && untilStart <= 3 * HOUR ? '3h' : null;
    if (slot && !(await queued(db, `organizer-route:${id}:${slot}`))) {
      const route = await loadEveningRoute(db, id, now).catch(() => null);
      const open = (route?.stages || [])
        .filter((stage: any) => stage.id !== 'closeout')
        .flatMap((stage: any) => stage.steps)
        .filter((step: any) => step.status === 'attention' || step.status === 'todo')
        .map((step: any) => `${step.title}${step.detail ? ` — ${step.detail}` : ''}`);
      if (open.length) {
        sent += await send(db, `organizer-route:${id}:${slot}`, id,
          `📋 <b>${escapeTelegramHtml(title)}</b> — ${slot === '3h' ? 'через ' + Math.max(1, Math.round(untilStart / HOUR)) + ' ч' : 'сегодня'} (${whenText(start)})\nЕщё открыто:\n${lines(open).join('\n')}`);
      }
    }

    // An evening that was not closed: every day until it is closed, so it never hides in the list.
    if (untilStart < -4 * HOUR && hour >= DAILY_HOUR) {
      sent += await send(db, `organizer-unclosed:${id}:${today}`, id,
        `⚠️ <b>${escapeTelegramHtml(title)}</b> (${whenText(start)}) ещё не закрыт. Отметьте пришедших и закройте вечер — пока он открыт, долги и статистика не посчитаны. Если вечера не было — отмените его.`);
    }
  }

  // Debts of closed evenings, once a day.
  if (hour >= DEBTS_HOUR) {
    const cutoff=now-60*24*HOUR;
    const rows=(await loadPlayerEveningDebts(db)).filter(p=>p.evenings.some(e=>Date.parse(e.starts_at)>=cutoff));
    if(rows.length&&!(await queued(db,`organizer-debts:${today}`))){
      const total=rows.reduce((sum,p)=>sum+p.owed,0);
      sent+=await send(db,`organizer-debts:${today}`,'debts',`💰 Долги за вечера: ${rows.length} чел., всего ${rubles(total)}\n${lines(rows.map(p=>`${p.nickname}: ${rubles(p.owed)} — ${p.evenings.slice(0,4).map(e=>new Date(e.starts_at).toLocaleDateString('ru-RU',{day:'numeric',month:'short',timeZone:'Europe/Moscow'})+': '+rubles(e.owed)).join('; ')}${p.evenings.length>4?'; ещё вечеров: '+(p.evenings.length-4):''}`),5).join('\n')}\nОплату можно принять в «Оплата вечера».`);
    }
  }

  // Overdue organizer tasks, once a day.
  if (hour >= DAILY_HOUR) {
    const tasks = await db.all<any>(
      `SELECT t.id,t.title,t.automation_key,p.nickname AS player_nickname FROM organizer_tasks t LEFT JOIN players p ON p.id=t.player_id
        WHERE t.status IN ('todo', 'in_progress') AND t.due_at IS NOT NULL AND datetime(t.due_at) < datetime(?)
        ORDER BY t.due_at ASC`,
      [new Date(now).toISOString()],
    ).catch(() => [] as any[]);
    for(const task of tasks)task.title=birthdayTaskTitle(task,now);
    if (tasks.length && !(await queued(db, `organizer-tasks:${today}`))) {
      sent += await send(db, `organizer-tasks:${today}`, 'tasks', `🗒 Просроченные задачи: ${tasks.length}\n${lines(tasks.map((task) => birthdayTaskTitle(task,now))).join('\n')}`, organizerTaskButtons(tasks));
    }
  }
  return sent;
}
