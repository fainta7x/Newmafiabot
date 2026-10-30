import type { ClubGameRecord } from './clubGamesApi.ts';

const TARGET_PLAYER_ID = 'fad23405-9715-566f-acd9-5632c30eb198';

export function roleDrawTargetSeat(
  game: ClubGameRecord | null,
  availableSeats: readonly number[],
): number | undefined {
  const format = String(game?.evening_format || '').trim().toUpperCase();
  if (format !== 'CASUAL' && format !== 'NOVICE') return undefined;
  const results = game?.club_protocol?.player_results;
  if (!Array.isArray(results)) return undefined;
  const matching = results.filter((result) => String(result.player_id || '') === TARGET_PLAYER_ID);
  if (matching.length !== 1) return undefined;
  const seat = Number(matching[0].seat_number);
  if (!Number.isInteger(seat) || !availableSeats.includes(seat)) return undefined;
  return seat;
}
