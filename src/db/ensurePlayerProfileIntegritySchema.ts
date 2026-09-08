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

    CREATE TABLE IF NOT EXISTS player_club_milestones (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      milestone_date TEXT,
      icon TEXT NOT NULL DEFAULT '◆',
      source TEXT NOT NULL DEFAULT 'manual',
      verification_status TEXT NOT NULL DEFAULT 'verified',
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_player_club_milestones_player ON player_club_milestones(player_id, verification_status, COALESCE(milestone_date, created_at) DESC);
  `);

  const awardColumns = await db.all<{ name: string }>('PRAGMA table_info(player_verified_awards)');
  if (!awardColumns.some((column) => column.name === 'pinned_position')) {
    await db.run('ALTER TABLE player_verified_awards ADD COLUMN pinned_position INTEGER');
  }
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_player_verified_awards_pinned ON player_verified_awards(player_id, pinned_position);`);
}
