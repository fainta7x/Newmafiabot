CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  telegram_user_id TEXT UNIQUE,
  nickname TEXT NOT NULL UNIQUE,
  full_name TEXT,
  telegram_username TEXT,
  phone TEXT,
  lifecycle_status TEXT NOT NULL DEFAULT 'newcomer',
  source TEXT,
  notes TEXT,
  elo INTEGER NOT NULL DEFAULT 1000,
  tokens INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS game_evenings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  timezone TEXT NOT NULL DEFAULT 'Europe/Moscow',
  venue TEXT,
  format TEXT NOT NULL DEFAULT 'STANDARD',
  status TEXT NOT NULL DEFAULT 'draft',
  capacity INTEGER DEFAULT 20,
  default_price INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  settled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evening_participants (
  id TEXT PRIMARY KEY,
  evening_id TEXT NOT NULL REFERENCES game_evenings(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  registration_status TEXT NOT NULL DEFAULT 'registered',
  attendance_status TEXT NOT NULL DEFAULT 'pending',
  arrival_status TEXT NOT NULL DEFAULT 'unknown',
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  amount_due INTEGER NOT NULL DEFAULT 0,
  amount_paid INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  registered_at TEXT,
  confirmed_at TEXT,
  checked_in_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_evening_player_unique ON evening_participants (evening_id, player_id);

CREATE TABLE IF NOT EXISTS organizer_tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'other',
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT NOT NULL DEFAULT 'medium',
  due_at TEXT,
  completed_at TEXT,
  player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
  evening_id TEXT REFERENCES game_evenings(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS financial_transactions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  category TEXT,
  description TEXT,
  player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
  evening_id TEXT REFERENCES game_evenings(id) ON DELETE SET NULL,
  source_type TEXT,
  source_id TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_financial_tx_source_unique ON financial_transactions (source_type, source_id, type);

CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evening_id TEXT REFERENCES game_evenings(id) ON DELETE SET NULL,
  global_game_number INTEGER NOT NULL,
  game_date TEXT NOT NULL,
  winner_team TEXT NOT NULL,
  winner_label TEXT NOT NULL,
  judge_name TEXT,
  protocol_text TEXT,
  slots_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS migration_history (
  id TEXT PRIMARY KEY,
  migration_name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  details_json TEXT,
  executed_at TEXT NOT NULL
);
