import type { DatabaseWrapper } from './index.ts';

/** One compact durable poker snapshot per database (production and sandbox stay isolated). */
export async function ensurePokerRuntimeSchema(db: DatabaseWrapper): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS poker_runtime_state (
      id TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}
