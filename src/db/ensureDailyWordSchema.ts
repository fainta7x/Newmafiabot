import type { DatabaseWrapper } from './index.ts';
export async function ensureDailyWordSchema(db: DatabaseWrapper): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS daily_word_puzzles (
      day TEXT PRIMARY KEY, answer TEXT NOT NULL, author_player_id TEXT, reward INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS daily_word_sessions (
      day TEXT NOT NULL REFERENCES daily_word_puzzles(day),
      player_id TEXT NOT NULL REFERENCES players(id),
      guesses_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL,
      reward_earned INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL,
      PRIMARY KEY(day, player_id)
    );
    CREATE INDEX IF NOT EXISTS idx_daily_word_player ON daily_word_sessions(player_id, day);
  `);
}
