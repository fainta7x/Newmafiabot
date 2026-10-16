import { describe, expect, it } from 'vitest';
import { buildReplayBroadcastState } from '../lib/replayBroadcastState.ts';
import type { LiveGameEvent } from '../shared/liveGameEvents.ts';

const people = [
  { seat_number: 1, player_id: 'p1', nickname: 'Пристань', role: 'citizen' },
  { seat_number: 2, player_id: 'p2', nickname: 'Мафия', role: 'mafia' },
];
const events: LiveGameEvent[] = [
  { seq: 1, at: '', round: 1, phase: 'day_speeches', kind: 'nomination', seat: 1, by: 2 },
  { seq: 2, at: '', round: 1, phase: 'day_voting', kind: 'vote', seat: 2, target: 1, value: 1 },
  { seq: 3, at: '', round: 1, phase: 'day_voting', kind: 'vote_round_result', value: '1:single_eliminated' },
  { seq: 4, at: '', round: 1, phase: 'day_voting', kind: 'exit', seat: 1, value: 'voted_zero_round' },
];
describe('read-only OBS game replay', () => {
  it('progresses from nomination to recorded vote and confirmed exit without leaking future facts', () => {
    const first = buildReplayBroadcastState(people, events, 0, 12);
    expect(first.nominations.map(item => item.seat)).toEqual([1]);
    expect(first.vote).toBeNull();
    expect(first.players[0].alive).toBe(true);
    const vote = buildReplayBroadcastState(people, events, 2, 12);
    expect(vote.vote?.assignments[2]).toBe(1);
    expect(vote.vote?.published).toBe(true);
    expect(vote.players[0].alive).toBe(true);
    const result = buildReplayBroadcastState(people, events, 3, 12);
    expect(result.players[0].alive).toBe(false);
    expect(result.players[0].statusKind).toBe('voted');
    expect(result.timerSeconds).toBeNull();
  });
});
