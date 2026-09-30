import type { DatabaseWrapper } from './index.ts';

/** Durable pairing for the laptop-side OBS bridge. OBS credentials never enter this table. */
export async function ensureObsRemoteSchema(db: DatabaseWrapper): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS obs_remote_connections (
      id TEXT PRIMARY KEY,
      bridge_token_hash TEXT,
      pairing_code_hash TEXT,
      pairing_expires_at TEXT,
      paired_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const now = new Date().toISOString();
  await db.run(
    `INSERT OR IGNORE INTO obs_remote_connections (id, created_at, updated_at)
     VALUES ('main', ?, ?)`,
    [now, now],
  );
}
