import { describe, expect, it } from 'vitest';
import { planEveningSeats, seatingWarnings, usedSeatsInCurrentCycle } from '../lib/eveningSeating.ts';

describe('evening seating rotation', () => {
  it('allows the same seat at different tables, but not at the same table', () => {
    const history = [{ game: 1, tableId: 'a', seat: 10, playerId: 'p', started: true }];
    expect(seatingWarnings({ game: 2, tableId: 'b', seat: 10, playerId: 'p' }, history, [2])).toEqual([]);
    expect(seatingWarnings({ game: 2, tableId: 'a', seat: 10, playerId: 'p' }, history, [2])
      .some((warning) => warning.code === 'repeat_seat')).toBe(true);
  });
  it('starts another cycle after ten actual seat numbers', () => {
    const history = Array.from({ length: 10 }, (_, index) =>
      ({ game: index + 1, tableId: 'a', seat: index + 1, playerId: 'p', started: true }));
    expect(usedSeatsInCurrentCycle('p', 'a', history).size).toBe(0);
    expect(seatingWarnings({ game: 11, tableId: 'a', seat: 1, playerId: 'p' }, history, [11])).toEqual([]);
  });
  it('keeps advance reservations and balances the remaining positions', () => {
    const plan = planEveningSeats(
      [{ game: 1, tableId: 'a', seat: 1 }, { game: 1, tableId: 'a', seat: 2 },
       { game: 2, tableId: 'a', seat: 1 }, { game: 2, tableId: 'a', seat: 2 }],
      [{ id: 'p', eligibleGames: [1, 2] }, { id: 'q', eligibleGames: [1, 2] }],
      [{ game: 1, tableId: 'a', seat: 2, playerId: 'p', locked: true }],
    );
    expect(plan.find((seat) => seat.game === 1 && seat.seat === 2)?.playerId).toBe('p');
    expect(plan.filter((seat) => seat.playerId === 'p')).toHaveLength(2);
    expect(plan.filter((seat) => seat.playerId === 'q')).toHaveLength(2);
    expect(plan.filter((seat) => seat.game === 2).map((seat) => seat.seat)).toEqual([1, 2]);
  });
  it('releases a changed future seat instead of retaining phantom history', () => {
    const future = [{ game: 3, tableId: 'a', seat: 10, playerId: 'p', started: false }];
    expect(seatingWarnings({ game: 4, tableId: 'a', seat: 10, playerId: 'p' }, future, [4])
      .some((warning) => warning.code === 'repeat_seat')).toBe(true);
    expect(seatingWarnings({ game: 4, tableId: 'a', seat: 10, playerId: 'p' }, [], [4])).toEqual([]);
  });
});
