import type { DatabaseWrapper } from './index.ts';

type Db = DatabaseWrapper;

// Delivery and reminder tracking of evening announcements sent as Telegram direct messages.
export async function ensureEveningAnnouncementTrackingSchema(db: Db): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS evening_announcement_dm_delivery (
      evening_id TEXT NOT NULL REFERENCES game_evenings(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      telegram_user_id TEXT NOT NULL,
      telegram_message_id INTEGER,
      sent_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (evening_id, player_id)
    );

    CREATE TABLE IF NOT EXISTS evening_announcement_dm_tracking (
      evening_id TEXT NOT NULL REFERENCES game_evenings(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      telegram_user_id TEXT NOT NULL,
      first_message_id INTEGER,
      first_sent_at TEXT,
      delivery_status TEXT NOT NULL DEFAULT 'pending',
      last_attempt_at TEXT,
      last_error TEXT,
      reminder_count INTEGER NOT NULL DEFAULT 0,
      last_reminder_attempt_at TEXT,
      last_reminded_at TEXT,
      last_reminder_message_id INTEGER,
      last_reminder_error TEXT,
      last_reminder_campaign INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (evening_id, player_id)
    );

    CREATE TABLE IF NOT EXISTS evening_reminder_campaign_state (
      evening_id TEXT PRIMARY KEY REFERENCES game_evenings(id) ON DELETE CASCADE,
      generation INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_evening_announcement_tracking_evening
      ON evening_announcement_dm_tracking(evening_id, delivery_status);
  `);

  const columns = await db.all<any>('PRAGMA table_info(evening_announcement_dm_tracking)');
  if (!columns.some((column: any) => String(column.name) === 'last_reminder_campaign')) {
    await db.run('ALTER TABLE evening_announcement_dm_tracking ADD COLUMN last_reminder_campaign INTEGER NOT NULL DEFAULT 0');
  }

  const now = new Date().toISOString();
  await db.run(
    `INSERT OR IGNORE INTO evening_announcement_dm_tracking (
       evening_id, player_id, telegram_user_id,
       first_message_id, first_sent_at, delivery_status,
       last_attempt_at, last_error, reminder_count,
       created_at, updated_at
     )
     SELECT evening_id, player_id, telegram_user_id,
            telegram_message_id, sent_at, 'sent',
            sent_at, NULL, 0,
            sent_at, ?
       FROM evening_announcement_dm_delivery`,
    [now],
  );
}
