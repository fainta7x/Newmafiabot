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
}
