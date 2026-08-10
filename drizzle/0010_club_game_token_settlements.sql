CREATE TABLE IF NOT EXISTS club_game_token_settlements (
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL CHECK(subject_type IN ('player', 'judge')),
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  target_amount INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 0,
  breakdown_json TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (game_id, subject_type, player_id)
);

CREATE INDEX IF NOT EXISTS idx_club_game_token_settlements_player
  ON club_game_token_settlements(player_id, game_id);
