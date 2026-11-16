import type { DatabaseWrapper } from './index.ts';
export async function ensureDailySudokuSchema(db: DatabaseWrapper): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS daily_sudoku_puzzles (
      day TEXT PRIMARY KEY, level TEXT NOT NULL, puzzle TEXT NOT NULL, solution TEXT NOT NULL,
      reward INTEGER NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS daily_sudoku_sessions (
      day TEXT NOT NULL REFERENCES daily_sudoku_puzzles(day),
      player_id TEXT NOT NULL REFERENCES players(id),
      board TEXT NOT NULL, mistakes INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL,
      moves_json TEXT NOT NULL DEFAULT '[]', started_at TEXT NOT NULL, finished_at TEXT,
      reward_earned INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL,
      PRIMARY KEY(day, player_id)
    );
    CREATE INDEX IF NOT EXISTS idx_daily_sudoku_player ON daily_sudoku_sessions(player_id, day);
  `);
}
