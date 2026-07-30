-- Create tournaments table
CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  venue TEXT,
  stage TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  chief_judge_name TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Create tournament_participants table
CREATE TABLE IF NOT EXISTS tournament_participants (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  participant_number INTEGER NOT NULL,
  UNIQUE(tournament_id, player_id),
  UNIQUE(tournament_id, participant_number)
);

-- Create tournament_games table
CREATE TABLE IF NOT EXISTS tournament_games (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  game_number INTEGER NOT NULL,
  judge_name TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  winner_team TEXT,
  started_at TEXT,
  completed_at TEXT,
  UNIQUE(tournament_id, game_number)
);

-- Create tournament_game_seats table
CREATE TABLE IF NOT EXISTS tournament_game_seats (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES tournament_games(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES tournament_participants(id) ON DELETE CASCADE,
  seat_number INTEGER NOT NULL,
  role TEXT,
  UNIQUE(game_id, seat_number),
  UNIQUE(game_id, participant_id)
);
