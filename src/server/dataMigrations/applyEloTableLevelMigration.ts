import { MISSED_SHOT_ELO } from '../../lib/eloMissPenalty.ts';
import type { DatabaseWrapper } from '../../db/index.ts';
import { SAME_LEVEL_GAP, STRONG_LEVEL_GAP, rebuildCanonicalEloRatings } from '../services/eloRatingService.ts';
import { ELO_DISCIPLINE_POINT_WEIGHT, ELO_PERSONAL_CAP, ELO_PERSONAL_POINT_WEIGHT } from '../../shared/eloWeights.ts';

const MIGRATION_NAME = '2026-10-elo-find-credit-v4';

/**
 * One-time rebuild for the owner-approved team/protection and personal balance (2026-10-25). Ratings are derived from the
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
    [MIGRATION_NAME, MIGRATION_NAME, 'completed', JSON.stringify({ same_level_gap: SAME_LEVEL_GAP, strong_level_gap: STRONG_LEVEL_GAP,
      personal_point_weight: ELO_PERSONAL_POINT_WEIGHT, find_cap_elo: 8, will_red_elo: 2, protocol_bonus_in_elo: false, tournament_will_colours: true,
      miss_elo: MISSED_SHOT_ELO, miss_outside_personal_limits: true, max_streak_multiplier: 1.5, personal_cap: ELO_PERSONAL_CAP, discipline_point_weight: ELO_DISCIPLINE_POINT_WEIGHT }), new Date().toISOString()],
  );
  return { applied: true };
}



