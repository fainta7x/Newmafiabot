CREATE TABLE IF NOT EXISTS tournament_award_overrides (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  award_key TEXT NOT NULL,
  player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
  action TEXT NOT NULL DEFAULT 'assign',
  comment TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(tournament_id, award_key)
);

CREATE INDEX IF NOT EXISTS idx_tournament_award_overrides_player
ON tournament_award_overrides(player_id);
