import { describe, expect, it } from 'vitest';
import { buildGameAnalysis } from '../lib/liveGameAnalysis.ts';
import type { LiveGameEvent } from '../shared/liveGameEvents.ts';

let seq = 0;
const ev = (round: number, kind: string, extra: Partial<LiveGameEvent> = {}): LiveGameEvent => ({ seq: ++seq, at: '2026-10-04T10:00:00Z', round, phase: 'day_voting', kind, ...extra });

describe('game analysis', () => {
  it('folds the chronology into circles with nominations, votes and outcomes', () => {
    seq = 0;
    const analysis = buildGameAnalysis([
      ev(1, 'nomination', { seat: 3, by: 1 }),
      ev(1, 'nomination', { seat: 5, by: 2 }),
      ev(1, 'nomination', { seat: 7, by: 4 }),
      ev(1, 'nomination_removed', { seat: 7, phase: 'day_speeches' }),
      ev(1, 'vote', { seat: 1, target: 3, value: 1 }),
      ev(1, 'vote', { seat: 2, target: 3, value: 1 }),
      ev(1, 'vote', { seat: 4, target: 5, value: 1 }),
      ev(1, 'vote_removed', { seat: 4, target: 5 }),
      ev(1, 'vote', { seat: 4, target: 3, value: 1 }),
      ev(1, 'vote_round_result', { value: '1:single_eliminated' }),
      ev(1, 'exit', { seat: 3, value: 'voted_day' }),
      ev(2, 'shot_target', { target: 6 }),
      ev(2, 'don_check', { target: 4, value: 'sheriff' }),
      ev(2, 'exit', { seat: 6, value: 'killed' }),
      ev(2, 'first_killed', { seat: 6 }),
      ev(2, 'best_move', { seat: 6, value: '2,8' }),
      ev(3, 'game_end', { value: 'black' }),
    ]);
    expect(analysis.winner).toBe('black');
    expect(analysis.votesCast).toBe(3);
    expect(analysis.firstKilled).toBe(6);
    expect(analysis.bestMoveSeats).toEqual([2, 8]);
    const first = analysis.circles.find((circle) => circle.round === 1)!;
    expect(first.nominations.map((item) => item.seat)).toEqual([3, 5]);
    expect(first.votings).toHaveLength(1);
    expect(first.votings[0].votes).toEqual([{ candidate: 3, voters: [1, 2, 4] }]);
    expect(first.votings[0].outcome).toBe('single_eliminated');
    expect(first.exits).toEqual([{ seat: 3, reason: 'voted_day', phase: 'day_voting' }]);
    const second = analysis.circles.find((circle) => circle.round === 2)!;
    expect(second.shot).toBe(6);
    expect(second.donCheck).toEqual({ target: 4, result: 'sheriff' });
  });

  it('keeps a revote apart from the first voting of the same day', () => {
    seq = 0;
    const analysis = buildGameAnalysis([
      ev(2, 'vote', { seat: 1, target: 3, value: 1 }),
      ev(2, 'vote', { seat: 2, target: 5, value: 1 }),
      ev(2, 'vote_round_result', { value: '1:tie_revote' }),
      ev(2, 'vote', { seat: 1, target: 3, value: 2 }),
      ev(2, 'vote', { seat: 2, target: 3, value: 2 }),
      ev(2, 'vote_round_result', { value: '2:single_eliminated' }),
    ]);
    const votings = analysis.circles[0].votings;
    expect(votings.map((voting) => voting.number)).toEqual([1, 2]);
    expect(votings[0].outcome).toBe('tie_revote');
    expect(votings[1].votes).toEqual([{ candidate: 3, voters: [1, 2] }]);
  });

  it('returns an empty analysis without events', () => {
    expect(buildGameAnalysis([])).toMatchObject({ circles: [], winner: null, votesCast: 0 });
  });

  it('keeps resolved ballots and nominations when the engine clears them as housekeeping', () => {
    seq = 0;
    const analysis = buildGameAnalysis([
      ev(2, 'nomination', { seat: 3, by: 1, phase: 'day_speeches' }),
      ev(2, 'nomination', { seat: 5, by: 2, phase: 'day_speeches' }),
      ev(2, 'vote', { seat: 1, target: 3, value: 1 }),
      ev(2, 'vote', { seat: 2, target: 5, value: 1 }),
      ev(2, 'vote_round_result', { value: '1:tie_revote' }),
      // launching the revote clears the ballots of the resolved voting
      ev(2, 'vote_removed', { seat: 1, target: 3 }),
      ev(2, 'vote_removed', { seat: 2, target: 5 }),
      ev(2, 'vote', { seat: 1, target: 3, value: 2 }),
      ev(2, 'vote_round_result', { value: '2:single_eliminated' }),
      // night starts: the nominations are cleared
      ev(2, 'nomination_removed', { seat: 3, phase: 'night' }),
      ev(2, 'nomination_removed', { seat: 5, phase: 'night' }),
      ev(2, 'vote_removed', { seat: 1, target: 3 }),
    ]);
    const circle = analysis.circles[0];
    expect(circle.nominations.map((item) => item.seat)).toEqual([3, 5]);
    expect(circle.votings[0].votes).toEqual([{ candidate: 3, voters: [1] }, { candidate: 5, voters: [2] }]);
    expect(circle.votings[1].votes).toEqual([{ candidate: 3, voters: [1] }]);
    expect(analysis.votesCast).toBe(3);
  });

  it('counts a moved vote once', () => {
    seq = 0;
    const analysis = buildGameAnalysis([
      ev(2, 'vote', { seat: 1, target: 3, value: 1 }),
      ev(2, 'vote', { seat: 1, target: 5, value: 1 }),
    ]);
    expect(analysis.votesCast).toBe(1);
    expect(analysis.circles[0].votings[0].votes).toEqual([{ candidate: 5, voters: [1] }]);
  });
});
