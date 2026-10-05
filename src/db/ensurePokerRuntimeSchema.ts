import type { DatabaseWrapper } from './index.ts';

/** One compact durable poker snapshot per database, plus a compact log of finished hands the bots learn from (production and sandbox stay isolated). */
export async function ensurePokerRuntimeSchema(db: DatabaseWrapper): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS poker_runtime_state (
      id TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS poker_hand_log (
      id TEXT PRIMARY KEY,
      played_at INTEGER NOT NULL,
      hand_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_poker_hand_log_played_at ON poker_hand_log(played_at);
  `);
}
