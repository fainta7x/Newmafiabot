import { describe, expect, it } from 'vitest';
import { gameContribution } from '../lib/playerContribution.ts';
import { ELO_PERSONAL_POINT_WEIGHT } from '../shared/eloWeights.ts';

const seat = (n: number, role: string, color_protocol: any[] = []) => ({ seat_number: n, role, player_id: `p${n}`, color_protocol, exit_type: color_protocol.length ? 'killed' : 'alive' });

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

  it('one will is one decision: its colours add no series by themselves (owner, 2026-10-26)', () => {
    expect(by(1).points).toBeCloseTo(0.3 + 0.2 + 0.2, 6);
    expect(by(5).points).toBeCloseTo(-0.4 - 0.15, 6);
  });

  it('the base price of a single random colour guess is zero before the stricter will policy', () => {
    expect((1 / 3) * 0.3 + (2 / 3) * -0.15).toBeCloseTo(0, 6);
    expect((2 / 3) * 0.2 + (1 / 3) * -0.4).toBeCloseTo(0, 6);
  });

  it('a black is judged by the wills of the dead reds: named black −0.2, named red +0.3', () => {
    expect(by(4).points).toBeCloseTo(-0.2 + 0.3, 6);
    expect(by(4).items.map((item) => item.kind).sort()).toEqual(['named_black', 'named_red']);
  });
});

import { calculateCanonicalEloGame, CONTRIBUTION_CAP_ELO, normalizeContributions, type PreparedEloEvent } from '../server/services/eloRatingService.ts';

describe('contribution in Elo', () => {
  const event = (raws: Array<[string, string, number]>): PreparedEloEvent => ({
    source: 'club', sourceId: raws.map((r) => r[0]).join(), sortAt: '', sortOrder: 0, winnerTeam: 'red',
    players: raws.map(([playerId, role, raw]) => ({ playerId, team: role === 'mafia' ? 'black' : 'red', canonicalPersonalGamePoints: 0, contribution: { role, raw } })),
  });

  it('keeps every found black as praise: no role adjustment', () => {
    const events = [event([['a', 'citizen', 0.5], ['m', 'mafia', 0.1]]), event([['b', 'citizen', -0.1], ['n', 'mafia', 0.1]])];
    normalizeContributions(events);
    expect(events[0].players[0].contributionPoints).toBeCloseTo(0.5, 6);
    expect(events[1].players[0].contributionPoints).toBeCloseTo(-0.1, 6);
    expect(events[0].players[1].contributionPoints).toBeCloseTo(0.1, 6);
  });

  it('the automatic contribution is capped at ±10 per game', () => {
    const events = [event([['a', 'citizen', 3]]), event([['b', 'citizen', -3]])];
    normalizeContributions(events);
    expect(events[0].players[0].contributionPoints! * ELO_PERSONAL_POINT_WEIGHT).toBeCloseTo(CONTRIBUTION_CAP_ELO, 6);
    expect(events[1].players[0].contributionPoints! * ELO_PERSONAL_POINT_WEIGHT).toBeCloseTo(-CONTRIBUTION_CAP_ELO, 6);
  });

  it('is added on top of the result (1 point = 40 Elo)', () => {
    const players = Array.from({ length: 10 }, (_, i) => ({ playerId: `p${i}`, team: (i < 7 ? 'red' : 'black') as 'red' | 'black', elo: 1000, canonicalPersonalGamePoints: 0, contributionPoints: i === 0 ? 0.25 : 0 }));
    const [first, second] = calculateCanonicalEloGame(players, 'red');
    expect(first.contributionDelta).toBeCloseTo(10, 6);
    expect(first.totalDelta - second.totalDelta).toBeCloseTo(10, 6);
  });
});

import { contributionBreakdown } from '../lib/playerContribution.ts';
import { contributionTextLines } from '../server/services/clubResultImages.ts';

describe('contribution breakdown on the game blank, in plain words and Elo', () => {
  it('groups a red seat by kind of action', () => {
    const lines = contributionBreakdown('citizen', [
      { kind: 'found_black', seat: 10, points: 0.2 }, { kind: 'found_black', seat: 1, points: 0.2 },
      { kind: 'vote_red', seat: 2, points: -0.2, critical: true },
      { kind: 'will_right', seat: 8, points: 0.3 }, { kind: 'will_wrong', seat: 5, points: -0.4 },
    ]);
    expect(lines).toEqual([
      'Голосовал в чёрных №10, №1: +16',
      'Голосовал в красных №2: −8',
      'В завещании угадал №8: +12',
      'В завещании ошибся в №5: −16',
    ]);
  });

  it('a repeated vote for the same red is written once with the count', () => {
    expect(contributionBreakdown('citizen', [{ kind: 'vote_red', seat: 4, points: -0.1 }, { kind: 'vote_red', seat: 4, points: -0.1 }, { kind: 'vote_red', seat: 3, points: -0.1 }])).toEqual(['Голосовал в красных №4 (2 раза), №3: −12']);
  });

  it('a black reads by the wills of the dead', () => {
    expect(contributionBreakdown('mafia', [{ kind: 'named_red', seat: 5, points: 0.2 }, { kind: 'not_named', seat: 3, points: 0.1 }])).toEqual([
      'Записан красным у №5: +8',
      'Не записан у №3: +4',
    ]);
    expect(contributionBreakdown('don', [{ kind: 'named_black', seat: 5, points: -0.2 }])).toEqual(['Записан чёрным у №5: −8']);
  });

  it('starts with the Elo and keeps every line short', () => {
    const seat: any = { eloContribution: 12, contributionLines: [Array.from({ length: 8 }, (_, i) => `угадал №${i + 1} +8`).join(' · ')] };
    const lines = contributionTextLines(seat);
    expect(lines[0]).toBe('За действия в игре: +12 Эло');
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.every((line) => line.length <= 74)).toBe(true);
  });
});

describe('found blacks count once each (owner, 2026-10-25)', () => {
  const roles = ['sheriff', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'mafia', 'mafia', 'don'];
  const results = roles.map((role, index) => ({ seat_number: index + 1, role, player_id: `p${index + 1}`, color_protocol: [] as any[] }));
  const day = (round: number, start: number, voted: number, votes: Array<[number, number]>) => [
    { seq: start, at: 'x', round, phase: 'day_voting', kind: 'nomination', seat: voted, by: 1 },
    ...votes.map(([seat, target], i) => ({ seq: start + 1 + i, at: 'x', round, phase: 'day_voting', kind: 'vote', seat, target })),
    { seq: start + 10, at: 'x', round, phase: 'day_voting', kind: 'vote_round_result', value: '1:single_eliminated' },
    { seq: start + 11, at: 'x', round, phase: 'day_voting', kind: 'exit', seat: voted, value: 'voted_day' },
  ];
  const events = [
    { seq: 1, at: 'x', round: 1, phase: 'zero_night', kind: 'game_start' },
    ...day(2, 10, 3, [[2, 8], [4, 3]]),
    ...day(3, 30, 9, [[2, 8], [4, 9]]),
  ];
  const by = (n: number) => gameContribution({ protocol: { winner_team: 'red', events }, player_results: results }).find((item) => item.seat === n)!;

  it('voting twice for the same black earns once; a black never voted out earns half', () => {
    expect(by(2).items.filter((item) => item.kind === 'found_black')).toHaveLength(1);
    expect(by(2).points).toBeCloseTo(0.1, 6);
  });

  it('a vote for a red who left in that voting costs twice; a black voted out earns in full', () => {
    expect(by(4).points).toBeCloseTo(-0.2 + 0.2, 6);
  });

  it('votes against a black do not move his points', () => {
    expect(by(8).points).toBe(0);
  });

  it('a voting that ends in a revote, with nobody or several leaving, is not counted (possible agreed split)', () => {
    const tie = [
      { seq: 1, at: 'x', round: 1, phase: 'zero_night', kind: 'game_start' },
      { seq: 10, at: 'x', round: 2, phase: 'day_voting', kind: 'nomination', seat: 3, by: 1 },
      { seq: 11, at: 'x', round: 2, phase: 'day_voting', kind: 'vote', seat: 2, target: 8 },
      { seq: 12, at: 'x', round: 2, phase: 'day_voting', kind: 'vote', seat: 4, target: 3 },
      { seq: 13, at: 'x', round: 2, phase: 'day_voting', kind: 'vote_round_result', value: '1:tie_revote' },
      { seq: 14, at: 'x', round: 2, phase: 'day_voting', kind: 'vote', seat: 2, target: 3 },
      { seq: 15, at: 'x', round: 2, phase: 'day_voting', kind: 'vote', seat: 4, target: 3 },
      { seq: 16, at: 'x', round: 2, phase: 'day_voting', kind: 'vote_round_result', value: '2:single_eliminated' },
      { seq: 17, at: 'x', round: 2, phase: 'day_voting', kind: 'exit', seat: 3, value: 'voted_day' },
    ];
    const seat = (n: number) => gameContribution({ protocol: { winner_team: 'red', events: tie }, player_results: results }).find((item) => item.seat === n)!;
    // seat 2's vote for black 8 was in the tied voting: it is not a found black
    expect(seat(2).items.some((item) => item.kind === 'found_black')).toBe(false);
  });
});

import { tableLevelText } from '../server/services/clubResultData.ts';
import { gameBlankSvg } from '../server/services/clubResultImages.ts';

describe('team strength on the game blank (owner, 2026-10-25)', () => {
  it('uses the same three steps as the Elo table level', () => {
    expect(tableLevelText(1051, 1136)).toBe('команды одного уровня');
    expect(tableLevelText(1000, 1200)).toBe('чёрные заметно сильнее');
    expect(tableLevelText(1300, 1000)).toBe('красные намного сильнее');
  });

  it('prints both averages, the level and the red chance under the title', () => {
    const svg = gameBlankSvg({ gameId: '1', gameNumber: '1', eveningTitle: 'Вечер', dateLabel: null, winnerTeam: 'red', ppk: false, judge: null, judgeAvatar: null, scored: false, seats: [], table: { redAvg: 1051, blackAvg: 1136, level: 'команды одного уровня', redChancePercent: 30 } });
    expect(svg).toContain('Красные 1051');
    expect(svg).toContain('Чёрные 1136');
    expect(svg).toContain('шанс красных 30%');
  });
});

describe('a black the voter did not find himself (owner, 2026-10-25)', () => {
  // 1 sheriff, 2–7 citizens, 8–9 mafia, 10 don
  const roles = ['sheriff', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'mafia', 'mafia', 'don'];
  const results = roles.map((role, index) => ({ seat_number: index + 1, role, player_id: `p${index + 1}`, color_protocol: [] as any[] }));
  let seq = 0;
  const ev = (round: number, phase: string, kind: string, extra: Record<string, unknown> = {}) => ({ seq: ++seq, at: 'x', round, phase, kind, ...extra });
  const day = (round: number, voter: number, target: number, out: number) => [
    ev(round, 'day_voting', 'nomination', { seat: target, by: voter }),
    ev(round, 'day_voting', 'vote', { seat: voter, target }),
    ev(round, 'day_voting', 'vote_round_result', { value: '1:single_eliminated' }),
    ev(round, 'day_voting', 'exit', { seat: out, value: 'voted_day' }),
  ];
  const build = (falseCheckNight: number, votedRedAtNine: boolean) => {
    seq = 0;
    const events = [
      ev(1, 'zero_night', 'game_start'),
      ev(1, 'night', 'exit', { seat: 7, value: 'killed' }),
      // day of round 2: nine players at the table
      ...day(2, 2, votedRedAtNine ? 3 : 8, 3),
      ev(2, 'night', 'sheriff_check', { target: 8 }),
      ev(2, 'night', 'night_step', { value: 'best_move' }),
      ev(falseCheckNight, `night_${falseCheckNight}`, 'announced_check', { seat: 10, target: 2, value: 'black' }),
      ...day(3, 2, 10, 10),
      ...day(4, 2, 8, 8),
      ...day(5, 2, 9, 9),
    ];
    return gameContribution({ protocol: { winner_team: 'red', events }, player_results: results }).find((item) => item.seat === 2)!;
  };

  it('after a false black check that follows a vote for a red at nine, only unchecked blacks earn', () => {
    const me = build(2, true);
    expect(me.items.filter((item) => item.kind === 'found_black').map((item) => item.seat)).toEqual([9]);
    expect(me.items.filter((item) => item.kind === 'obvious_black').map((item) => item.seat).sort()).toEqual([10, 8].sort());
  });

  it('no vote for a red at nine — no sanction', () => {
    const me = build(2, false);
    expect(me.items.filter((item) => item.kind === 'found_black').map((item) => item.seat).sort()).toEqual([8, 9, 10].sort());
  });

  it('a false black check before the circle at nine changes nothing', () => {
    const me = build(1, true);
    expect(me.items.some((item) => item.kind === 'obvious_black')).toBe(false);
  });
});




import { personalBonusLines } from '../server/services/clubResultData.ts';

describe('personal bonuses on the game blank are named by source (owner, 2026-10-26)', () => {
  it('shows the best move, the judge bonus and Ci in whole Elo', () => {
    const results = [{ seat_number: 1, role: 'citizen', participant_id: 'a', judge_bonus: 0.3, ci_points: 0.2 }, { seat_number: 8, role: 'mafia' }, { seat_number: 9, role: 'mafia' }];
    const protocol = { best_moves: [{ participant_id: 'a', seat_numbers: [8, 9, 2] }] };
    expect(personalBonusLines(protocol, results[0], results)).toEqual(['Лучший ход: +12 Эло', 'Бонус судьи: +12 Эло', 'Компенсация первому убитому: +8 Эло']);
  });
});

describe('the first killed has no series bonus (owner, 2026-10-26)', () => {
  it('keeps the will colours but adds no streak lines', () => {
    const results = ['citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'sheriff', 'mafia', 'mafia', 'don'].map((role, i) => ({ seat_number: i + 1, role, player_id: `p${i + 1}`, participant_id: `p${i + 1}`, exit_type: i === 0 ? 'killed' : 'alive', color_protocol: i === 0 ? [{ mark: 'black', seat_numbers: [8, 9] }, { mark: 'red', seat_numbers: [2] }] : [] }));
    const events = [{ seq: 1, at: 'x', round: 1, phase: 'zero_night', kind: 'game_start' }, { seq: 2, at: 'x', round: 1, phase: 'night', kind: 'exit', seat: 1, value: 'killed' }, { seq: 3, at: 'x', round: 1, phase: 'night', kind: 'first_killed', seat: 1 }];
    const me = gameContribution({ protocol: { winner_team: 'red', first_killed_participant_id: 'p1', events }, player_results: results }).find((item) => item.seat === 1)!;
    expect(me.items.some((item) => item.kind === 'will_right')).toBe(true);
    expect(me.items.some((item) => item.kind === 'streak_correct' || item.kind === 'streak_wrong')).toBe(false);
  });
});

import { clubEloDisciplinePoints } from '../server/services/eloRatingService.ts';

describe('owner corrections of 2026-10-26', () => {
  it('discipline in Elo: technical −12, gross −24, removal −30, PPK −40 (not stacked with the removal)', () => {
    const elo = (result: any, protocol: any = {}) => Math.round(clubEloDisciplinePoints({ protocol }, { participant_id: 'a', ...result }) * 40);
    expect(elo({ minor_technical_fouls: 1 })).toBe(12);
    expect(elo({ major_technical_fouls: 1 })).toBe(24);
    expect(elo({ exit_type: 'removed' })).toBe(30);
    expect(elo({ exit_type: 'removed' }, { end_reason: 'ppk', ppk_culprit_participant_id: 'a' })).toBe(40);
  });

  it('a black named red in a will earns +0.3', () => {
    const results = ['citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'sheriff', 'mafia', 'mafia', 'don'].map((role, i) => ({ seat_number: i + 1, role, player_id: `p${i + 1}`, participant_id: `p${i + 1}`, exit_type: i === 0 ? 'killed' : 'alive', color_protocol: i === 0 ? [{ mark: 'red', seat_numbers: [8] }] : [] }));
    const me = gameContribution({ protocol: { winner_team: 'black', events: [] }, player_results: results }).find((item) => item.seat === 8)!;
    expect(me.items.find((item) => item.kind === 'named_red')?.points).toBeCloseTo(0.3, 6);
  });

  it('the don who finds the sheriff on the first night earns +0.2; later nights earn nothing', () => {
    const results = ['citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'sheriff', 'mafia', 'mafia', 'don'].map((role, i) => ({ seat_number: i + 1, role, player_id: `p${i + 1}`, color_protocol: [] as any[] }));
    const events = (round: number) => [
      { seq: 1, at: 'x', round: 1, phase: 'zero_night', kind: 'game_start' },
      { seq: 2, at: 'x', round, phase: 'night', kind: 'don_check', target: 7 },
      { seq: 3, at: 'x', round, phase: 'night', kind: 'night_step', value: 'sheriff' },
    ];
    const don = (round: number) => gameContribution({ protocol: { winner_team: 'black', events: events(round) }, player_results: results }).find((item) => item.seat === 10)!;
    expect(don(1).items.find((item) => item.kind === 'don_found_sheriff')?.points).toBeCloseTo(0.2, 6);
    expect(don(2).items.some((item) => item.kind === 'don_found_sheriff')).toBe(false);
  });
});

describe('«первая мысль»: the first red who named a seat black in his will (owner, 2026-10-26)', () => {
  const roles = ['sheriff', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'mafia', 'mafia', 'don'];
  const build = (firstWill: number[], secondWill: number[], votedOut: number) => {
    const results = roles.map((role, index) => ({ seat_number: index + 1, role, player_id: `p${index + 1}`, color_protocol: [] as any[], exit_type: 'alive' }));
    results[1].color_protocol = [{ mark: 'black', seat_numbers: firstWill }]; results[1].exit_type = 'killed';
    results[2].color_protocol = [{ mark: 'black', seat_numbers: secondWill }]; results[2].exit_type = 'killed';
    const events = [
      { seq: 1, at: 'x', round: 1, phase: 'zero_night', kind: 'game_start' },
      { seq: 2, at: 'x', round: 1, phase: 'night', kind: 'exit', seat: 2, value: 'killed' },
      { seq: 3, at: 'x', round: 2, phase: 'night', kind: 'exit', seat: 3, value: 'killed' },
      { seq: 4, at: 'x', round: 3, phase: 'day_voting', kind: 'vote_round_result', value: '1:single_eliminated' },
      { seq: 5, at: 'x', round: 3, phase: 'day_voting', kind: 'exit', seat: votedOut, value: 'voted_day' },
      { seq: 6, at: 'x', round: 3, phase: 'night', kind: 'game_end', value: 'red' },
    ];
    return (seat: number) => gameContribution({ protocol: { winner_team: 'red', events }, player_results: results }).find((item) => item.seat === seat)!;
  };

  it('only the first author gets the bonus when that black is voted out', () => {
    const by = build([8], [8], 8);
    expect(by(2).items.find((item) => item.kind === 'led_table')?.points).toBeCloseTo(0.2, 6);
    expect(by(3).items.some((item) => item.kind === 'led_table')).toBe(false);
  });

  it('leading the table to vote out a red costs the author', () => {
    const by = build([4], [], 4);
    expect(by(2).items.find((item) => item.kind === 'misled_table')?.points).toBeCloseTo(-0.2, 6);
  });
});

import { unscoredVotings } from '../lib/playerContribution.ts';

describe('agreed split («попил») and a black already paid by a vote (owner, 2026-10-26)', () => {
  it('a voting marked as an agreed split by the judge is found by day and its number within the day', () => {
    const keys = unscoredVotings({ votes: [
      { round_number: 1, day_number: 0 }, { round_number: 2, day_number: 0, is_revote: true },
      { round_number: 3, day_number: 1 }, { round_number: 4, day_number: 2, no_scoring: true },
    ] });
    expect([...keys]).toEqual(['3:1']);
  });

  it('votes in a marked split earn and cost nothing', () => {
    const roles = ['sheriff', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'mafia', 'mafia', 'don'];
    const results = roles.map((role, index) => ({ seat_number: index + 1, role, player_id: `p${index + 1}`, color_protocol: [] as any[] }));
    const events = [
      { seq: 1, at: 'x', round: 1, phase: 'zero_night', kind: 'game_start' },
      { seq: 2, at: 'x', round: 2, phase: 'day_voting', kind: 'vote', seat: 2, target: 3, value: 1 },
      { seq: 3, at: 'x', round: 2, phase: 'day_voting', kind: 'vote_round_result', value: '1:single_eliminated' },
      { seq: 4, at: 'x', round: 2, phase: 'day_voting', kind: 'exit', seat: 3, value: 'voted_day' },
    ];
    const seat2 = (agreed: boolean) => gameContribution({ protocol: { winner_team: 'red', events, votes: [{ round_number: 1, day_number: 0 }, { round_number: 2, day_number: 1, no_scoring: agreed, eliminated_seats: [3] }] }, player_results: results }).find((item) => item.seat === 2)!;
    expect(seat2(false).points).toBeLessThan(0);
    // only the colour of the one who left counts: a red left → −2 Elo for every red voter (a black left would be +4)
    expect(seat2(true).items.map((item) => item.kind)).toEqual(['split_outcome']);
    expect(seat2(true).points * 40).toBeCloseTo(-2, 6);
    // balance: at a восьмёрка with three blacks a random outcome is worth about zero
    expect((3 / 8) * 4 + (5 / 8) * -2).toBeCloseTo(0.25, 6);
  });

  it('a black named in the will after the same red voted for him earns nothing more', () => {
    const roles = ['sheriff', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'mafia', 'mafia', 'don'];
    const results = roles.map((role, index) => ({ seat_number: index + 1, role, player_id: `p${index + 1}`, color_protocol: [] as any[], exit_type: 'alive' }));
    results[1].color_protocol = [{ mark: 'black', seat_numbers: [8] }]; results[1].exit_type = 'killed';
    const events = [
      { seq: 1, at: 'x', round: 1, phase: 'zero_night', kind: 'game_start' },
      { seq: 2, at: 'x', round: 2, phase: 'day_voting', kind: 'vote', seat: 2, target: 8 },
      { seq: 3, at: 'x', round: 2, phase: 'day_voting', kind: 'vote_round_result', value: '1:single_eliminated' },
      { seq: 4, at: 'x', round: 2, phase: 'day_voting', kind: 'exit', seat: 8, value: 'voted_day' },
      { seq: 5, at: 'x', round: 2, phase: 'night', kind: 'exit', seat: 2, value: 'killed' },
    ];
    const me = gameContribution({ protocol: { winner_team: 'red', events }, player_results: results }).find((item) => item.seat === 2)!;
    expect(me.items.filter((item) => item.kind === 'found_black')).toHaveLength(1);
    expect(me.items.some((item) => item.kind === 'will_right')).toBe(false);
    expect(me.items.some((item) => item.kind === 'will_already')).toBe(true);
  });
});

describe('a revote at a восьмёрка or шестёрка marks the whole day as a split (owner, 2026-10-26)', () => {
  it('tags every voting of that day, and nothing at nine', () => {
    const keys = unscoredVotings({ votes: [
      { round_number: 1, day_number: 0, eligible_voters: 10, outcome: 'tie_revote' },
      { round_number: 2, day_number: 1, eligible_voters: 9, outcome: 'tie_revote' }, { round_number: 3, day_number: 1, eligible_voters: 9, outcome: 'single_eliminated' },
      { round_number: 4, day_number: 2, eligible_voters: 8, outcome: 'tie_revote' }, { round_number: 5, day_number: 2, eligible_voters: 8, outcome: 'single_eliminated' },
      { round_number: 6, day_number: 3, eligible_voters: 6, outcome: 'single_eliminated' },
    ] });
    expect([...keys].sort()).toEqual(['3:1', '3:2']);
  });
});

describe('a vote for oneself (owner, 2026-10-26)', () => {
  const roles = ['sheriff', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'mafia', 'mafia', 'don'];
  const results = roles.map((role, index) => ({ seat_number: index + 1, role, player_id: `p${index + 1}`, color_protocol: [] as any[] }));
  // voters: [seat, target]; seat 2 always votes for himself
  const run = (votes: Array<[number, number]>, out: number) => {
    const events = [
      { seq: 1, at: 'x', round: 1, phase: 'zero_night', kind: 'game_start' },
      ...votes.map(([seat, target], i) => ({ seq: 10 + i, at: 'x', round: 2, phase: 'day_voting', kind: 'vote', seat, target, value: 1 })),
      { seq: 40, at: 'x', round: 2, phase: 'day_voting', kind: 'vote_round_result', value: '1:single_eliminated' },
      { seq: 41, at: 'x', round: 2, phase: 'day_voting', kind: 'exit', seat: out, value: 'voted_day' },
    ];
    return gameContribution({ protocol: { winner_team: 'red', events }, player_results: results }).find((item) => item.seat === 2)!;
  };
  it('costs like voting out a red when his own vote decided it against a black (4 : 4, his fifth in himself)', () => {
    expect(run([[2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [1, 8], [7, 8], [8, 9], [9, 8], [10, 8]], 2).points).toBeCloseTo(-0.2, 6);
  });
  it('is free when he would have left anyway', () => {
    expect(run([[2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [1, 8], [7, 8], [8, 9], [9, 2], [10, 8]], 2).points).toBe(0);
  });
  it('is free when someone else left', () => {
    expect(run([[2, 2], [3, 8], [4, 8], [5, 8], [6, 8], [1, 8]], 8).points).toBeGreaterThanOrEqual(0);
  });
});
