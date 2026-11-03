import { describe, expect, it } from 'vitest';
import { planEveningSeats, type EveningSeatCandidate } from '../lib/eveningSeating';

// Owner, 2026-11-03 (evening 3.11): the seating came out in pairs and game 4 had a free seat although 11 players were registered.
const seats = (games: number[], table = 't1'): EveningSeatCandidate[] => games.flatMap((game) => Array.from({ length: 10 }, (_, i) => ({ game, tableId: table, seat: i + 1 })));
const players = Array.from({ length: 11 }, (_, i) => ({ id: `p${i + 1}`, eligibleGames: [2, 3, 4, 5, 6] }));
const seeded = (seed: number) => () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

describe('evening seating is random, full and without repeated seats', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('seed %i: every game is full, nobody repeats a seat, participation is balanced', (seed) => {
    const plan = planEveningSeats(seats([2, 3, 4, 5, 6]), players, [], 10, seeded(seed));
    for (const game of [2, 3, 4, 5, 6]) {
      const inGame = plan.filter((s) => s.game === game);
      expect(inGame.length).toBe(10);
      expect(new Set(inGame.map((s) => s.playerId)).size).toBe(10);
    }
    for (const player of players) {
      const own = plan.filter((s) => s.playerId === player.id).map((s) => s.seat);
      expect(new Set(own).size).toBe(own.length);
    }
    const counts = players.map((player) => plan.filter((s) => s.playerId === player.id).length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it('is not the same «pairs» order every time', () => {
    const lineup = (seed: number) => planEveningSeats(seats([2, 3]), players, [], 10, seeded(seed)).map((s) => `${s.game}:${s.seat}:${s.playerId}`).join(',');
    expect(new Set([1, 2, 3, 4, 5].map(lineup)).size).toBeGreaterThan(1);
    // Neighbours of game 2 are not simply swapped pairwise in game 3.
    const plan = planEveningSeats(seats([2, 3]), players, [], 10, seeded(11));
    const at = (game: number, seat: number) => plan.find((s) => s.game === game && s.seat === seat)?.playerId;
    const swappedPairs = [1, 3, 5, 7, 9].filter((seat) => at(2, seat) === at(3, seat + 1) && at(2, seat + 1) === at(3, seat)).length;
    expect(swappedPairs).toBeLessThan(5);
  });

  it('keeps reservations and fills around them', () => {
    const reserved = [{ game: 2, tableId: 't1', seat: 7, playerId: 'p3', locked: true }];
    const plan = planEveningSeats(seats([2]), players, reserved, 10, seeded(3));
    expect(plan.find((s) => s.game === 2 && s.seat === 7)?.playerId).toBe('p3');
    expect(plan.filter((s) => s.game === 2).length).toBe(10);
  });
});
