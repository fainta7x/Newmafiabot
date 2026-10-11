import type { DatabaseWrapper } from './index.ts';

/** The text and emote messages of the poker tables' chat (owner, 2026-10-10). Short-lived: old rows are swept on every send. */
export async function ensurePokerChatSchema(db: DatabaseWrapper): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS poker_table_chat (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lobby_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      nickname TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('text','emote')),
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_poker_table_chat_lobby ON poker_table_chat(lobby_id, id);
    CREATE INDEX IF NOT EXISTS idx_poker_table_chat_player ON poker_table_chat(player_id, created_at);
  `);
}
