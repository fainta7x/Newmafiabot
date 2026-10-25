import { describe, expect, it } from 'vitest';
import { gameContribution } from '../lib/playerContribution.ts';

const seat = (n: number, role: string, color_protocol: any[] = []) => ({ seat_number: n, role, player_id: `p${n}`, color_protocol });

describe('player contribution (colour protocol part)', () => {
  const envelope = {
    protocol: { winner_team: 'red', events: [] },
    player_results: [
      seat(1, 'citizen', [{ mark: 'black', seat_numbers: [4] }, { mark: 'red', seat_numbers: [2, 3] }]),
      seat(2, 'citizen'), seat(3, 'citizen'),
      seat(4, 'mafia'),
      seat(5, 'citizen', [{ mark: 'red', seat_numbers: [4] }, { mark: 'black', seat_numbers: [2] }]),
    ],
  };
  const by = (n: number) => gameContribution(envelope).find((item) => item.seat === n)!;

  it('a right black +0.3, right reds +0.2 each, a wrong colour −0.1', () => {
    expect(by(1).points).toBeCloseTo(0.3 + 0.2 + 0.2, 6);
    expect(by(5).points).toBeCloseTo(-0.1 - 0.1, 6);
  });

  it('a black is +0.1 per red who marked him red and −0.1 per red who marked him black', () => {
    expect(by(4).points).toBeCloseTo(0.1 - 0.1, 6);
  });
});
