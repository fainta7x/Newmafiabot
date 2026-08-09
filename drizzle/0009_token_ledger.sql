CREATE TABLE IF NOT EXISTS token_ledger (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK(typeof(amount) = 'integer'),
  balance_after INTEGER NOT NULL CHECK(typeof(balance_after) = 'integer'),
  reason_type TEXT NOT NULL CHECK(length(trim(reason_type)) > 0),
  description TEXT NOT NULL CHECK(length(trim(description)) > 0),
  source_type TEXT NOT NULL CHECK(length(trim(source_type)) > 0),
  source_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE CHECK(length(trim(idempotency_key)) > 0),
  payload_hash TEXT NOT NULL,
  actor_type TEXT,
  actor_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_token_ledger_player_created
  ON token_ledger(player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_ledger_source
  ON token_ledger(source_type, source_id);
