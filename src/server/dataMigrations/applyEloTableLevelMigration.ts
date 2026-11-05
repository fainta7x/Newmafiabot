import { MISSED_SHOT_ELO } from '../../lib/eloMissPenalty.ts';
import type { DatabaseWrapper } from '../../db/index.ts';
import { SAME_LEVEL_GAP, STRONG_LEVEL_GAP, rebuildCanonicalEloRatings } from '../services/eloRatingService.ts';
import { ELO_DISCIPLINE_POINT_WEIGHT, ELO_PERSONAL_CAP, ELO_PERSONAL_POINT_WEIGHT } from '../../shared/eloWeights.ts';

const MIGRATION_NAME = '2026-11-elo-will-streak-v5';

/** Rebuild ratings from the full canonical game history once for this scoring version. */
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
      miss_elo: MISSED_SHOT_ELO, miss_outside_personal_limits: true, streak_step_elo: 2, will_streak_step_elo: 2, personal_cap: ELO_PERSONAL_CAP, discipline_point_weight: ELO_DISCIPLINE_POINT_WEIGHT }), new Date().toISOString()],
  );
  return { applied: true };
}



