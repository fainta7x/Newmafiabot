import type { DatabaseWrapper } from './index.ts';

const LEVELS_SQL = "'basic', 'advanced', 'interactive', 'expert', 'three_easy', 'three_medium'";

export async function ensureSplitVoteProgressSchema(db: DatabaseWrapper): Promise<void> {
  await db.exec(`CREATE TABLE IF NOT EXISTS player_split_vote_progress (
    player_id TEXT NOT NULL,
    level TEXT NOT NULL CHECK (level IN (${LEVELS_SQL})),
    passed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (player_id, level)
  )`);
  // Older tables accept fewer levels in their CHECK: rebuild them once, keeping every row.
  const table = await db.get<{ sql: string }>("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'player_split_vote_progress'", []);
  if (table && !String(table.sql).includes("'three_medium'")) {
    await db.transaction(async (tx) => {
      await tx.exec(`CREATE TABLE player_split_vote_progress_next (
        player_id TEXT NOT NULL,
        level TEXT NOT NULL CHECK (level IN (${LEVELS_SQL})),
        passed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (player_id, level)
      )`);
      await tx.exec(`INSERT INTO player_split_vote_progress_next (player_id, level, passed_at)
        SELECT player_id, level, passed_at FROM player_split_vote_progress`);
      await tx.exec('DROP TABLE player_split_vote_progress');
      await tx.exec('ALTER TABLE player_split_vote_progress_next RENAME TO player_split_vote_progress');
    });
  }
}
