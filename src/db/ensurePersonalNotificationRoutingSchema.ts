import type { DatabaseWrapper } from './index.ts';

export async function ensurePersonalNotificationRoutingSchema(db: DatabaseWrapper): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS player_notification_preferences (
      player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
      preferred_channel TEXT NOT NULL DEFAULT 'auto',
      personal_enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      CHECK (preferred_channel IN ('auto', 'telegram', 'vk')),
      CHECK (personal_enabled IN (0, 1))
    );

    CREATE TABLE IF NOT EXISTS personal_notification_deliveries (
      notification_key TEXT PRIMARY KEY,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      event_type TEXT NOT NULL,
      entity_id TEXT,
      selected_channel TEXT,
      channel_target TEXT,
      text TEXT NOT NULL,
      action_path TEXT,
      status TEXT NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (selected_channel IS NULL OR selected_channel IN ('telegram', 'vk')),
      CHECK (status IN ('queued', 'pending_channel', 'disabled', 'unroutable'))
    );

    CREATE INDEX IF NOT EXISTS idx_personal_notification_player
      ON personal_notification_deliveries(player_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_personal_notification_pending_channel
      ON personal_notification_deliveries(selected_channel, status, created_at ASC);
  `);
}
