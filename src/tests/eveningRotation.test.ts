import { describe, expect, it } from 'vitest';
import { getRotationPriority, sortEveningRotationCandidates, type RotationPreviousGame } from '../lib/eveningRotation.ts';

const previous: RotationPreviousGame = {
  protocol: {
    winner_team: 'red',
    first_killed_participant_id: 'first-killed',
    zero_round_voted_participant_id: 'zero-round',
    votes: [
      { day_number: 1, eliminated_seats: [6], outcome: 'single_eliminated' },
      { day_number: 2, eliminated_seats: [7], outcome: 'single_eliminated' },
    ],
  },
  player_results: [
    { participant_id: 'first-killed', seat_number: 1, role: 'mafia', exit_type: 'killed', notes: 'Убит ночью (Ночь 1)' },
    { participant_id: 'zero-round', seat_number: 2, role: 'citizen', exit_type: 'voted_zero_round' },
    { participant_id: 'winner', seat_number: 3, role: 'citizen', exit_type: 'alive' },
    { participant_id: 'loser-early', seat_number: 6, role: 'mafia', exit_type: 'voted_day' },
    { participant_id: 'loser-late', seat_number: 7, role: 'don', exit_type: 'voted_day' },
    { participant_id: 'loser-alive', seat_number: 8, role: 'mafia', exit_type: 'alive' },
  ],
};

const candidate = (id: string, playCount = 1) => ({ id, nickname: id, play_count: playCount });

describe('club evening rotation priority', () => {
  it('puts players who sat out the previous game first', () => {
    const sorted = sortEveningRotationCandidates([
      candidate('winner'), candidate('sat-out', 3), candidate('first-killed'),
    ], previous);
    expect(sorted.map((item) => item.id)).toEqual(['sat-out', 'first-killed', 'winner']);
  });

  it('keeps first killed and zero-round elimination ahead of the winning team', () => {
    const sorted = sortEveningRotationCandidates([
      candidate('winner'), candidate('zero-round'), candidate('first-killed'),
    ], previous);
    expect(sorted.slice(0, 2).map((item) => item.id).sort()).toEqual(['first-killed', 'zero-round']);
    expect(sorted[2].id).toBe('winner');
  });

  it('keeps winners ahead of ordinary losing-team players', () => {
    const sorted = sortEveningRotationCandidates([
      candidate('loser-early'), candidate('winner'),
    ], previous);
    expect(sorted.map((item) => item.id)).toEqual(['winner', 'loser-early']);
  });

  it('makes losing players who stayed longer the first candidates to sit out', () => {
    const sorted = sortEveningRotationCandidates([
      candidate('loser-alive'), candidate('loser-late'), candidate('loser-early'),
    ], previous);
    expect(sorted.map((item) => item.id)).toEqual(['loser-early', 'loser-late', 'loser-alive']);
  });

  it('uses evening play count only as a tie-break inside the same priority class', () => {
    const sorted = sortEveningRotationCandidates([
      candidate('sat-out-a', 3), candidate('sat-out-b', 1), candidate('winner', 0),
    ], previous);
    expect(sorted.map((item) => item.id)).toEqual(['sat-out-b', 'sat-out-a', 'winner']);
  });

  it('falls back to evening play count before the first completed game', () => {
    const sorted = sortEveningRotationCandidates([
      candidate('a', 2), candidate('b', 0), candidate('c', 1),
    ], null);
    expect(sorted.map((item) => item.id)).toEqual(['b', 'c', 'a']);
  });

  it('exposes a stable reason for UI explanations', () => {
    expect(getRotationPriority('sat-out', previous).reason).toBe('sat_out');
    expect(getRotationPriority('first-killed', previous).reason).toBe('early_exit');
    expect(getRotationPriority('winner', previous).reason).toBe('winner');
    expect(getRotationPriority('loser-alive', previous).reason).toBe('loser');
  });
});
