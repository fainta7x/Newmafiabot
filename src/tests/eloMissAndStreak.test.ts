import { calculateCanonicalEloGame, normalizeContributions, type PreparedEloEvent } from '../server/services/eloRatingService.ts';
import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { gameContribution, contributionBreakdown } from '../lib/playerContribution.ts';
import { validateShots } from '../lib/protocolConsistency.ts';
import { decisionStreakSteps } from '../lib/eloDecisionStreak.ts';

const roles = ['sheriff', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'mafia', 'mafia', 'don'];
const players = () => roles.map((role, i) => ({ seat_number: i + 1, participant_id: `p${i + 1}`, player_id: `p${i + 1}`, role, exit_type: 'alive', color_protocol: [] as Array<{ mark: string; seat_numbers: number[] }> }));
const score = (rows: ReturnType<typeof players>, protocol: any, seat: number) => gameContribution({ protocol: { winner_team: 'red', ...protocol }, player_results: rows }).find((item) => item.seat === seat)!;
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const event = (round: number, kind: string, data: object = {}) => ({ seq: 0, at: 'x', round, phase: 'day_voting', kind, ...data });
const sequence = (list: ReturnType<typeof event>[]) => list.map((item, i) => ({ ...item, seq: i + 1 }));
const shot = (extra: object = {}) => ({ night_number: 1, target_seat: 0, result: 'miss', miss_reason: 'error', miss_responsible_seats: [8], ...extra });

describe('judge-attributed miss penalty', () => {
  it('penalizes only the selected black on a black loss; never a team win', () => {
    close(score(players(), { shots: [shot()] }, 8).missPenaltyElo, 10);
    close(score(players(), { shots: [shot()] }, 9).points, 0);
    close(score(players(), { winner_team: 'black', shots: [shot()] }, 8).points, 0);
  });
  it('can assign all three; intentional and legacy/unassigned misses are neutral', () => {
    for (const seat of [8, 9, 10]) close(score(players(), { shots: [shot({ miss_responsible_seats: [8, 9, 10] })] }, seat).missPenaltyElo, 10);
    close(score(players(), { shots: [shot({ miss_reason: 'intentional', miss_responsible_seats: [] })] }, 8).points, 0);
    close(score(players(), { shots: [{ night_number: 1, result: 'agreement_failed', target_seat: 0 }] }, 8).points, 0);
  });
  it('two attributed misses cost 12 Elo after all personal limits', () => {
    const protocol = { winner_team: 'red', shots: [shot(), shot({ night_number: 2 })] };
    const rows = players();
    close(score(rows, protocol, 8).missPenaltyElo, 20);
    const prepared: PreparedEloEvent = { source: 'club', sourceId: 'miss6', sortAt: '', sortOrder: 1, winnerTeam: 'red',
      players: rows.map((player) => ({ playerId: player.player_id, team: ['mafia', 'don'].includes(player.role) ? 'black' : 'red',
        canonicalPersonalGamePoints: 0, contribution: { role: player.role, raw: score(rows, protocol, player.seat_number).points, missPenaltyElo: score(rows, protocol, player.seat_number).missPenaltyElo } })) };
    normalizeContributions([prepared]);
    const delta = calculateCanonicalEloGame(prepared.players.map((player) => ({ ...player, elo: 1000 })), 'red').find((row) => row.playerId === 'p8')!;
    close(delta.contributionDelta, 0); close(delta.missDelta!, -20);
    close(delta.totalDelta, -55);
  });
  it('validates the recorded reason, black roles, uniqueness and confirmed attribution', () => {
    assert.equal(validateShots([shot()], 10, players(), true), null);
    assert.ok(validateShots([shot({ miss_responsible_seats: [1] })], 10, players()));
    assert.ok(validateShots([shot({ miss_responsible_seats: [8, 8] })], 10, players()));
    assert.ok(validateShots([shot({ result: 'killed', target_seat: 2 })], 10, players()));
    assert.equal(validateShots([shot({ miss_responsible_seats: [] })], 10, players(), false), null);
    assert.ok(validateShots([shot({ miss_responsible_seats: [] })], 10, players(), true));
  });
});

describe('a mistaken ordinary will has no positive colour awards; PU is the exception', () => {
  it('removes only the will positives, retaining both negative evidence and the explanation', () => {
    const rows = players(); rows[1].color_protocol = [{ mark: 'red', seat_numbers: [3, 8] }];
    const me = score(rows, {}, 2);
    close(me.points, -0.1);
    assert.equal(me.items.some((item) => item.kind === 'will_right'), false);
    assert.ok(contributionBreakdown(me.role, me.items).some((line) => line.includes('Завещание с ошибкой')));
  });
  it('keeps the explicit first-killed exception without guessing who was PU', () => {
    const rows = players(); rows[1].color_protocol = [{ mark: 'red', seat_numbers: [3, 8] }];
    close(score(rows, { first_killed_participant_id: 'p2' }, 2).points, -0.1 + 0.05);
    close(score(rows, { first_killed_participant_id: 'p3' }, 2).points, -0.1);
  });
  it('a black named sheriff is a wrong colour and blocks ordinary positive marks', () => {
    const rows = players(); rows[1].color_protocol = [{ mark: 'red', seat_numbers: [3] }, { mark: 'sheriff', seat_numbers: [8] }];
    close(score(rows, {}, 2).points, -0.1);
    close(score(rows, {}, 8).points, 0);
  });
  it('several mistakes in one will are one decision: no series; permuting marks changes nothing', () => {
    const rows = players(); rows[1].color_protocol = [{ mark: 'red', seat_numbers: [8, 4] }, { mark: 'black', seat_numbers: [3] }];
    const before = score(rows, {}, 2);
    close(before.points, -0.1 - 0.1);
    rows[1].color_protocol.reverse(); rows[1].color_protocol.forEach((mark) => mark.seat_numbers.reverse());
    close(score(rows, {}, 2).points, before.points);
    assert.ok(!before.items.some((item) => item.kind === 'streak_wrong'));
  });
  it('does not let a wrong colour erase a separately earned vote award', () => {
    const rows = players(); rows[1].color_protocol = [{ mark: 'red', seat_numbers: [9] }];
    const events = sequence([event(1, 'game_start', { phase: 'zero_night' }), event(2, 'vote', { seat: 2, target: 8, value: 1 }), event(2, 'vote_round_result', { value: '1:single_eliminated' }), event(2, 'exit', { seat: 8, value: 'voted_day' }), event(2, 'exit', { seat: 2, value: 'killed', phase: 'night' }), event(3, 'game_end', { value: 'red' })]);
    const me = score(rows, { events }, 2); close(me.points, 0.2 - 0.1);
    assert.ok(me.items.some((item) => item.kind === 'found_black'));
  });
});

describe('in-game streaks of confirmed decisions', () => {
  it('a red sheriff check is neutral between two correct votes', () => {
    const events = sequence([event(1, 'game_start', { phase: 'zero_night' }), event(2, 'vote', { seat: 1, target: 8, value: 1 }), event(2, 'vote_round_result', { value: '1:single_eliminated' }), event(2, 'exit', { seat: 8, value: 'voted_day' }), event(2, 'sheriff_check', { target: 2, phase: 'night' }), event(2, 'night_step', { value: 'best_move', phase: 'night' }), event(3, 'vote', { seat: 1, target: 9, value: 1 }), event(3, 'vote_round_result', { value: '1:single_eliminated' }), event(3, 'exit', { seat: 9, value: 'voted_day' }), event(4, 'game_end', { value: 'red' })]);
    close(score(players(), { events }, 1).points, 0.45);
  });
  it('a black the sheriff checked: +4 for the check, +4 when the table votes him out, his own vote adds nothing (owner, 2026-10-26)', () => {
    const events = sequence([event(1, 'game_start', { phase: 'zero_night' }), event(1, 'sheriff_check', { target: 8, phase: 'night' }), event(1, 'night_step', { value: 'best_move', phase: 'night' }), event(2, 'vote', { seat: 1, target: 8, value: 1 }), event(2, 'vote_round_result', { value: '1:single_eliminated' }), event(2, 'exit', { seat: 8, value: 'voted_day' }), event(3, 'game_end', { value: 'red' })]);
    const me = score(players(), { events }, 1);
    close(me.points, 0.2);
    assert.deepEqual(me.items.map((item) => item.kind).sort(), ['check_black', 'check_voted_out', 'obvious_black']);
  });
  it('charges −8, −6, −12 and −28 across four wrong votes ending on a critical circle', () => {
    const exit = (round: number, seat: number, night = false) =>
      event(round, 'exit', { seat, value: night ? 'killed' : 'voted_day', phase: night ? 'night' : 'day_voting' });
    const vote = (round: number, target: number, eliminated: number) => [
      event(round, 'vote', { seat: 1, target, value: 1 }),
      event(round, 'vote_round_result', { value: '1:single_eliminated' }),
      exit(round, eliminated),
    ];
    const events = sequence([
      event(1, 'game_start', { phase: 'zero_night' }), exit(1, 7, true),
      ...vote(2, 2, 2), exit(2, 10, true),
      ...vote(3, 3, 8), exit(3, 3, true),
      ...vote(4, 4, 4), exit(4, 5, true),
      ...vote(5, 6, 6), event(5, 'game_end', { value: 'black' }),
    ]);
    const { items } = score(players(), { events, winner_team: 'black' }, 1);
    const totals = [2, 3, 4, 5].map((round) => items
      .filter((item) => item.round === round && ['vote_red', 'streak_wrong'].includes(item.kind))
      .reduce((sum, item) => sum + item.points * 40, 0));
    assert.deepEqual(totals, [-8, -6, -12, -28]);
  });

  it('applies will streak relief before critical doubling and both doublings to the second author', () => {
    const rows = players();
    rows[6].role = 'mafia';
    rows[8].role = 'citizen';
    rows[0].color_protocol = [{ mark: 'black', seat_numbers: [9] }];
    rows[1].color_protocol = [{ mark: 'black', seat_numbers: [9] }];
    const exit = (round: number, seat: number, night = false) =>
      event(round, 'exit', { seat, value: night ? 'killed' : 'voted_day', phase: night ? 'night' : 'day_voting' });
    const vote = (round: number, eliminated: number) => [
      event(round, 'vote', { seat: 5, target: 9, value: 1 }),
      event(round, 'vote_round_result', { value: '1:single_eliminated' }),
      exit(round, eliminated),
    ];
    const protocol = { winner_team: 'black', first_killed_participant_id: 'p1', events: sequence([
      event(1, 'game_start', { phase: 'zero_night' }), exit(1, 1, true),
      ...vote(2, 3), exit(2, 2, true), ...vote(3, 9), event(3, 'game_end', { value: 'black' }),
    ]) };
    const voter = score(rows, protocol, 5);
    const roundPoints = (round: number) => voter.items.filter((item) => item.round === round)
      .reduce((sum, item) => sum + item.points * 40, 0);
    close(roundPoints(2), -4);
    close(roundPoints(3), -16);
    close(voter.negativePoints * 40, -20);
    close(voter.positivePoints, 0);
    close(score(rows, protocol, 1).points * 40, -8);
    close(score(rows, protocol, 2).points * 40, -20);

    rows[1].color_protocol = [{ mark: 'red', seat_numbers: [9] }];
    assert.ok(!score(rows, protocol, 5).items.some((item) => item.kind === 'will_vote_relief'));
  });

  it('opposite decisions reset, and the steps keep growing', () => {
    const objects = Array.from({ length: 8 }, () => ({}));
    const factors = decisionStreakSteps(objects.map((item, i) => ({ seq: i + 1, sign: (i === 3 ? -1 : 1) as 1 | -1, items: [item] })));
    assert.deepEqual(objects.map((item) => factors.get(item)), [1, 2, 3, 1, 1, 2, 3, 4]);
    assert.equal(decisionStreakSteps([{ seq: 1, sign: 1, items: [objects[0]] }]).get(objects[0]), 1);
  });
  it('does not invent a cross-action series in a partial history', () => {
    const events = sequence([event(2, 'vote', { seat: 1, target: 8 }), event(2, 'vote_round_result', { value: '1:single_eliminated' }), event(2, 'exit', { seat: 8, value: 'voted_day' }), event(3, 'vote', { seat: 1, target: 9 }), event(3, 'vote_round_result', { value: '1:single_eliminated' }), event(3, 'exit', { seat: 9, value: 'voted_day' })]);
    close(score(players(), { events }, 1).points, 0.4);
  });
});

describe('a series spans different moments of the game (owner, 2026-10-26)', () => {
  it('a will with three right colours is one step; the decision after it is the second step', () => {
    const will = [{}, {}, {}]; const vote = {};
    const factors = decisionStreakSteps([{ seq: 1, sign: 1, items: will }, { seq: 2, sign: 1, items: [vote] }]);
    assert.deepEqual(will.map((item) => factors.get(item)), [1, undefined, undefined]);
    assert.equal(factors.get(vote), 2);
  });
});

describe('the series line says which decision in a row and what it was (owner, 2026-10-26)', () => {
  it('names the second and third decisions with their extra', () => {
    const lines = contributionBreakdown('citizen', [
      { kind: 'found_black', seat: 4, points: 0.2 }, { kind: 'found_black', seat: 5, points: 0.2 }, { kind: 'found_black', seat: 8, points: 0.2 },
    ], [{ sign: 1, labels: ['голос в чёрного №4', 'голос в чёрного №5', 'голос в чёрного №8'], points: 0.15 }]);
    assert.ok(lines.includes('Верно подряд: голос в чёрного №4 → голос в чёрного №5 → голос в чёрного №8: +6'));
  });
});


describe('human-readable protocol Elo on the five-player critical vote', () => {
  it('shows the base vote and streak first, then applies the critical ×2 once', () => {
    const items = [
      { kind: 'found_black' as const, seat: 8, round: 2, points: 0.2 },
      { kind: 'vote_red' as const, seat: 4, round: 3, tableSize: 7, points: -0.2, votedOut: true },
      { kind: 'vote_red' as const, seat: 5, round: 4, tableSize: 5, points: -0.4, votedOut: true, critical: true },
      { kind: 'streak_wrong' as const, seat: 5, round: 4, points: -0.1, critical: true, step: 2, source: 'vote_red' as const },
    ];
    const lines = contributionBreakdown('citizen', items);
    assert.ok(lines.some((line) => line.includes('Голосовал в чёрных №8: +8')));
    assert.ok(lines.some((line) => line.includes('Семёрка') && line.includes('−8')));
    const five = lines.find((line) => line.includes('Пятёрка')) || '';
    assert.ok(five.includes('Голос в красного №5, которого вывели'), five);
    assert.ok(five.includes('(−8 за голос, −2 за серию ошибок) ×2 за критический круг = −20'), five);
    assert.ok(!lines.some((line) => line.startsWith('Ошибки подряд')), lines.join('\n'));
    close(items.reduce((sum, item) => sum + item.points * 40, 0), -20);
  });

  it('uses the same base → will-streak → critical order for a wrong will', () => {
    const items = [
      { kind: 'will_wrong' as const, seat: 9, round: 3, points: -0.5, critical: true,
        willSeriesExtra: -0.05, votedOut: true, willColor: 'black' as const },
    ];
    const lines = contributionBreakdown('citizen', items);
    assert.ok(lines.some((line) => line.includes('−8 за завещание') &&
      line.includes('−2 за повтор ошибочного завещания') &&
      line.includes('×2 за критический круг = −20')), lines.join('\n'));
  });
});
