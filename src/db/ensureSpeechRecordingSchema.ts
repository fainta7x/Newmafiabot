import type { DatabaseWrapper } from './index.ts';

export async function ensureSpeechRecordingSchema(db: DatabaseWrapper): Promise<void> {
  await db.run(`
    CREATE TABLE IF NOT EXISTS game_speech_recordings (
      id TEXT PRIMARY KEY,
      game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL,
      seat_number INTEGER NOT NULL,
      speaker_nickname TEXT NOT NULL,
      round_number INTEGER NOT NULL DEFAULT 1,
      speech_type TEXT NOT NULL,
      started_at TEXT NOT NULL,
      duration_seconds REAL NOT NULL DEFAULT 0,
      mime_type TEXT NOT NULL,
      audio_data BLOB NOT NULL,
      byte_size INTEGER NOT NULL,
      uploaded_by_player_id TEXT,
      created_at TEXT NOT NULL
    )
  `);
  await db.run('CREATE INDEX IF NOT EXISTS idx_game_speech_recordings_game_started ON game_speech_recordings(game_id, started_at)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_game_speech_recordings_session ON game_speech_recordings(session_id, started_at)');
}
