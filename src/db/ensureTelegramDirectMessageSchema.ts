import type { DatabaseWrapper } from './index.ts';

/**
 * Durable per-recipient Telegram delivery queue.
 * Additive only: this creates new tables/indexes and never rewrites existing data.
 */
export async function ensureTelegramDirectMessageSchema(db: DatabaseWrapper): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS telegram_message_outbox (
      message_key TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      event_type TEXT NOT NULL,
      entity_id TEXT,
      player_id TEXT,
      chat_id TEXT NOT NULL,
      text TEXT NOT NULL,
      reply_markup_json TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
      retry_count INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT,
      last_attempt_at TEXT,
      last_error TEXT,
      sent_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_telegram_message_outbox_due
      ON telegram_message_outbox(status, next_attempt_at, created_at);
    CREATE INDEX IF NOT EXISTS idx_telegram_message_outbox_category_entity
      ON telegram_message_outbox(category, entity_id, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_telegram_message_outbox_player
      ON telegram_message_outbox(player_id, created_at DESC);
  `);
}
