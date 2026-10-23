import { gameTeamOfRole } from '../../shared/gameRoles.ts';
// The best-move («ЛХ») bonus, shared by protocol routes and rating/result services.
export function calculateBestMovePoints(
  bestMoveSeats: number[],
  seats: Array<{ seat_number: number; role: string | null }>
): { guessedBlacks: number; bonusPoints: number } {
  if (!bestMoveSeats || bestMoveSeats.length === 0) {
    return { guessedBlacks: 0, bonusPoints: 0 };
  }

  const teams = new Map<number, string | null>(seats.map((s) => [s.seat_number, gameTeamOfRole(s.role)]));

  let guessedBlacks = 0;
  for (const seatNum of bestMoveSeats) {
    if (teams.get(seatNum) === 'black') guessedBlacks++;
  }

  let bonusPoints = 0;
  if (guessedBlacks === 1) bonusPoints = 0.1;
  else if (guessedBlacks === 2) bonusPoints = 0.3;
  else if (guessedBlacks >= 3) bonusPoints = 0.6;

  return { guessedBlacks, bonusPoints };
}

/** ЛХ points of seat numbers given as the protocol's player results (seat_number + role). */
const bestMovePointsOfSeats = (seatNumbers: unknown, results: any[]): number => (Array.isArray(seatNumbers)
  ? calculateBestMovePoints(seatNumbers.map(Number), results.map((result: any) => ({ seat_number: Number(result?.seat_number), role: result?.role ?? null }))).bonusPoints
  : 0);

/**
 * A participant's best-move points in a club protocol, from either source: the first player killed at night or the
 * player voted out in the zero round (owner, 2026-10-23: both count for Elo and for tokens). Legacy single-move fields
 * are read when the protocol has no list.
 */
export function clubBestMovePointsForParticipant(protocol: any, participantId: string, results: any[]): number {
  if (!participantId) return 0;
  const modern = Array.isArray(protocol?.best_moves) ? protocol.best_moves : [];
  const relevant = modern.filter((move: any) => String(move?.participant_id || '') === participantId);
  if (relevant.length) return relevant.reduce((sum: number, move: any) => sum + bestMovePointsOfSeats(move?.seat_numbers, results), 0);
  if (String(protocol?.best_move_participant_id || '') === participantId) return bestMovePointsOfSeats(protocol?.best_move_seats, results);
  return 0;
}

