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

  it('a right black +0.3, right reds +0.2 each; a black called red −0.4, a red called black −0.15', () => {
    expect(by(1).points).toBeCloseTo(0.3 + 0.2 + 0.2, 6);
    expect(by(5).points).toBeCloseTo(-0.4 - 0.15, 6);
  });

  it('a random guess is worth zero', () => {
    expect((1 / 3) * 0.3 + (2 / 3) * -0.15).toBeCloseTo(0, 6);
    expect((2 / 3) * 0.2 + (1 / 3) * -0.4).toBeCloseTo(0, 6);
  });

  it('a black mirrors the wills: named black −0.2, named red +0.2', () => {
    expect(by(4).points).toBeCloseTo(-0.2 + 0.2, 6);
  });
});

import { calculateCanonicalEloGame, CONTRIBUTION_CAP_ELO, normalizeContributions, type PreparedEloEvent } from '../server/services/eloRatingService.ts';

describe('contribution in Elo', () => {
  const event = (raws: Array<[string, string, number]>): PreparedEloEvent => ({
    source: 'club', sourceId: raws.map((r) => r[0]).join(), sortAt: '', sortOrder: 0, winnerTeam: 'red',
    players: raws.map(([playerId, role, raw]) => ({ playerId, team: role === 'mafia' ? 'black' : 'red', canonicalPersonalGamePoints: 0, contribution: { role, raw } })),
  });

  it('subtracts the role average, so an ordinary game is zero and the role sums to zero', () => {
    const events = [event([['a', 'citizen', 0.5], ['m', 'mafia', 0.1]]), event([['b', 'citizen', -0.1], ['n', 'mafia', 0.1]])];
    normalizeContributions(events);
    expect(events[0].players[0].contributionPoints).toBeCloseTo(0.3, 6);
    expect(events[1].players[0].contributionPoints).toBeCloseTo(-0.3, 6);
    expect(events[0].players[1].contributionPoints).toBeCloseTo(0, 6);
  });

  it('one game moves Elo by at most ±35', () => {
    const events = [event([['a', 'citizen', 3]]), event([['b', 'citizen', -3]])];
    normalizeContributions(events);
    expect(events[0].players[0].contributionPoints! * 40).toBeCloseTo(CONTRIBUTION_CAP_ELO, 6);
    expect(events[1].players[0].contributionPoints! * 40).toBeCloseTo(-CONTRIBUTION_CAP_ELO, 6);
  });

  it('is added on top of the result (1 point = 40 Elo)', () => {
    const players = Array.from({ length: 10 }, (_, i) => ({ playerId: `p${i}`, team: (i < 7 ? 'red' : 'black') as 'red' | 'black', elo: 1000, canonicalPersonalGamePoints: 0, contributionPoints: i === 0 ? 0.25 : 0 }));
    const [first, second] = calculateCanonicalEloGame(players, 'red');
    expect(first.contributionDelta).toBeCloseTo(10, 6);
    expect(first.totalDelta - second.totalDelta).toBeCloseTo(10, 6);
  });
});

import { contributionReason } from '../server/services/clubResultData.ts';

describe('contribution reason on the game blank', () => {
  it('names the part with the largest effect, in plain words', () => {
    expect(contributionReason('citizen', { votes: 0.1, colors: 0.6 }, 20)).toBe('верные цвета');
    expect(contributionReason('citizen', { votes: -0.4 }, -15)).toBe('голоса в красных');
    expect(contributionReason('mafia', { wills: -0.4, votes: -0.1 }, -20)).toBe('вычислили в завещаниях');
    expect(contributionReason('don', {}, 0)).toBeNull();
  });

  it('never gives a plus as the reason of a minus', () => {
    expect(contributionReason('sheriff', { checks: 0.2 }, -3)).toBe('меньше обычного для роли');
  });
});
