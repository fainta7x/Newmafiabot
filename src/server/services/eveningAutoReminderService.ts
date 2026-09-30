import type { DatabaseWrapper } from '../../db/index.ts';
import { beginReminderCampaign, loadReminderRecipients } from './eveningAnnouncementTrackingService.ts';
import { isEveningPublishingPaused } from './eveningPublishingPause.ts';
import { drainTelegramSyncOutbox, enqueueTelegramReminder, getTelegramDispatchJob } from './telegramSyncOutboxService.ts';

/**
 * «Напомнить неответившим» by itself (owner, 2026-10-01: «люди игнорируют голосование»): once per evening,
 * AUTO_REMINDER_HOURS before the start, the same reminder the organizer can send by hand goes to everyone who
 * got the bot's invitation and has not answered. Only in the daytime (Moscow AUTO_REMINDER_FROM_HOUR to
 * AUTO_REMINDER_TO_HOUR); at night it waits for the morning, while the evening is still more than a day away
 * (after that the existing 24-hour nudge takes over). A hand-sent reminder in the last day counts as this one.
 */
export const AUTO_REMINDER_HOURS = 48;
export const AUTO_REMINDER_FROM_HOUR = 10;
export const AUTO_REMINDER_TO_HOUR = 21;
const HOUR = 3_600_000;

export async function ensureEveningAutoReminderSchema(db: DatabaseWrapper) {
  await db.exec(`CREATE TABLE IF NOT EXISTS evening_auto_reminders (
    evening_id TEXT PRIMARY KEY REFERENCES game_evenings(id) ON DELETE CASCADE,
    decided_at TEXT NOT NULL,
    outcome TEXT NOT NULL
  )`);
  // The campaign this reminder started: delivered = tracking rows marked with it (the bot reports each one).
  const columns = await db.all<any>('PRAGMA table_info(evening_auto_reminders)');
  if (!columns.some((column: any) => column.name === 'campaign')) await db.run('ALTER TABLE evening_auto_reminders ADD COLUMN campaign INTEGER');
  if (!columns.some((column: any) => column.name === 'recipients')) await db.run('ALTER TABLE evening_auto_reminders ADD COLUMN recipients INTEGER');
}

/** For the announcement panel: what the automatic reminder did, with the real delivered count. */
export async function loadEveningAutoReminder(db: DatabaseWrapper, eveningId: string) {
  await ensureEveningAutoReminderSchema(db);
  const row = await db.get<any>('SELECT decided_at, outcome, campaign, recipients FROM evening_auto_reminders WHERE evening_id = ?', [eveningId]);
  if (!row) return null;
  const delivered = row.campaign
    ? Number((await db.get<any>('SELECT COUNT(*) AS count FROM evening_announcement_dm_tracking WHERE evening_id = ? AND last_reminder_campaign = ?', [eveningId, row.campaign]))?.count || 0)
    : 0;
  return { decided_at: String(row.decided_at), outcome: String(row.outcome), recipients: Number(row.recipients || 0), delivered };
}

const moscowHour = (ms: number) => Number(new Date(ms).toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/Moscow' }));

export async function runAutomaticUnansweredReminders(db: DatabaseWrapper, now = Date.now()) {
  await ensureEveningAutoReminderSchema(db);
  if (isEveningPublishingPaused()) return 0;
  const hour = moscowHour(now);
  if (hour < AUTO_REMINDER_FROM_HOUR || hour >= AUTO_REMINDER_TO_HOUR) return 0;
  const evenings = await db.all<any>(
    `SELECT e.id FROM game_evenings e
      WHERE e.status = 'published' AND e.settled_at IS NULL AND UPPER(COALESCE(e.format, '')) <> 'TOURNAMENT'
        AND datetime(e.starts_at) > datetime(?) AND datetime(e.starts_at) <= datetime(?)
        AND NOT EXISTS (SELECT 1 FROM evening_auto_reminders a WHERE a.evening_id = e.id)`,
    [new Date(now + 24 * HOUR).toISOString(), new Date(now + AUTO_REMINDER_HOURS * HOUR).toISOString()],
  );
  let started = 0;
  for (const { id } of evenings) {
    const eveningId = String(id);
    const decide = (outcome: string, campaign: number | null = null, recipients: number | null = null) => db.run(
      'INSERT OR IGNORE INTO evening_auto_reminders (evening_id, decided_at, outcome, campaign, recipients) VALUES (?, ?, ?, ?, ?)',
      [eveningId, new Date(now).toISOString(), outcome, campaign, recipients],
    );
    const manual = await db.get<any>(
      'SELECT updated_at FROM evening_reminder_campaign_state WHERE evening_id = ? AND datetime(updated_at) > datetime(?)',
      [eveningId, new Date(now - 24 * HOUR).toISOString()],
    ).catch(() => null);
    if (manual) { await decide('reminded_by_hand'); continue; }
    if (await getTelegramDispatchJob(db, 'reminder', eveningId)) { await decide('already_queued'); continue; }
    // A new campaign first, so players reminded by an older (more than a day old) campaign count again.
    const campaign = await beginReminderCampaign(db, eveningId);
    const recipients = await loadReminderRecipients(db, eveningId);
    if (!recipients?.recipients.length) { await decide('nobody_to_remind', campaign, 0); continue; }
    // The same path as the organizer's button: the bot sends through the outbox and reports each delivery.
    await enqueueTelegramReminder(db, eveningId);
    await decide('queued', campaign, recipients.recipients.length);
    started += 1;
  }
  if (started) await drainTelegramSyncOutbox(db, { limit: 20 }).catch((error) => console.warn('[AUTO REMINDER] outbox drain failed:', error));
  return started;
}
