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

  it('a black is judged by the wills of the dead reds: named black −0.2, named red +0.2', () => {
    expect(by(4).points).toBeCloseTo(-0.2 + 0.2, 6);
    expect(by(4).items.map((item) => item.kind).sort()).toEqual(['named_black', 'named_red']);
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

import { contributionLines } from '../server/services/clubResultData.ts';
import { contributionTextLines } from '../server/services/clubResultImages.ts';

describe('contribution breakdown on the game blank', () => {
  it('lists every action with its points and the usual for the role', () => {
    const lines = contributionLines([{ kind: 'found_black', seat: 9, points: 0.2 }, { kind: 'vote_red', seat: 7, points: -0.1 }], 0.1, 2);
    expect(lines).toEqual(['нашёл чёрного №9 +0,2', 'голос в красного №7 −0,1', 'обычно для роли −0,05']);
  });

  it('wraps a long list into short lines that start with the Elo', () => {
    const seat: any = { eloContribution: 12, contributionLines: Array.from({ length: 8 }, (_, i) => `завещание: №${i + 1} верно +0,2`) };
    const lines = contributionTextLines(seat);
    expect(lines[0].startsWith('Вклад +12 Эло:')).toBe(true);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((line) => line.length <= 74)).toBe(true);
  });
});

describe('found blacks count once each (owner, 2026-10-25)', () => {
  const roles = ['sheriff', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'mafia', 'mafia', 'don'];
  const results = roles.map((role, index) => ({ seat_number: index + 1, role, player_id: `p${index + 1}`, color_protocol: [] as any[] }));
  const day = (round: number, start: number, voted: number, votes: Array<[number, number]>) => [
    { seq: start, at: 'x', round, phase: 'day_voting', kind: 'nomination', seat: voted, by: 1 },
    ...votes.map(([seat, target], i) => ({ seq: start + 1 + i, at: 'x', round, phase: 'day_voting', kind: 'vote', seat, target })),
    { seq: start + 10, at: 'x', round, phase: 'day_voting', kind: 'vote_round_result', value: `1:${voted}` },
    { seq: start + 11, at: 'x', round, phase: 'day_voting', kind: 'exit', seat: voted, value: 'voted_day' },
  ];
  const events = [
    { seq: 1, at: 'x', round: 1, phase: 'zero_night', kind: 'game_start' },
    ...day(2, 10, 3, [[2, 8], [4, 3]]),
    ...day(3, 30, 9, [[2, 8], [4, 9]]),
  ];
  const by = (n: number) => gameContribution({ protocol: { winner_team: 'red', events }, player_results: results }).find((item) => item.seat === n)!;

  it('voting twice for the same black earns once', () => {
    expect(by(2).items.filter((item) => item.kind === 'found_black')).toHaveLength(1);
    expect(by(2).points).toBeCloseTo(0.2, 6);
  });

  it('a vote for a red costs, a different black earns again', () => {
    expect(by(4).points).toBeCloseTo(-0.1 + 0.2, 6);
  });

  it('votes against a black do not move his points', () => {
    expect(by(8).points).toBe(0);
  });
});
