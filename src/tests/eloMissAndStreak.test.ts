import { calculateCanonicalEloGame, normalizeContributions, type PreparedEloEvent } from '../server/services/eloRatingService.ts';
import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { gameContribution, contributionBreakdown } from '../lib/playerContribution.ts';
import { validateShots } from '../lib/protocolConsistency.ts';
import { decisionStreakMultipliers } from '../lib/eloDecisionStreak.ts';

const roles = ['sheriff', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'mafia', 'mafia', 'don'];
const players = () => roles.map((role, i) => ({ seat_number: i + 1, participant_id: `p${i + 1}`, player_id: `p${i + 1}`, role, exit_type: 'alive', color_protocol: [] as Array<{ mark: string; seat_numbers: number[] }> }));
const score = (rows: ReturnType<typeof players>, protocol: any, seat: number) => gameContribution({ protocol: { winner_team: 'red', ...protocol }, player_results: rows }).find((item) => item.seat === seat)!;
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const event = (round: number, kind: string, data: object = {}) => ({ seq: 0, at: 'x', round, phase: 'day_voting', kind, ...data });
const sequence = (list: ReturnType<typeof event>[]) => list.map((item, i) => ({ ...item, seq: i + 1 }));
const shot = (extra: object = {}) => ({ night_number: 1, target_seat: 0, result: 'miss', miss_reason: 'error', miss_responsible_seats: [8], ...extra });

describe('judge-attributed miss penalty', () => {
  it('penalizes only the selected black on a black loss; never a team win', () => {
    close(score(players(), { shots: [shot()] }, 8).points, -0.15);
    close(score(players(), { shots: [shot()] }, 9).points, 0);
    close(score(players(), { winner_team: 'black', shots: [shot()] }, 8).points, 0);
  });
  it('can assign all three; intentional and legacy/unassigned misses are neutral', () => {
    for (const seat of [8, 9, 10]) close(score(players(), { shots: [shot({ miss_responsible_seats: [8, 9, 10] })] }, seat).points, -0.15);
    close(score(players(), { shots: [shot({ miss_reason: 'intentional', miss_responsible_seats: [] })] }, 8).points, 0);
    close(score(players(), { shots: [{ night_number: 1, result: 'agreement_failed', target_seat: 0 }] }, 8).points, 0);
  });
  it('two attributed misses cost 12 Elo, inside the automatic cap of 35', () => {
    const protocol = { winner_team: 'red', shots: [shot(), shot({ night_number: 2 })] };
    const rows = players();
    close(score(rows, protocol, 8).points, -0.3);
    const prepared: PreparedEloEvent = { source: 'club', sourceId: 'miss6', sortAt: '', sortOrder: 1, winnerTeam: 'red',
      players: rows.map((player) => ({ playerId: player.player_id, team: ['mafia', 'don'].includes(player.role) ? 'black' : 'red',
        canonicalPersonalGamePoints: 0, contribution: { role: player.role, raw: score(rows, protocol, player.seat_number).points } })) };
    normalizeContributions([prepared]);
    const delta = calculateCanonicalEloGame(prepared.players.map((player) => ({ ...player, elo: 1000 })), 'red').find((row) => row.playerId === 'p8')!;
    close(delta.contributionDelta, -12);
    close(delta.totalDelta, -47);
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
    close(score(rows, { first_killed_participant_id: 'p2' }, 2).points, -0.1 + 0.075);
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
  it('opposite decisions reset, and the multiplier never exceeds 1.5', () => {
    const objects = Array.from({ length: 8 }, () => ({}));
    const factors = decisionStreakMultipliers(objects.map((item, i) => ({ seq: i + 1, sign: (i === 3 ? -1 : 1) as 1 | -1, items: [item] })));
    assert.deepEqual(objects.map((item) => factors.get(item)), [1, 1.25, 1.5, 1, 1, 1.25, 1.5, 1.5]);
    assert.equal(decisionStreakMultipliers([{ seq: 1, sign: 1, items: [objects[0]] }]).get(objects[0]), 1);
  });
  it('does not invent a cross-action series in a partial history', () => {
    const events = sequence([event(2, 'vote', { seat: 1, target: 8 }), event(2, 'vote_round_result', { value: '1:single_eliminated' }), event(2, 'exit', { seat: 8, value: 'voted_day' }), event(3, 'vote', { seat: 1, target: 9 }), event(3, 'vote_round_result', { value: '1:single_eliminated' }), event(3, 'exit', { seat: 9, value: 'voted_day' })]);
    close(score(players(), { events }, 1).points, 0.4);
  });
});

describe('a series spans different moments of the game (owner, 2026-10-26)', () => {
  it('a will with three right colours is one step; the decision after it is the second step', () => {
    const will = [{}, {}, {}]; const vote = {};
    const factors = decisionStreakMultipliers([{ seq: 1, sign: 1, items: will }, { seq: 2, sign: 1, items: [vote] }]);
    assert.deepEqual(will.map((item) => factors.get(item)), [1, 1, 1]);
    assert.equal(factors.get(vote), 1.25);
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
