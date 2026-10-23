/**
 * What a broken zero-round split does (owner, 2026-10-23; BUSINESS_RULES «Zero round»).
 * - `tournament`: the player voted out in the zero round leaves the table and gives a best move (ЛХ).
 * - `club`: the player the split was broken into stays at the table, gets 30 seconds of extra speech, then the night
 *   starts; no best move. A double revote that raises both players works as in a tournament.
 */
export type ZeroRoundRule = 'tournament' | 'club';

export const ZERO_ROUND_RULES: readonly ZeroRoundRule[] = ['club', 'tournament'];

export const ZERO_ROUND_RULE_LABELS: Record<ZeroRoundRule, string> = {
  club: 'Клубная',
  tournament: 'Турнирная',
};

export const CLUB_ZERO_ROUND_BREAK_SPEECH_SECONDS = 30;

export const isZeroRoundRule = (value: unknown): value is ZeroRoundRule => value === 'club' || value === 'tournament';

/** Tournament and rating evenings use the tournament rule; ordinary and novice evenings the club rule. */
export const defaultZeroRoundRule = (eveningFormat: unknown): ZeroRoundRule => {
  const format = String(eveningFormat ?? '').toUpperCase();
  return format.includes('RAT') || format.includes('TOUR') ? 'tournament' : 'club';
};
