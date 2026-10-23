import type { DatabaseWrapper } from '../../db/index.ts';
import { normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { ensureWeeklyEveningAutomationSchema } from '../../db/ensureWeeklyEveningAutomationSchema.ts';
import { ensureTelegramPublishingSchema } from '../../db/ensureTelegramPublishingSchema.ts';

/**
 * The organizer confirms when the first game of an ordinary (CASUAL) evening starts before its weekly announcement
 * goes out (owner, 2026-10-23): the evening is created at 21:00, but without a novice evening the club can start at
 * 20:00, and moving it after the announcement filled the channels with reschedule posts.
 */
export async function ensureEveningStartConfirmationSchema(db: DatabaseWrapper) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS evening_start_confirmations (
      evening_id TEXT PRIMARY KEY REFERENCES game_evenings(id) ON DELETE CASCADE,
      starts_at TEXT NOT NULL,
      confirmed_by TEXT,
      confirmed_at TEXT NOT NULL
    );
  `);
}

/** True once the evening is announced: its weekly announcement started, or it already has a channel post (e.g. by hand). */
export async function weeklyAnnouncementStarted(db: DatabaseWrapper, eveningId: string) {
  await ensureWeeklyEveningAutomationSchema(db);
  await ensureTelegramPublishingSchema(db);
  const row = await db.get(
    `SELECT 1 AS present FROM club_weekly_automation_runs WHERE automation_key = ?
     UNION ALL SELECT 1 FROM evening_telegram_publications WHERE evening_id = ? LIMIT 1`,
    [`weekly-announcement:${eveningId}`, eveningId],
  );
  return Boolean(row);
}

/** An ordinary evening waits for the organizer's start time before its weekly announcement. */
export async function needsEveningStartConfirmation(db: DatabaseWrapper, evening: { id: unknown; format?: unknown }) {
  if (normalizeEveningFormat(evening.format) !== 'CASUAL') return false;
  const eveningId = String(evening.id);
  await ensureEveningStartConfirmationSchema(db);
  const confirmed = await db.get('SELECT 1 AS present FROM evening_start_confirmations WHERE evening_id = ? LIMIT 1', [eveningId]);
  if (confirmed) return false;
  return !(await weeklyAnnouncementStarted(db, eveningId));
}
