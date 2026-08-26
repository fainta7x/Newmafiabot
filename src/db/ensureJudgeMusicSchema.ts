import type { DatabaseWrapper } from './index.ts';

export async function ensureJudgeMusicSchema(db: DatabaseWrapper): Promise<void> {
  await db.run(`
    CREATE TABLE IF NOT EXISTS judge_music_tracks (
      id TEXT PRIMARY KEY,
      owner_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      audio_data BLOB NOT NULL,
      byte_size INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await db.run('CREATE INDEX IF NOT EXISTS idx_judge_music_tracks_owner_order ON judge_music_tracks(owner_player_id, sort_order, created_at)');

  await db.run(`
    CREATE TABLE IF NOT EXISTS music_link_entries (
      id TEXT PRIMARY KEY,
      owner_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      scope TEXT NOT NULL CHECK (scope IN ('organizer','player')),
      slot_index INTEGER,
      title TEXT NOT NULL,
      source_kind TEXT NOT NULL CHECK (source_kind IN ('yandex_track','yandex_playlist')),
      source_url TEXT NOT NULL,
      normalized_url TEXT NOT NULL,
      embed_url TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(owner_player_id, scope, slot_index)
    )
  `);
  await db.run('CREATE INDEX IF NOT EXISTS idx_music_link_owner_scope ON music_link_entries(owner_player_id, scope, sort_order, created_at)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_music_link_normalized ON music_link_entries(normalized_url)');

  await db.run(`
    CREATE TABLE IF NOT EXISTS evening_music_exclusions (
      evening_id TEXT NOT NULL REFERENCES game_evenings(id) ON DELETE CASCADE,
      entry_key TEXT NOT NULL,
      excluded_by_player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (evening_id, entry_key)
    )
  `);
  await db.run('CREATE INDEX IF NOT EXISTS idx_evening_music_exclusions_evening ON evening_music_exclusions(evening_id)');
}
