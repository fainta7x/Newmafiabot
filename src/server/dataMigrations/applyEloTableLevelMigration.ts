import type { DatabaseWrapper } from '../../db/index.ts';
import { SAME_LEVEL_GAP, STRONG_LEVEL_GAP, rebuildCanonicalEloRatings } from '../services/eloRatingService.ts';

const MIGRATION_NAME = '2026-10-elo-table-level-400-v1';

/**
 * One-time rebuild after the table level became three steps (same up to 150, different 150–250, huge above 250) (owner, 2026-10-24). Ratings are derived from the
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
    [MIGRATION_NAME, MIGRATION_NAME, 'completed', JSON.stringify({ same_level_gap: SAME_LEVEL_GAP, strong_level_gap: STRONG_LEVEL_GAP }), new Date().toISOString()],
  );
  return { applied: true };
}
