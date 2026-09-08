import type { DatabaseWrapper } from './index.ts';

export async function ensureVkPlayerAuthSchema(db: DatabaseWrapper): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS vk_player_oauth_states (
      state TEXT PRIMARY KEY,
      verifier TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      nickname TEXT NOT NULL,
      return_to TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vk_player_identity_claims (
      token_hash TEXT PRIMARY KEY,
      vk_user_id TEXT NOT NULL,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      return_to TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      confirmed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_vk_player_oauth_states_expiry
      ON vk_player_oauth_states(expires_at);
    CREATE INDEX IF NOT EXISTS idx_vk_player_identity_claims_vk
      ON vk_player_identity_claims(vk_user_id, expires_at);
    CREATE INDEX IF NOT EXISTS idx_vk_player_identity_claims_player
      ON vk_player_identity_claims(player_id, expires_at);
  `);
}
