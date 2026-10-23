import type { StatGame } from './gameStatistics.ts';
import { zeroRoundBreakerSeat } from '../shared/liveGameEvents.ts';

export interface ZeroRoundPlayerCounts { broke: number; raised: number }

/** Counts confirmed zero-circle outcomes, never guesses the player who broke a split from votes alone. */
export function buildZeroRoundPlayerCounts(games: StatGame[]): Map<string, ZeroRoundPlayerCounts> {
  const totals = new Map<string, ZeroRoundPlayerCounts>();
  const add = (id: string, kind: keyof ZeroRoundPlayerCounts) => {
    const entry = totals.get(id) ?? { broke: 0, raised: 0 };
    entry[kind] += 1;
    totals.set(id, entry);
  };
  for (const game of games) {
    const seatToPlayer = new Map(game.seats.filter(seat => seat.playerId).map(seat => [seat.seat, seat.playerId!]));
    const breaker = zeroRoundBreakerSeat(game.events);
    const breakerId = breaker === null ? undefined : seatToPlayer.get(breaker);
    if (breakerId) add(breakerId, 'broke');

    // "Raised in zero" = two players eliminated together after a double revote.
    const raised = new Set<number>();
    for (const round of game.votingRounds || []) {
      if (round.day_number !== 0 || !round.is_revote || round.outcome !== 'all_tied_eliminated') continue;
      const eliminated = [...new Set(round.eliminated_seats || [])];
      if (eliminated.length !== 2) continue;
      const parent = game.votingRounds?.find(item => item.round_number === round.parent_round_number);
      if (!parent?.is_revote || parent.day_number !== 0) continue;
      for (const seat of eliminated) raised.add(seat);
    }
    for (const seat of raised) {
      const playerId = seatToPlayer.get(seat);
      if (playerId) add(playerId, 'raised');
    }
  }
  return totals;
}
