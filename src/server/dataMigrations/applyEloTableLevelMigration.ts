import type { DatabaseWrapper } from '../../db/index.ts';
import { EXPECTATION_DIVISOR, PROTECTION_DIVISOR, rebuildCanonicalEloRatings } from '../services/eloRatingService.ts';

const MIGRATION_NAME = '2026-10-elo-table-level-400-v1';

/**
 * One-time rebuild after the table-level distances went back to 400 / 200 (owner, 2026-10-24). Ratings are derived from the
 * game history, so nothing but `players.elo` changes; a failed rebuild is repeated by the next completed game.
 */
export async function applyEloTableLevelMigration(db: DatabaseWrapper): Promise<{ applied: boolean }> {
  const existing = await db.get<{ status?: string }>(
    'SELECT status FROM migration_history WHERE migration_name = ? LIMIT 1', [MIGRATION_NAME],
  );
  if (existing?.status === 'completed') return { applied: false };
  await rebuildCanonicalEloRatings(db);
  await db.run(
    'INSERT INTO migration_history (id, migration_name, status, details_json, executed_at) VALUES (?, ?, ?, ?, ?)',
    [MIGRATION_NAME, MIGRATION_NAME, 'completed', JSON.stringify({ expectation_divisor: EXPECTATION_DIVISOR, protection_divisor: PROTECTION_DIVISOR }), new Date().toISOString()],
  );
  return { applied: true };
}
