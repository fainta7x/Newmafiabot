// Protocol role names and the best-move («ЛХ») bonus, shared by protocol routes and rating/result services.
export function normalizeRole(r: string | null | undefined): string | null {
  if (!r) return null;
  const lower = r.trim().toLowerCase();
  if (['citizen', 'мирный', 'мирный житель', 'red', 'красный'].includes(lower)) return 'citizen';
  if (['sheriff', 'шериф'].includes(lower)) return 'sheriff';
  if (['mafia', 'мафия', 'black', 'черный'].includes(lower)) return 'mafia';
  if (['don', 'дон'].includes(lower)) return 'don';
  return lower;
}

export function calculateBestMovePoints(
  bestMoveSeats: number[],
  seats: Array<{ seat_number: number; role: string | null }>
): { guessedBlacks: number; bonusPoints: number } {
  if (!bestMoveSeats || bestMoveSeats.length === 0) {
    return { guessedBlacks: 0, bonusPoints: 0 };
  }

  const roleMap = new Map<number, string>();
  for (const s of seats) {
    const r = normalizeRole(s.role);
    if (r) roleMap.set(s.seat_number, r);
  }

  let guessedBlacks = 0;
  for (const seatNum of bestMoveSeats) {
    const r = roleMap.get(seatNum);
    if (r === 'mafia' || r === 'don') {
      guessedBlacks++;
    }
  }

  let bonusPoints = 0;
  if (guessedBlacks === 1) bonusPoints = 0.1;
  else if (guessedBlacks === 2) bonusPoints = 0.3;
  else if (guessedBlacks >= 3) bonusPoints = 0.6;

  return { guessedBlacks, bonusPoints };
}
