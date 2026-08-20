import type { DatabaseWrapper } from './index.ts';

const ensuredDatabases = new WeakSet<object>();

/**
 * Persistent organizer entitlement bound to the canonical player identity.
 *
 * Telegram/VK are authentication transports only. They resolve to player_id;
 * the organizer permission itself lives here so the same club profile can use
 * either verified external account without hard-coding external IDs.
 */
export async function ensureOrganizerPlayerAccessSchema(db: DatabaseWrapper): Promise<void> {
  if (ensuredDatabases.has(db as object)) return;

  await db.exec(`
    CREATE TABLE IF NOT EXISTS organizer_player_access (
      player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
      granted_at TEXT NOT NULL,
      granted_via TEXT NOT NULL DEFAULT 'password_verified_identity'
    );
  `);

  ensuredDatabases.add(db as object);
}
