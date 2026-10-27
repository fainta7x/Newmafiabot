import type { DatabaseWrapper } from '../../db/index.ts';
import { sanitizeBroadcastReplayFrames, type LiveBroadcastReplayFrame } from '../../lib/liveBroadcast.ts';

/**
 * The recorded broadcast frames of a club game (its replay) live in their own table, not inside `games.protocol_text`
 * (owner «да», 2026-10-27): ~1.4 MB a game made every read of a protocol heavy — profiles, achievements, Elo history,
 * analytics, the games list. Only the replay reads them.
 */
export async function ensureGameReplayFramesSchema(db: DatabaseWrapper): Promise<void> {
  await db.exec(`CREATE TABLE IF NOT EXISTS game_replay_frames (
    game_id INTEGER PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
    frames_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
}

export async function saveGameReplayFrames(db: DatabaseWrapper, gameId: number, frames: LiveBroadcastReplayFrame[]): Promise<void> {
  await ensureGameReplayFramesSchema(db);
  await db.run(
    `INSERT INTO game_replay_frames (game_id, frames_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(game_id) DO UPDATE SET frames_json = excluded.frames_json, updated_at = excluded.updated_at`,
    [gameId, JSON.stringify(frames), new Date().toISOString()],
  );
}

/** The game's frames; a game saved before the move still has them in its protocol (`fallback`). */
export async function loadGameReplayFrames(db: DatabaseWrapper, gameId: number, fallback?: unknown): Promise<LiveBroadcastReplayFrame[]> {
  await ensureGameReplayFramesSchema(db);
  const row = await db.get<{ frames_json: string }>('SELECT frames_json FROM game_replay_frames WHERE game_id = ? LIMIT 1', [gameId]);
  if (row) {
    try { return sanitizeBroadcastReplayFrames(JSON.parse(row.frames_json)); } catch { return []; }
  }
  return sanitizeBroadcastReplayFrames(fallback);
}
