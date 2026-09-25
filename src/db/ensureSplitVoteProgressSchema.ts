import type { DatabaseWrapper } from './index.ts';

export async function ensureSplitVoteProgressSchema(db: DatabaseWrapper): Promise<void> {
  await db.exec(`CREATE TABLE IF NOT EXISTS player_split_vote_progress (
    player_id TEXT NOT NULL,
    level TEXT NOT NULL CHECK (level IN ('basic', 'advanced', 'interactive')),
    passed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (player_id, level)
  )`);
}
