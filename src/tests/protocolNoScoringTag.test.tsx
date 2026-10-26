/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useProtocolEditing } from '../components/crm/gameProtocol/useProtocolEditing';

// GPT review 2026-10-26 [P1]: the «без оценок» tag used changeRound, which reset the confirmed result, dropped the revote
// and could bring a voted-out player back. The tag is scoring metadata only.
describe('the «без оценок» tag keeps the voting as it is', () => {
  const votes = [
    { day_number: 2, round_number: 1, nominated_seats: [3, 7], vote_counts: { 3: 4, 7: 4 }, eligible_voters: 8, outcome: 'tie_revote', eliminated_seats: [] },
    { day_number: 2, round_number: 2, is_revote: true, nominated_seats: [3, 7], vote_counts: { 3: 5, 7: 3 }, eligible_voters: 8, outcome: 'single_eliminated', eliminated_seats: [3] },
  ];
  it('sets and clears only no_scoring', () => {
    let state: any = { votes, shots: [] };
    const hook = renderHook(() => useProtocolEditing({ protocol: state, setProtocol: (next: any) => { state = typeof next === 'function' ? next(state) : next; }, playerResults: [], setPlayerResults: () => {} } as any));
    hook.result.current.members.setRoundNoScoring(0, true);
    expect(state.votes).toEqual([{ ...votes[0], no_scoring: true }, votes[1]]);
    hook.result.current.members.setRoundNoScoring(0, false);
    expect(state.votes).toEqual(votes);
  });
});
