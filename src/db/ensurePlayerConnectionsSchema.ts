import type { DatabaseWrapper } from './index.ts';

export async function ensurePlayerConnectionsSchema(db: DatabaseWrapper) {
  await db.run(`
    CREATE TABLE IF NOT EXISTS player_referrals (
      invited_player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
      inviter_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      source TEXT NOT NULL DEFAULT 'organizer',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (invited_player_id <> inviter_player_id)
    )
  `);
  await db.run('CREATE INDEX IF NOT EXISTS idx_player_referrals_inviter ON player_referrals(inviter_player_id)');
}
