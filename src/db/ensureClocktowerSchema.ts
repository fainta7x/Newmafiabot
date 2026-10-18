import type { DatabaseWrapper } from './index.ts';

/** «Кровь на часовой башне» rooms: a stub (owner, 2026-10-18). A room is a place to gather people; there is no game engine. */
export async function ensureClocktowerSchema(db: DatabaseWrapper): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS clocktower_rooms (
      id TEXT PRIMARY KEY,
      host_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      starts_at TEXT,
      created_at TEXT NOT NULL,
      closed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS clocktower_room_members (
      room_id TEXT NOT NULL REFERENCES clocktower_rooms(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      is_storyteller INTEGER NOT NULL DEFAULT 0,
      joined_at TEXT NOT NULL,
      PRIMARY KEY (room_id, player_id)
    );
    CREATE INDEX IF NOT EXISTS idx_clocktower_rooms_open ON clocktower_rooms(closed_at, created_at DESC);
  `);
}
