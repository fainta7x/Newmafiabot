import type { DatabaseWrapper } from '../../db/index.ts';
import { decideGameStatsExclusion } from '../services/gameStatsExclusion.ts';
import { rebuildCanonicalEloRatings } from '../services/eloRatingService.ts';

const MIGRATION_NAME = '2026-11-22-guest-games-no-stats';

/**
 * Once after the rule «a game with a guest or a novice counts for nobody» shipped (owner, 2026-11-22): decide the games
 * already played (the evening of 20 November and later; older ones count as before) and rebuild Elo without them.
 */
export async function applyGuestGamesStatsExclusion(db: DatabaseWrapper): Promise<{ applied: boolean; excluded?: number }> {
  const existing = await db.get<{ status?: string }>('SELECT status FROM migration_history WHERE migration_name = ? LIMIT 1', [MIGRATION_NAME]);
  if (existing?.status === 'completed') return { applied: false };
  const excluded = await decideGameStatsExclusion(db);
  await rebuildCanonicalEloRatings(db);
  await db.run('INSERT INTO migration_history (id, migration_name, status, details_json, executed_at) VALUES (?, ?, ?, ?, ?)',
    [MIGRATION_NAME, MIGRATION_NAME, 'completed', JSON.stringify({ excluded }), new Date().toISOString()]);
  return { applied: true, excluded };
}
