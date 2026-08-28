import { rebuildCanonicalEloRatings } from './eloRatingService.ts';
import { reconcileRegularEveningPayments } from './eveningPaymentPricingService.ts';
import { evaluateAchievementsForPlayers } from './playerAchievementsService.ts';

type ClubGameStatus = 'draft' | 'completed';

type ClubGamePostSaveDependencies = {
  rebuildElo: typeof rebuildCanonicalEloRatings;
  evaluateAchievements: typeof evaluateAchievementsForPlayers;
  reconcilePayments?: typeof reconcileRegularEveningPayments;
};

export interface ClubGamePostSaveInput {
  gameId: number;
  eveningId?: string | null;
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
  reconcilePayments: reconcileRegularEveningPayments,
};

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

/**
 * Protocol + token settlement are the authoritative game save and are committed
 * before this function runs. Elo, achievements and evening pricing are derived
 * from that canonical save. A failure here must never turn an already committed
 * game into a failed final save on the client; later reconciliation heals it.
 */
export async function runClubGamePostSaveTasks(
  db: any,
  input: ClubGamePostSaveInput,
  dependencies: ClubGamePostSaveDependencies = defaultDependencies,
): Promise<ClubGamePostSaveResult> {
  const warnings: string[] = [];
  let eloReady = true;

  if (input.previousStatus === 'completed' || input.status === 'completed') {
    try {
      let eveningId = String(input.eveningId || '').trim();
      if (!eveningId) {
        const game = await db.get('SELECT evening_id FROM games WHERE id = ? LIMIT 1', [input.gameId]);
        eveningId = String(game?.evening_id || '').trim();
      }
      if (eveningId) {
        await (dependencies.reconcilePayments || reconcileRegularEveningPayments)(db, eveningId);
      }
    } catch (error) {
      warnings.push(`Оплата: ${errorMessage(error)}`);
    }

    try {
      await dependencies.rebuildElo(db);
    } catch (error) {
      eloReady = false;
      warnings.push(`Elo: ${errorMessage(error)}`);
    }
  }

  if (input.status === 'completed') {
    if (!eloReady) {
      // Rating achievements depend on the freshly rebuilt Elo. Skipping all
      // achievement evaluation is safer than permanently awarding against a
      // stale rating; a later successful rebuild/profile evaluation heals it.
      warnings.push('Достижения: пропущены до успешного пересчёта Elo');
    } else {
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
  }

  if (warnings.length) {
    console.error(`[club-game:${input.gameId}] canonical save committed; derived updates need reconciliation`, warnings);
  }

  return { warnings };
}
