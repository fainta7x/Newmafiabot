import type { DatabaseWrapper } from './index.ts';

const initialized = new WeakSet<object>();

/** One row per player and practice item: how many tries, the best score, when it was first passed and the last try. */
export async function ensureLearningActivitySchema(db: DatabaseWrapper): Promise<void> {
  if (initialized.has(db as unknown as object)) return;
  await db.exec(`CREATE TABLE IF NOT EXISTS player_learning_activity (
    player_id TEXT NOT NULL,
    track TEXT NOT NULL,
    item TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    best_score INTEGER,
    max_score INTEGER,
    passed_at TEXT,
    first_at TEXT NOT NULL,
    last_at TEXT NOT NULL,
    PRIMARY KEY (player_id, track, item)
  )`);
  await db.exec('CREATE INDEX IF NOT EXISTS idx_player_learning_activity_last ON player_learning_activity(last_at)');
  initialized.add(db as unknown as object);
}
