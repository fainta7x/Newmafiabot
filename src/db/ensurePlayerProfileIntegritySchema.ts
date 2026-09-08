import type { DatabaseWrapper } from './index.ts';

export async function ensurePlayerProfileIntegritySchema(db: DatabaseWrapper): Promise<void> {
  const columns = await db.all<{ name: string }>('PRAGMA table_info(players)');
  const names = new Set(columns.map((column) => column.name));
  const add = async (name: string, definition: string) => { if (!names.has(name)) await db.run(`ALTER TABLE players ADD COLUMN ${name} ${definition}`); };

  await add('birth_day', 'INTEGER');
  await add('birth_month', 'INTEGER');
  await add('birth_year', 'INTEGER');
  await add('birthday_visibility', "TEXT NOT NULL DEFAULT 'private'");
  await add('profile_field_status_json', "TEXT NOT NULL DEFAULT '{}'");
  await add('profile_checked_at', 'TEXT');
  await add('profile_updated_at', 'TEXT');
  await add('profile_visibility_json', "TEXT NOT NULL DEFAULT '{}'");
  await add('profile_cosmetics_json', "TEXT NOT NULL DEFAULT '{}'");

  await db.exec(`
    CREATE TABLE IF NOT EXISTS player_verified_awards (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      tournament_id TEXT,
      tournament_name TEXT,
      club_organizer TEXT,
      award_date TEXT,
      award_year INTEGER,
      place_result TEXT,
      team_name TEXT,
      description TEXT,
      source TEXT,
      source_type TEXT NOT NULL DEFAULT 'manual',
      source_key TEXT UNIQUE,
      photo_url TEXT,
      verification_status TEXT NOT NULL DEFAULT 'pending',
      created_by TEXT,
      verified_by TEXT,
      verified_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_player_verified_awards_player ON player_verified_awards(player_id, verification_status, COALESCE(award_date, created_at) DESC);
    CREATE INDEX IF NOT EXISTS idx_player_verified_awards_source ON player_verified_awards(source_type, source_key);

    CREATE TABLE IF NOT EXISTS player_award_suggestions (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      award_id TEXT REFERENCES player_verified_awards(id) ON DELETE SET NULL,
      suggestion_type TEXT NOT NULL DEFAULT 'new',
      kind TEXT,
      tournament_name TEXT,
      award_date TEXT,
      award_year INTEGER,
      place_result TEXT,
      team_name TEXT,
      description TEXT,
      source TEXT,
      photo_url TEXT,
      comment TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_by TEXT,
      reviewed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_player_award_suggestions_status ON player_award_suggestions(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_player_award_suggestions_player ON player_award_suggestions(player_id, status, created_at DESC);
  `);
}
