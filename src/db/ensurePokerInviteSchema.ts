import type { DatabaseWrapper } from './index.ts';

export async function ensurePokerInviteSchema(db: DatabaseWrapper): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS poker_invites (
      id TEXT PRIMARY KEY,
      sender_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      target_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      lobby_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_poker_invites_sender_target_created
      ON poker_invites(sender_player_id, target_player_id, created_at DESC);
  `);
}
