import type { DatabaseWrapper } from '../../db/index.ts';
import { weeklyAnnouncementDueMs } from '../../lib/weeklyAnnouncementDue.ts';
import { enqueueOrganizerNotification, resolveOrganizerNotificationRecipientsWithAccess } from './organizerNotificationService.ts';
import { escapeTelegramHtml } from './personalNotificationText.ts';
import { updateEveningSlotSettings } from './eveningSlotWritesService.ts';
import { ensureEveningStartConfirmationSchema, needsEveningStartConfirmation, weeklyAnnouncementStarted } from './eveningStartConfirmationStore.ts';
import { runDueWeeklyAnnouncements } from './weeklyEveningAutomationService.ts';

/**
 * The bot asks the organizer when the first game of the week's ordinary evening starts, before its Monday 19:00
 * announcement (owner, 2026-10-23): «Бот до анонса»; without an answer the announcement waits («Ждать моего ответа»).
 * The question goes on Monday from 12:00 Moscow and again each day from 12:00; at 19:00 the organizer is told that
 * the announcement is waiting.
 */
export const EVENING_START_CHOICES = ['19:00', '20:00', '21:00'] as const;
const HOUR = 3_600_000;
const ASK_HOURS_BEFORE_DUE = 7;
const DAILY_ASK_HOUR = 12;

const mskDate = (ms: number) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });
const mskHour = (ms: number) => Number(new Date(ms).toLocaleTimeString('en-GB', { timeZone: 'Europe/Moscow', hour: '2-digit', hour12: false }).slice(0, 2));
const mskTime = (value: string) => new Date(value).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' });
const dayText = (value: string) => new Date(value).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', weekday: 'long', day: 'numeric', month: 'long' });

export const eveningStartCallback = (eveningId: string, time: string) => `estart:${eveningId}:${time.replace(':', '')}`;

const startButtons = (eveningId: string) => ({
  inline_keyboard: [EVENING_START_CHOICES.map((time) => ({ text: time, callback_data: eveningStartCallback(eveningId, time) }))],
});

async function queued(db: DatabaseWrapper, key: string) {
  const row = await db.get<any>('SELECT 1 AS present FROM telegram_message_outbox WHERE message_key LIKE ? LIMIT 1', [`${key}:%`]).catch(() => null);
  return Boolean(row);
}

async function ask(db: DatabaseWrapper, key: string, evening: any, lead: string) {
  if (await queued(db, key)) return 0;
  const text = `${lead}\n<b>${escapeTelegramHtml(String(evening.title || 'Игровой вечер'))}</b>, ${escapeTelegramHtml(dayText(evening.starts_at))}. Сейчас стоит ${mskTime(evening.starts_at)}.\nВо сколько первая игра?`;
  const result = await enqueueOrganizerNotification(db, { messageKey: key, eventType: 'evening_start_question', entityId: String(evening.id), text, replyMarkup: startButtons(String(evening.id)) });
  return result.queued > 0 ? 1 : 0;
}

/** Called by the minute scan: asks about every ordinary evening whose announcement is near and still waits. */
export async function runEveningStartQuestions(db: DatabaseWrapper, now = Date.now()): Promise<number> {
  await ensureEveningStartConfirmationSchema(db);
  const evenings = await db.all<any>(
    `SELECT id, title, format, starts_at FROM game_evenings
      WHERE status IN ('draft', 'published') AND settled_at IS NULL AND datetime(starts_at) > datetime(?)`,
    [new Date(now).toISOString()],
  );
  let sent = 0;
  for (const evening of evenings) {
    const dueMs = weeklyAnnouncementDueMs(evening.starts_at);
    if (now < dueMs - ASK_HOURS_BEFORE_DUE * HOUR) continue;
    if (!(await needsEveningStartConfirmation(db, evening))) continue;
    const id = String(evening.id);
    if (now >= dueMs && !(await queued(db, `evening-start-wait:${id}`))) {
      sent += await ask(db, `evening-start-wait:${id}`, evening, '⏳ Анонс вечера ждёт вашего ответа — он уйдёт, как только вы выберете время.');
      continue;
    }
    if (mskHour(now) >= DAILY_ASK_HOUR) sent += await ask(db, `evening-start-ask:${id}:${mskDate(now)}`, evening, '🕗 Скоро анонс вечера.');
  }
  return sent;
}

export type EveningStartResult =
  | { ok: true; evening: { id: string; title: string; starts_at: string }; announcement_due: boolean }
  | { ok: false; error: 'forbidden' | 'not_found' | 'invalid' | 'closed' };

/** The organizer's answer: the first game starts at `time` on the evening's day; the announcement may go now. */
export async function confirmEveningStart(
  db: DatabaseWrapper,
  input: { eveningId: string; time: unknown; telegramUserId: unknown },
  now = Date.now(),
): Promise<EveningStartResult> {
  const time = String(input.time ?? '');
  if (!(EVENING_START_CHOICES as readonly string[]).includes(time)) return { ok: false, error: 'invalid' };
  const presser = String(input.telegramUserId ?? '').trim();
  const { recipients } = await resolveOrganizerNotificationRecipientsWithAccess(db);
  if (!presser || !recipients.map(String).includes(presser)) return { ok: false, error: 'forbidden' };

  const evening = await db.get<any>('SELECT id, title, format, status, starts_at, settled_at FROM game_evenings WHERE id = ?', [input.eveningId]);
  if (!evening) return { ok: false, error: 'not_found' };
  // After the announcement a change of time is a real move (with its notice) and belongs in the CRM.
  if (!['draft', 'published'].includes(String(evening.status)) || evening.settled_at
    || new Date(evening.starts_at).getTime() <= now || await weeklyAnnouncementStarted(db, String(evening.id))) {
    return { ok: false, error: 'closed' };
  }

  const startsAt = `${mskDate(new Date(evening.starts_at).getTime())}T${time}:00+03:00`;
  // Nothing is announced yet, so there is nobody to tell about a «перенос».
  await updateEveningSlotSettings(db, String(evening.id), { starts_at: startsAt }, { notifyReschedule: false });
  await ensureEveningStartConfirmationSchema(db);
  const stamp = new Date(now).toISOString();
  await db.run(
    `INSERT INTO evening_start_confirmations (evening_id, starts_at, confirmed_by, confirmed_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(evening_id) DO UPDATE SET starts_at = excluded.starts_at, confirmed_by = excluded.confirmed_by, confirmed_at = excluded.confirmed_at`,
    [String(evening.id), startsAt, presser, stamp],
  );
  const announcementDue = now >= weeklyAnnouncementDueMs(startsAt);
  if (announcementDue) {
    void runDueWeeklyAnnouncements(db).catch((error) => console.warn('[EVENING START] Announcement after the answer failed:', error));
  }
  return { ok: true, evening: { id: String(evening.id), title: String(evening.title || 'Игровой вечер'), starts_at: startsAt }, announcement_due: announcementDue };
}
