import type { DatabaseWrapper } from './index.ts';

export async function ensureVkPersonalMessageSchema(db: DatabaseWrapper): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS vk_message_outbox (
      message_key TEXT PRIMARY KEY,
      notification_key TEXT NOT NULL,
      category TEXT NOT NULL,
      event_type TEXT NOT NULL,
      entity_id TEXT,
      player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
      vk_user_id TEXT NOT NULL,
      text TEXT NOT NULL,
      action_path TEXT,
      random_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      retry_count INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT,
      last_attempt_at TEXT,
      last_error TEXT,
      failure_kind TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sent_at TEXT,
      CHECK (status IN ('pending', 'sent', 'failed'))
    );

    CREATE INDEX IF NOT EXISTS idx_vk_message_outbox_queue
      ON vk_message_outbox(status, next_attempt_at, created_at);
    CREATE INDEX IF NOT EXISTS idx_vk_message_outbox_player
      ON vk_message_outbox(player_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_vk_message_outbox_failure
      ON vk_message_outbox(failure_kind, status, updated_at DESC);
  `);
}
