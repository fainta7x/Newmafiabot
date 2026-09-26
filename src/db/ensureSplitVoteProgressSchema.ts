import type { DatabaseWrapper } from './index.ts';

// One migration per database: concurrent first requests must not open two rebuild transactions.
const schemaInitialization = new WeakMap<object, Promise<void>>();

const LEVELS_SQL = "'basic', 'advanced', 'interactive', 'expert', 'three_easy', 'three_medium'";

async function initializeSplitVoteProgressSchema(db: DatabaseWrapper): Promise<void> {
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

export async function ensureSplitVoteProgressSchema(db: DatabaseWrapper): Promise<void> {
  const key = db as unknown as object;
  const running = schemaInitialization.get(key);
  if (running) return running;
  const initialization = initializeSplitVoteProgressSchema(db);
  schemaInitialization.set(key, initialization);
  try {
    await initialization;
  } catch (error) {
    if (schemaInitialization.get(key) === initialization) schemaInitialization.delete(key);
    throw error;
  }
}
