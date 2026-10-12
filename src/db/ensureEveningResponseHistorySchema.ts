import type { DatabaseWrapper } from './index.ts';

let ready = new WeakSet<object>();

/** Who or what changed a player's answer to an evening, and when: so «it set itself to Не иду» can be answered from data. */
export async function ensureEveningResponseHistorySchema(db: Pick<DatabaseWrapper, 'run'>) {
  if (ready.has(db as object)) return;
  await db.run(`CREATE TABLE IF NOT EXISTS evening_response_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    participant_id TEXT NOT NULL,
    evening_id TEXT,
    player_id TEXT,
    previous_status TEXT,
    new_status TEXT NOT NULL,
    source TEXT NOT NULL,
    by_player INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`);
  await db.run('CREATE INDEX IF NOT EXISTS idx_evening_response_history_participant ON evening_response_history(participant_id, id)');
  ready.add(db as object);
}

export const resetEveningResponseHistorySchemaForTests = () => { ready = new WeakSet<object>(); };
