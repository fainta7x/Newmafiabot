import type { DatabaseWrapper } from './index.ts';

export async function ensureVkJoinSchema(db: DatabaseWrapper): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS vk_join_oauth_states (
      state TEXT PRIMARY KEY,
      verifier TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      evening_id TEXT NOT NULL REFERENCES game_evenings(id) ON DELETE CASCADE,
      return_to TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vk_join_sessions (
      session_hash TEXT PRIMARY KEY,
      vk_user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_vk_join_oauth_states_expiry
      ON vk_join_oauth_states(expires_at);
    CREATE INDEX IF NOT EXISTS idx_vk_join_sessions_expiry
      ON vk_join_sessions(expires_at);
  `);
}
