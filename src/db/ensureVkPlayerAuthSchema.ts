import type { DatabaseWrapper } from './index.ts';

const ensureColumn = async (db: DatabaseWrapper, table: string, column: string, definition: string) => {
  const columns = await db.all<any>(`PRAGMA table_info(${table})`);
  if (!columns.some((row: any) => String(row.name) === column)) {
    await db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
};

export async function ensureVkPlayerAuthSchema(db: DatabaseWrapper): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS vk_player_oauth_states (
      state TEXT PRIMARY KEY,
      verifier TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      nickname TEXT NOT NULL,
      return_to TEXT NOT NULL,
      browser_binding_hash TEXT,
      initiating_player_id TEXT,
      consumed_at TEXT,
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

  // Additive migration for databases created before browser-bound cabinet OAuth.
  await ensureColumn(db, 'vk_player_oauth_states', 'browser_binding_hash', 'TEXT');
  await ensureColumn(db, 'vk_player_oauth_states', 'initiating_player_id', 'TEXT');
  await ensureColumn(db, 'vk_player_oauth_states', 'consumed_at', 'TEXT');

  await db.run(`CREATE INDEX IF NOT EXISTS idx_vk_player_oauth_states_binding_created
    ON vk_player_oauth_states(browser_binding_hash, created_at)`);
}
