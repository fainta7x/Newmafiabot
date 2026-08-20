import type { DatabaseWrapper } from './index.ts';

const ensuredDatabases = new WeakSet<object>();

// Canonical club profile for the CRM owner. Telegram/VK identities only prove
// access to this player profile; organizer authority remains bound to player_id.
export const PRIMARY_ORGANIZER_PLAYER_ID = 'fad23405-9715-566f-acd9-5632c30eb198';

/**
 * Persistent organizer entitlement bound to the canonical player identity.
 *
 * Telegram/VK are authentication transports only. They resolve to player_id;
 * the organizer permission itself lives here so the same club profile can use
 * either verified external account without hard-coding external IDs.
 */
export async function ensureOrganizerPlayerAccessSchema(db: DatabaseWrapper): Promise<void> {
  if (!ensuredDatabases.has(db as object)) {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS organizer_player_access (
        player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
        granted_at TEXT NOT NULL,
        granted_via TEXT NOT NULL DEFAULT 'password_verified_identity'
      );
    `);
    ensuredDatabases.add(db as object);
  }

  // Restore the historical product rule: the club owner's canonical player
  // profile may open CRM directly after Telegram/VK proves that same profile.
  // This does not grant CRM to other bot admins, judges or hosts.
  const owner = await db.get<{ id: string }>(
    'SELECT id FROM players WHERE id = ? LIMIT 1',
    [PRIMARY_ORGANIZER_PLAYER_ID],
  );
  if (!owner) return;

  await db.run(`
    INSERT INTO organizer_player_access (player_id, granted_at, granted_via)
    VALUES (?, ?, 'canonical_owner')
    ON CONFLICT(player_id) DO NOTHING
  `, [PRIMARY_ORGANIZER_PLAYER_ID, new Date().toISOString()]);
}
