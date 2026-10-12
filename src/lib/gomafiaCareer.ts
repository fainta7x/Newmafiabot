import type { FederationGame } from './gomafiaExternalGames.ts';
import type { GoMafiaPublicSnapshot } from './gomafiaExternalProfile.ts';

export interface CareerAppearance {
  tournamentId: string;
  tournamentName: string;
  dateStart: string;
  dateEnd: string;
  location: string | null;
  place: number | null;
  totalScore: number | null;
  scoreRetrievedAt: string | null;
  scoreStatus: 'available' | 'unavailable' | 'refresh_failed' | 'not_checked';
  eloDelta: number | null;
  eloAfter: number | null;
  status: 'registered' | 'upcoming' | 'completed' | 'results_published' | 'unknown';
  sourceUrl: string;
  games: Array<FederationGame & { gameNumber: number; seat: number | null; eloDelta: number | null }>;
}
export interface GoMafiaCareer {
  tournaments: CareerAppearance[];
  yearlyStats: GoMafiaPublicSnapshot[];
  historyTotal: number;
  registrationsStatus: 'unavailable';
  limitations: string[];
}
