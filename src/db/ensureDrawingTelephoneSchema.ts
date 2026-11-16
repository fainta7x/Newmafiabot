import type { DatabaseWrapper } from './index.ts';
export async function ensureDrawingTelephoneSchema(db: DatabaseWrapper): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS telephone_chains (
      id TEXT PRIMARY KEY,
      author_player_id TEXT NOT NULL REFERENCES players(id),
      guesser_player_id TEXT NOT NULL REFERENCES players(id),
      phrase TEXT NOT NULL, phrase_key TEXT NOT NULL UNIQUE, length INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active', step TEXT, current_player_id TEXT,
      turn_started_at TEXT, deadline_at TEXT, reminded INTEGER NOT NULL DEFAULT 0,
      excluded_json TEXT NOT NULL DEFAULT '[]',
      guess TEXT, finished_at TEXT, published INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_telephone_current ON telephone_chains(status, current_player_id);
    CREATE INDEX IF NOT EXISTS idx_telephone_author ON telephone_chains(author_player_id, status);
    CREATE TABLE IF NOT EXISTS telephone_links (
      chain_id TEXT NOT NULL REFERENCES telephone_chains(id),
      position INTEGER NOT NULL, player_id TEXT NOT NULL REFERENCES players(id),
      kind TEXT NOT NULL, text TEXT, image_png TEXT, created_at TEXT NOT NULL,
      PRIMARY KEY(chain_id, position)
    );
  `);
}
