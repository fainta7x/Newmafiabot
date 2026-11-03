import { describe, expect, it } from 'vitest';
import { buildReplayGameState, replayAliveSeats } from '../lib/liveGameReplayState';

let seq = 0;
const e = (round: number, phase: string, kind: string, extra: Record<string, unknown> = {}) => ({ seq: ++seq, at: '', round, phase, kind, ...extra });

describe('table state from the chronology (AR04)', () => {
  it('phase and round follow the latest event; a new circle starts with empty nominations and night', () => {
    const state = buildReplayGameState([
      e(1, 'day_speeches', 'phase', { value: 'day_speeches' }),
      e(1, 'day_speeches', 'nomination', { seat: 4, by: 2 }),
      e(1, 'night', 'phase', { value: 'night' }),
      e(1, 'night', 'shot_target', { target: 7 }),
      e(2, 'day_speeches', 'phase', { value: 'day_speeches' }),
    ]);
    expect(state).toMatchObject({ round: 2, phase: 'day_speeches', nominations: [], shot: null });
  });

  it('exits and «Вернуть»', () => {
    const state = buildReplayGameState([
      e(1, 'night', 'exit', { seat: 2, value: 'killed' }),
      e(2, 'day_voting', 'exit', { seat: 5, value: 'voted_day' }),
      e(2, 'day_voting', 'exit', { seat: 9, value: 'removed' }),
      e(2, 'day_voting', 'restored', { seat: 9 }),
    ]);
    expect(state.exits).toEqual({ 2: 'killed', 5: 'voted_day' });
    expect(replayAliveSeats(state)).toEqual([1, 3, 4, 6, 7, 8, 9, 10]);
  });

  it('fouls are absolute counts, so taking one back (Undo) is read too', () => {
    const state = buildReplayGameState([
      e(2, 'day_speeches', 'foul', { seat: 9, value: 1 }),
      e(2, 'day_speeches', 'foul', { seat: 9, value: 0 }),
      e(2, 'day_speeches', 'foul', { seat: 9, value: 1 }),
      e(2, 'day_speeches', 'tech_minor', { seat: 3, value: 1 }),
    ]);
    expect(state.fouls[9]).toEqual({ foul: 1, tech_minor: 0, tech_major: 0 });
    expect(state.fouls[3]).toEqual({ foul: 0, tech_minor: 1, tech_major: 0 });
  });

  it('nominations and votes taken back; a voting result clears the ballots', () => {
    const state = buildReplayGameState([
      e(2, 'day_speeches', 'nomination', { seat: 4, by: 1 }),
      e(2, 'day_speeches', 'nomination', { seat: 6, by: 2 }),
      e(2, 'day_speeches', 'nomination_removed', { seat: 4 }),
      e(2, 'day_voting', 'vote', { seat: 1, target: 6, value: 1 }),
      e(2, 'day_voting', 'vote', { seat: 2, target: 6, value: 1 }),
      e(2, 'day_voting', 'vote_removed', { seat: 2 }),
    ]);
    expect(state.nominations).toEqual([{ seat: 6, by: 2 }]);
    expect(state.ballots).toEqual({ 1: 6 });
    const after = buildReplayGameState([e(2, 'day_voting', 'vote', { seat: 1, target: 6 }), e(2, 'day_voting', 'vote_round_result', { value: '1:single_eliminated' })]);
    expect(after.ballots).toEqual({});
  });

  it('night checks: the latest check of a round wins, every round is kept', () => {
    const state = buildReplayGameState([
      e(1, 'night', 'sheriff_check', { target: 3, value: 'red' }),
      e(1, 'night', 'sheriff_check', { target: 5, value: 'black' }),
      e(2, 'night', 'don_check', { target: 4, value: 'sheriff' }),
    ]);
    expect(state.checks).toEqual([
      { round: 1, kind: 'sheriff', target: 5, result: 'black' },
      { round: 2, kind: 'don', target: 4, result: 'sheriff' },
    ]);
    expect(state.donCheck).toEqual({ target: 4, result: 'sheriff' });
  });

  it('first killed, best move and the end of the game', () => {
    const state = buildReplayGameState([
      e(1, 'night', 'first_killed', { seat: 2 }),
      e(1, 'night', 'best_move', { seat: 2, value: '5,7,9' }),
      e(4, 'finished', 'game_end', { value: 'red' }),
    ]);
    expect(state).toMatchObject({ firstKilled: 2, bestMove: { seat: 2, seats: [5, 7, 9] }, ended: true, winner: 'red' });
  });

  it('reads events out of order by their sequence number', () => {
    const late = { seq: 20, at: '', round: 2, phase: 'day_voting', kind: 'exit', seat: 3, value: 'voted_day' };
    const early = { seq: 10, at: '', round: 2, phase: 'day_voting', kind: 'restored', seat: 3 };
    expect(buildReplayGameState([late, early]).exits).toEqual({ 3: 'voted_day' });
  });
});
