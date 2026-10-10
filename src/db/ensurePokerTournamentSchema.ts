import type { DatabaseWrapper } from './index.ts';

/**
 * Poker MTT (owner, 2026-10-10). A tournament is its own record: it keeps its settings, its clock and who plays.
 * Tournament chips are nominal and live only inside the tournament; club tokens move only for re-buys and prizes.
 */
export async function ensurePokerTournamentSchema(db: DatabaseWrapper): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS poker_tournaments (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      organizer_player_id TEXT,
      status TEXT NOT NULL DEFAULT 'registration' CHECK (status IN ('registration','running','finished','cancelled')),
      cancel_reason TEXT,
      start_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      notified_at TEXT,
      config_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_poker_tournaments_status_start ON poker_tournaments(status, start_at);

    CREATE TABLE IF NOT EXISTS poker_tournament_entries (
      tournament_id TEXT NOT NULL REFERENCES poker_tournaments(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'registered' CHECK (status IN ('registered','cancelled','playing','eliminated')),
      rebuys INTEGER NOT NULL DEFAULT 0 CHECK (rebuys >= 0),
      place INTEGER,
      prize_tokens INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (tournament_id, player_id)
    );
    CREATE INDEX IF NOT EXISTS idx_poker_tournament_entries_player ON poker_tournament_entries(player_id, status);
  `);
}
