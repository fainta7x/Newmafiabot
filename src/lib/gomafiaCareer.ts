import type { FederationGame } from './gomafiaExternalGames.ts';
import type { GoMafiaPublicSnapshot } from './gomafiaExternalProfile.ts';

export type GoMafiaNominationKey = 'best_red' | 'best_mafia' | 'best_don' | 'best_sheriff' | 'mvp';
export const GOMAFIA_NOMINATIONS: Record<GoMafiaNominationKey, string> = {
  best_red: 'Лучший мирный', best_mafia: 'Лучший чёрный', best_don: 'Лучший дон', best_sheriff: 'Лучший шериф', mvp: 'MVP турнира',
};

export interface CareerAppearance {
  tournamentId: string;
  tournamentName: string;
  dateStart: string;
  dateEnd: string;
  location: string | null;
  place: number | null;
  /** Published participant count, null when the source has not confirmed it. */
  participantCount?: number | null;
  totalScore: number | null;
  scoreRetrievedAt: string | null;
  scoreStatus: 'available' | 'unavailable' | 'refresh_failed' | 'not_checked';
  eloDelta: number | null;
  eloAfter: number | null;
  status: 'registered' | 'upcoming' | 'completed' | 'results_published' | 'unknown';
  sourceUrl: string;
  /** Nominations of the tournament page in which this player's exact federation ID is named (rank = position in the published list). */
  nominationsStatus?: 'available' | 'unavailable' | 'hidden';
  nominations?: Array<{ key: GoMafiaNominationKey; rank: number }>;
  games: Array<FederationGame & { gameNumber: number; seat: number | null; externalTableId: string | null; scoreRetrievedAt: string | null; eloDelta: number | null }>;
}
export interface GoMafiaCareer {
  tournaments: CareerAppearance[];
  yearlyStats: GoMafiaPublicSnapshot[];
  historyTotal: number;
  registrationsStatus: 'unavailable';
  limitations: string[];
}

/** Unknown size is not quietly classified as a ten-person event. */
export function classifyGoMafiaTournamentSize(count: number | null | undefined): 'large' | 'ten' | 'other' | 'unknown' {
  if (typeof count !== 'number' || !Number.isInteger(count) || count <= 0) return 'unknown';
  return count > 10 ? 'large' : count === 10 ? 'ten' : 'other';
}
