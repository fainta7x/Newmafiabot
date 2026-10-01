import type { DatabaseWrapper } from './index.ts';
import { DEFAULT_ELO_SEED } from './ensureEloSeedSchema.ts';
import { ELO_SCALE, rebuildCanonicalEloRatings } from '../server/services/eloRatingService.ts';

const MIGRATION_NAME = '0042_elo_scale_x5_v1';

/**
 * One-time switch to the ×5 Elo scale (owner, 2026-10-01): a manual start Elo keeps its meaning,
 * so its distance from 1000 is stretched five times; then every rating is rebuilt from the game
 * history at once instead of waiting for the next game.
 */
export async function applyEloScaleMigration(db: DatabaseWrapper): Promise<{ applied: boolean; seedsScaled: number }> {
  const existing = await db.get<{ status?: string }>(
    'SELECT status FROM migration_history WHERE migration_name = ? LIMIT 1', [MIGRATION_NAME],
  );
  if (existing?.status === 'completed') return { applied: false, seedsScaled: 0 };

  let seedsScaled = 0;
  await db.transaction(async (tx) => {
    const result = await tx.run(
      `UPDATE players SET elo_seed = MAX(0, MIN(10000, ? + (elo_seed - ?) * ?))
        WHERE elo_seed IS NOT NULL AND elo_seed != ?`,
      [DEFAULT_ELO_SEED, DEFAULT_ELO_SEED, ELO_SCALE, DEFAULT_ELO_SEED],
    );
    seedsScaled = Number(result.changes || 0);
    await tx.run(
      'INSERT INTO migration_history (id, migration_name, status, details_json, executed_at) VALUES (?, ?, ?, ?, ?)',
      [MIGRATION_NAME, MIGRATION_NAME, 'completed', JSON.stringify({ scale: ELO_SCALE, seeds_scaled: seedsScaled }), new Date().toISOString()],
    );
  });
  // The ratings are derived data: a failed rebuild is repeated by the next completed game.
  try { await rebuildCanonicalEloRatings(db); } catch (error) { console.error('[ELO] Rebuild after the ×5 scale switch failed:', error); }
  return { applied: true, seedsScaled };
}
