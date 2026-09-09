import type { DatabaseWrapper } from './index.ts';

const ensureColumn = async (db: DatabaseWrapper, table: string, column: string, definition: string) => {
  const columns = await db.all<any>(`PRAGMA table_info(${table})`);
  if (!columns.some((row: any) => String(row.name) === column)) {
    await db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
};

export async function ensurePlayerOnboardingSchema(db: DatabaseWrapper): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS player_onboarding_sessions (
      token_hash TEXT PRIMARY KEY,
      platform TEXT NOT NULL CHECK (platform IN ('telegram', 'vk')),
      external_user_id TEXT NOT NULL,
      return_to TEXT NOT NULL DEFAULT '/player',
      identity_json TEXT NOT NULL DEFAULT '{}',
      completion_kind TEXT,
      completed_player_id TEXT,
      completed_link_request_id TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      UNIQUE (platform, external_user_id)
    );

    CREATE TABLE IF NOT EXISTS player_onboarding_link_requests (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL CHECK (platform IN ('telegram', 'vk')),
      external_user_id TEXT NOT NULL,
      target_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      nickname TEXT NOT NULL,
      return_to TEXT NOT NULL DEFAULT '/player',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_player_onboarding_expiry
      ON player_onboarding_sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_player_onboarding_identity
      ON player_onboarding_sessions(platform, external_user_id);
    CREATE INDEX IF NOT EXISTS idx_player_onboarding_link_target
      ON player_onboarding_link_requests(target_player_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_player_onboarding_link_identity
      ON player_onboarding_link_requests(platform, external_user_id, status, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_player_onboarding_link_one_pending
      ON player_onboarding_link_requests(platform, external_user_id)
      WHERE status='pending';
  `);

  // Additive compatibility for databases that saw the stage-1 schema before
  // completion/link-request fields were introduced.
  await ensureColumn(db, 'player_onboarding_sessions', 'completion_kind', 'TEXT');
  await ensureColumn(db, 'player_onboarding_sessions', 'completed_player_id', 'TEXT');
  await ensureColumn(db, 'player_onboarding_sessions', 'completed_link_request_id', 'TEXT');
  await ensureColumn(db, 'player_onboarding_sessions', 'completed_at', 'TEXT');
}
