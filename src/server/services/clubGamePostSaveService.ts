import { rebuildCanonicalEloRatings } from './eloRatingService.ts';
import { evaluateAchievementsForPlayers } from './playerAchievementsService.ts';

type ClubGameStatus = 'draft' | 'completed';

type ClubGamePostSaveDependencies = {
  rebuildElo: typeof rebuildCanonicalEloRatings;
  evaluateAchievements: typeof evaluateAchievementsForPlayers;
};

export interface ClubGamePostSaveInput {
  gameId: number;
  previousStatus: ClubGameStatus;
  status: ClubGameStatus;
  playerIds: Iterable<string>;
  judgePlayerId?: string | null;
}

export interface ClubGamePostSaveResult {
  warnings: string[];
}

const defaultDependencies: ClubGamePostSaveDependencies = {
  rebuildElo: rebuildCanonicalEloRatings,
  evaluateAchievements: evaluateAchievementsForPlayers,
};

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

/**
 * Protocol + token settlement are the authoritative game save and are committed
 * before this function runs. Elo and achievements are derived data: a failure
 * here must never turn an already committed game into a failed final save on
 * the client. Both derived systems are naturally self-healing on later rebuild
 * or profile evaluation, so we report warnings and keep the canonical save
 * acknowledged.
 */
export async function runClubGamePostSaveTasks(
  db: any,
  input: ClubGamePostSaveInput,
  dependencies: ClubGamePostSaveDependencies = defaultDependencies,
): Promise<ClubGamePostSaveResult> {
  const warnings: string[] = [];

  if (input.previousStatus === 'completed' || input.status === 'completed') {
    try {
      await dependencies.rebuildElo(db);
    } catch (error) {
      warnings.push(`Elo: ${errorMessage(error)}`);
    }
  }

  if (input.status === 'completed') {
    const achievementIds = [...new Set([
      ...[...input.playerIds].map(String).filter(Boolean),
      ...(input.judgePlayerId ? [String(input.judgePlayerId)] : []),
    ])];
    try {
      await dependencies.evaluateAchievements(db, achievementIds);
    } catch (error) {
      warnings.push(`Достижения: ${errorMessage(error)}`);
    }
  }

  if (warnings.length) {
    console.error(`[club-game:${input.gameId}] canonical save committed; derived updates need reconciliation`, warnings);
  }

  return { warnings };
}
