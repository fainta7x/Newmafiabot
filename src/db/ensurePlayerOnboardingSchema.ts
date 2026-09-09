import type { DatabaseWrapper } from './index.ts';

export async function ensurePlayerOnboardingSchema(db: DatabaseWrapper): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS player_onboarding_sessions (
      token_hash TEXT PRIMARY KEY,
      platform TEXT NOT NULL CHECK (platform IN ('telegram', 'vk')),
      external_user_id TEXT NOT NULL,
      return_to TEXT NOT NULL DEFAULT '/player',
      identity_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      UNIQUE (platform, external_user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_player_onboarding_expiry
      ON player_onboarding_sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_player_onboarding_identity
      ON player_onboarding_sessions(platform, external_user_id);
  `);
}
