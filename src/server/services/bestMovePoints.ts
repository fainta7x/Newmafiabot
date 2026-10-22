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
