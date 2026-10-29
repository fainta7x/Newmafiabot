import type { DatabaseWrapper } from './index.ts';
import { oncePerDatabase } from './oncePerDatabase.ts';

/**
 * Birthday gift collection («Сбор на подарок»): one collection per birthday person, one contribution row per invited
 * player. Contributions are kept apart from game-evening payments (evening_participants) so a gift never mixes with
 * what a player owes for games.
 */
export const ensureGiftCollectionSchema = oncePerDatabase(async (db: DatabaseWrapper): Promise<void> => {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS gift_collections (
      id TEXT PRIMARY KEY,
      honoree_player_id TEXT NOT NULL REFERENCES players(id),
      status TEXT NOT NULL DEFAULT 'open',
      created_by TEXT,
      created_at TEXT NOT NULL,
      closed_at TEXT,
      reminded_at TEXT,
      CHECK (status IN ('open', 'closed'))
    );
    CREATE TABLE IF NOT EXISTS gift_contributions (
      collection_id TEXT NOT NULL REFERENCES gift_collections(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL REFERENCES players(id),
      status TEXT NOT NULL DEFAULT 'invited',
      channel TEXT NOT NULL DEFAULT 'none',
      pledged_amount INTEGER NOT NULL DEFAULT 0,
      paid_amount INTEGER NOT NULL DEFAULT 0,
      tokens_credited INTEGER NOT NULL DEFAULT 0,
      task_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      paid_at TEXT,
      PRIMARY KEY (collection_id, player_id),
      CHECK (status IN ('invited', 'pledged', 'declined', 'paid')),
      CHECK (channel IN ('telegram', 'vk_manual', 'none'))
    );
    CREATE INDEX IF NOT EXISTS idx_gift_contributions_player ON gift_contributions(player_id, status);
  `);
});
