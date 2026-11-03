import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { gameContribution, contributionBreakdown } from '../lib/playerContribution.ts';
import { splitBreakMarks } from '../shared/liveGameEvents.ts';

/** Owner, 2026-11-01: −20 Elo for a red tagged «сломал попил красным» (any circle) and for each red who raised a hand for the last raise before a lost game. */
const roles = ['sheriff', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'mafia', 'mafia', 'don'];
const players = () => roles.map((role, i) => ({ seat_number: i + 1, participant_id: `p${i + 1}`, player_id: `p${i + 1}`, role, exit_type: 'alive', color_protocol: [] as Array<{ mark: string; seat_numbers: number[] }> }));
const score = (protocol: any, seat: number) => gameContribution({ protocol: { winner_team: 'red', zero_round_rule: 'tournament', ...protocol }, player_results: players() }).find((item) => item.seat === seat)!;
const ev = (round: number, kind: string, data: object = {}) => ({ seq: 0, at: 'x', round, phase: 'day_voting', kind, ...data });
const seq = (list: ReturnType<typeof ev>[]) => list.map((item, i) => ({ ...item, seq: i + 1 }));
const raised = { round_number: 2, day_number: 1, is_revote: true, nominated_seats: [3, 4, 5], vote_counts: { 3: 3, 4: 3, 5: 3 }, eligible_voters: 9, outcome: 'all_tied_eliminated', eliminated_seats: [3, 4, 5], table_leave_votes: 6 };

describe('fixed Elo cut for a red who broke a split', () => {
  it('a mark on a later circle costs a red −20 Elo outside the personal limits', () => {
    const protocol = { events: seq([ev(2, 'split_break', { seat: 6 })]) };
    assert.equal(score(protocol, 6).missPenaltyElo, 20);
    assert.ok(contributionBreakdown('citizen', score(protocol, 6).items).some((line) => /Сломал попил красным: −20/.test(line)));
    assert.equal(score(protocol, 2).missPenaltyElo, 0);
  });
  it('the tag works on the zero circle too and costs −20 on top of the zero-circle table, which is unchanged', () => {
    const protocol = { events: seq([ev(1, 'zero_round_break', { seat: 6 }), ev(1, 'split_break', { seat: 6 })]), zero_round_voted_participant_id: 'p2' };
    const result = score(protocol, 6);
    assert.equal(result.missPenaltyElo, 20);
    assert.ok(result.items.some((item) => item.kind === 'zero_break'));
  });
  it('a black who breaks a split gets no red penalty, and the latest mark of a circle wins', () => {
    assert.equal(score({ events: seq([ev(2, 'split_break', { seat: 8 })]) }, 8).missPenaltyElo, 0);
    assert.deepEqual(splitBreakMarks(seq([ev(2, 'split_break', { seat: 6 }), ev(2, 'split_break', { seat: 7 })])), [{ round: 2, seat: 7 }]);
    assert.deepEqual(splitBreakMarks(seq([ev(2, 'split_break', { seat: 6 }), ev(2, 'split_break')])), []);
  });
});

describe('fixed Elo cut for the last raise before a lost game', () => {
  const hands = [ev(2, 'table_vote', { seat: 1 }), ev(2, 'table_vote', { seat: 2 }), ev(2, 'table_vote', { seat: 8 }), ev(2, 'table_vote', { seat: 6 }), ev(2, 'table_vote_removed', { seat: 6 })];
  it('cuts each red whose hand stayed up and nobody else; blacks and removed hands are not cut', () => {
    const protocol = { winner_team: 'black', votes: [raised], events: seq(hands) };
    assert.equal(score(protocol, 1).missPenaltyElo, 20);
    assert.equal(score(protocol, 2).missPenaltyElo, 20);
    assert.equal(score(protocol, 6).missPenaltyElo, 0);
    assert.equal(score(protocol, 8).missPenaltyElo, 0);
    assert.ok(contributionBreakdown('citizen', score(protocol, 2).items).some((line) => /Поднял руку за последний подъём/.test(line)));
  });
  it('is not applied when the reds won, when a later voting exists, or when the hands were not recorded', () => {
    assert.equal(score({ winner_team: 'red', votes: [raised], events: seq(hands) }, 2).missPenaltyElo, 0);
    const later = { round_number: 3, day_number: 2, is_revote: false, nominated_seats: [1], vote_counts: { 1: 6 }, eligible_voters: 6, outcome: 'single_eliminated', eliminated_seats: [1] };
    assert.equal(score({ winner_team: 'black', votes: [raised, later], events: seq(hands) }, 2).missPenaltyElo, 0);
    assert.equal(score({ winner_team: 'black', votes: [raised], events: [] }, 2).missPenaltyElo, 0);
  });
});

describe('bonus for the blacks at the table during the lost raise (owner, 2026-11-01: +10 Elo)', () => {
  const hands = seq([ev(2, 'table_vote', { seat: 1 }), ev(2, 'table_vote', { seat: 2 })]);
  const withExit = (seat: number, exit_type: string) => players().map((player) => (player.seat_number === seat ? { ...player, exit_type } : player));
  const points = (rows: ReturnType<typeof players>, protocol: any, seat: number) => Math.round(gameContribution({ protocol: { winner_team: 'black', zero_round_rule: 'tournament', ...protocol }, player_results: rows }).find((item) => item.seat === seat)!.points * 40);
  it('pays each black who sat at the table, and nobody else', () => {
    const protocol = { votes: [raised], events: hands };
    assert.equal(points(players(), protocol, 8), 10);
    assert.equal(points(players(), protocol, 10), 10);
    const earlierExit = { votes: [raised], events: seq([ev(1, 'exit', { seat: 9, value: 'voted_day' }), ev(2, 'table_vote', { seat: 1 }), ev(2, 'table_vote', { seat: 2 })]) };
    assert.equal(points(withExit(9, 'voted_day'), earlierExit, 9), 0);
    assert.equal(points(withExit(9, 'voted_day'), earlierExit, 8), 10);
    assert.equal(points(players(), protocol, 4), 0);
  });
  it('is not paid when the reds won, or when no red hand was recorded', () => {
    assert.equal(points(players(), { winner_team: 'red', votes: [raised], events: hands }, 8), 0);
    assert.equal(points(players(), { votes: [raised], events: [] }, 8), 0);
  });
});

describe('Elo tags of the judge (owner, 2026-11-03)', () => {
  it('«Вскрылся чёрному» −10, «Убил шерифа в нуле» +10, outside the personal limits, any role; taking a tag off undoes it', () => {
    const on = seq([ev(2, 'elo_tag', { seat: 6, value: 'revealed_to_black' }), ev(1, 'elo_tag', { seat: 8, value: 'killed_sheriff_zero' })]);
    assert.equal(score({ events: on }, 6).missPenaltyElo, 10);
    assert.equal(score({ events: on }, 8).missPenaltyElo, -10);
    assert.ok(contributionBreakdown('citizen', score({ events: on }, 6).items).some((line) => /Вскрылся чёрному: −10/.test(line)));
    assert.ok(contributionBreakdown('mafia', score({ events: on }, 8).items).some((line) => /Убил шерифа в нуле: \+10/.test(line)));
    const off = seq([ev(2, 'elo_tag', { seat: 6, value: 'revealed_to_black' }), ev(2, 'elo_tag', { seat: 6, value: 'revealed_to_black:off' })]);
    assert.equal(score({ events: off }, 6).missPenaltyElo, 0);
  });
});


describe('false sheriff naming the real sheriff red', () => {
  it('costs the tagged black 20, not the sheriff, deduplicates and can be removed', () => {
    for (const seat of [8, 10]) {
      const mark = ev(2, 'elo_tag', { seat, value: 'false_sheriff_red_sheriff' });
      const events = seq([mark, mark]);
      assert.equal(score({ events }, seat).missPenaltyElo, 20);
      assert.equal(score({ events }, 1).missPenaltyElo, 0);
      assert.ok(contributionBreakdown(seat === 10 ? 'don' : 'mafia', score({ events }, seat).items).some((line) => /шерифом красным: −20/.test(line)));
      assert.equal(score({ events: seq([...events, ev(2, 'elo_tag', { seat, value: 'false_sheriff_red_sheriff:off' })]) }, seat).missPenaltyElo, 0);
    }
  });
});
