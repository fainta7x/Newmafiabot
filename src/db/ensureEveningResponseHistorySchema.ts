import { oncePerDatabase } from './oncePerDatabase.ts';
import type { DatabaseWrapper } from './index.ts';

let ensure = oncePerDatabase(createSchema);

/** Who or what changed a player's answer to an evening, and when: so «it set itself to Не иду» can be answered from data. */
async function createSchema(db: DatabaseWrapper) {
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
}

export const ensureEveningResponseHistorySchema = (db: DatabaseWrapper) => ensure(db);
export const resetEveningResponseHistorySchemaForTests = () => { ensure = oncePerDatabase(createSchema); };
