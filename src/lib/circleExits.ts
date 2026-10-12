import { gameActionFacts, type ActionFactsMemo } from './gameActionFacts';
import type { StatGame } from './gameStatistics';

/**
 * «На каком круге уходишь» (owner idea, 2026-10-12): the day on which a player was voted out, by the number of players
 * alive when the vote was decided (9, 7, 5 …) and whether it was a critical circle (`isCriticalCircle`). Only days whose
 * decision is certain are counted (the same conservative evidence as the vote statistics): the zero day, ties and table
 * decisions are left out. Pure and read-only.
 */

export interface PlayerCircleExits {
  /** Games as a seated player with a full chronology (the sample for «чаще всего»). */
  games: number;
  votedOut: number;
  /** Voted out on a day with this many alive (key = alive count). */
  byAlive: Record<number, number>;
  critical: number;
}
const empty = (): PlayerCircleExits => ({ games: 0, votedOut: 0, byAlive: {}, critical: 0 });

export function buildCircleExits(games: StatGame[], memo?: ActionFactsMemo): Map<string, PlayerCircleExits> {
  const players = new Map<string, PlayerCircleExits>();
  const of = (id: string) => { let value = players.get(id); if (!value) { value = empty(); players.set(id, value); } return value; };
  const seen = new Set<string>();
  for (const game of games) {
    if (seen.has(game.id) || !Array.isArray(game.events) || !game.events.length) continue;
    seen.add(game.id);
    const facts = gameActionFacts(game, memo);
    if (!facts.full) continue;
    for (const seat of game.seats) if (seat.playerId) of(seat.playerId).games += 1;
    for (const voting of facts.votings) {
      if (voting.eliminated === null || !voting.alive) continue;
      const seat = game.seats.find((item) => item.seat === voting.eliminated);
      if (!seat?.playerId) continue;
      const stats = of(seat.playerId);
      stats.votedOut += 1;
      const alive = voting.alive.size;
      stats.byAlive[alive] = (stats.byAlive[alive] || 0) + 1;
      if (voting.critical === true) stats.critical += 1;
    }
  }
  return players;
}
