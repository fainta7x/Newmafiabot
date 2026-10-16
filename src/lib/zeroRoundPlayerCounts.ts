import type { StatGame } from './gameStatistics.ts';
import { buildGameAnalysis } from './liveGameAnalysis.ts';

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
    const breaks = new Set<number>();
    for (const event of game.events || []) {
      if (event.kind === 'zero_round_break' && event.round === 1 && event.seat) breaks.add(event.seat);
    }
    for (const seat of breaks) {
      const playerId = seatToPlayer.get(seat);
      if (playerId) add(playerId, 'broke');
    }

    const raised = new Set<number>();
    const zero = buildGameAnalysis(game.events || []).circles.find(circle => circle.round === 1);
    // The first vote's tied leaders were actually raised for an additional vote.
    const initial = zero?.votings.find(vote => vote.number === 1);
    if (initial && initial.votes.length >= 2 && (initial.outcome || '').includes('tie')) {
      const max = Math.max(...initial.votes.map(vote => vote.voters.length));
      if (max > 0) for (const vote of initial.votes) if (vote.voters.length === max) raised.add(vote.candidate);
    }
    // Completed tournament protocols may include only voting snapshots, not a live event log.
    const first = game.votingRounds?.find(vote => vote.day_number === 0 && !vote.is_revote && vote.outcome === 'tie_revote');
    if (first) {
      const max = Math.max(0, ...first.nominated_seats.map(seat => Number(first.vote_counts?.[seat] || 0)));
      if (max > 0) for (const seat of first.nominated_seats) if (Number(first.vote_counts?.[seat] || 0) === max) raised.add(seat);
    }
    for (const seat of raised) {
      const playerId = seatToPlayer.get(seat);
      if (playerId) add(playerId, 'raised');
    }
  }
  return totals;
}
