import type { DatabaseWrapper } from './index.ts';

/** External profiles never mutate player Elo or local tournament protocols. */
export async function ensureGoMafiaSchema(db: DatabaseWrapper): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS gomafia_player_links (
      player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
      external_player_id TEXT NOT NULL UNIQUE,
      profile_url TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','verified')),
      linked_by TEXT NOT NULL CHECK(linked_by IN ('player','organizer')),
      linked_at TEXT NOT NULL,
      verified_at TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_gomafia_link_verified
      ON gomafia_player_links(status, external_player_id);
    CREATE TABLE IF NOT EXISTS gomafia_player_snapshots (
      external_player_id TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'all',
      snapshot_json TEXT NOT NULL,
      retrieved_at TEXT NOT NULL,
      source_url TEXT NOT NULL,
      PRIMARY KEY(external_player_id, scope)
    );
    CREATE TABLE IF NOT EXISTS gomafia_external_games (
      external_game_id TEXT PRIMARY KEY,
      external_player_id TEXT NOT NULL,
      tournament_key TEXT,
      played_at TEXT,
      game_payload_json TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      source_url TEXT NOT NULL,
      linked_local_game_key TEXT
    );
    CREATE TABLE IF NOT EXISTS gomafia_tournament_appearances (
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      tournament_id TEXT NOT NULL,
      tournament_name TEXT NOT NULL,
      date_range TEXT,
      place INTEGER NOT NULL,
      total_score REAL NOT NULL,
      external_nickname TEXT NOT NULL,
      source_url TEXT NOT NULL,
      confirmed_at TEXT NOT NULL,
      PRIMARY KEY(player_id, tournament_id)
    );
    CREATE INDEX IF NOT EXISTS idx_gomafia_tournament_appearances_player
      ON gomafia_tournament_appearances(player_id, confirmed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_gomafia_external_games_player
      ON gomafia_external_games(external_player_id, played_at);
  `);
}
