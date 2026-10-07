import type { DatabaseWrapper } from './index.ts';
import {
  grantPlayerStarterTokens,
  PLAYER_STARTER_TOKEN_GRANT,
  PLAYER_STARTER_TOKEN_GRANT_SOURCE,
} from '../server/services/tokenLedgerService.ts';

export const PLAYER_STARTER_TOKEN_GRANT_MIGRATION = PLAYER_STARTER_TOKEN_GRANT_SOURCE;

/**
 * Owner-approved 2026-10-07: every real player gets 1,000 starter club tokens so poker
 * is immediately available. Existing balances are preserved; merged duplicate profiles
 * are tombstones and do not receive a second grant. Per-player ledger idempotency plus
 * the migration marker make repeated starts safe.
 */
export async function applyPlayerStarterTokenGrant(db: DatabaseWrapper): Promise<{ applied: boolean; granted: number }> {
  const marker = await db.get<{ status?: string }>(
    'SELECT status FROM migration_history WHERE migration_name = ? LIMIT 1',
    [PLAYER_STARTER_TOKEN_GRANT_MIGRATION],
  );
  if (marker?.status === 'completed') return { applied: false, granted: 0 };

  const players = await db.all<{ id: string }>(
    "SELECT id FROM players WHERE COALESCE(lifecycle_status, 'normal') <> 'merged' ORDER BY id",
  );
  let granted = 0;
  const now = new Date().toISOString();

  await db.transaction(async (tx) => {
    for (const player of players) {
      const key = `${PLAYER_STARTER_TOKEN_GRANT_SOURCE}:${player.id}`;
      const existing = await tx.get<{ id: string }>('SELECT id FROM token_ledger WHERE idempotency_key = ? LIMIT 1', [key]);
      await grantPlayerStarterTokens(tx, String(player.id));
      if (!existing) granted += 1;
    }

    await tx.run(
      `INSERT INTO migration_history (id, migration_name, status, details_json, executed_at)
       VALUES (?, ?, 'completed', ?, ?)
       ON CONFLICT(migration_name) DO UPDATE SET
         status='completed', details_json=excluded.details_json, executed_at=excluded.executed_at`,
      [
        PLAYER_STARTER_TOKEN_GRANT_MIGRATION,
        PLAYER_STARTER_TOKEN_GRANT_MIGRATION,
        JSON.stringify({ amount: PLAYER_STARTER_TOKEN_GRANT, eligible_players: players.length, granted }),
        now,
      ],
    );
  });

  return { applied: true, granted };
}
