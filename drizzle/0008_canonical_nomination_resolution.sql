-- Canonical deterministic nomination resolution and durable repository avatar fallback.
CREATE TABLE IF NOT EXISTS player_avatar_repository_suppression (
  player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

-- Legacy nomination tie decisions and nomination award overrides are no longer authoritative.
DELETE FROM tournament_final_resolutions WHERE type = 'nomination_tie';
DELETE FROM tournament_award_overrides WHERE award_key LIKE 'nomination_%';
