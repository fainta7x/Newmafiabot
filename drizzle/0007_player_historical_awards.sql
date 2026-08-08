CREATE TABLE IF NOT EXISTS player_historical_awards (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  award_key TEXT NOT NULL,
  title TEXT NOT NULL,
  tournament_title TEXT NOT NULL,
  tournament_date TEXT,
  comment TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_player_historical_awards_player
ON player_historical_awards(player_id, tournament_date);
