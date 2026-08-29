import { describe, expect, it } from 'vitest';
import { canToggleVoteAssignment, getExplicitVoteCounts } from '../lib/liveVoting.js';

describe('live voting correction', () => {
  it('allows moving a voter directly from one nominee to another', () => {
    expect(canToggleVoteAssignment(7, 5, { 7: 2 })).toBe(true);
  });

  it('allows toggling a vote off the current nominee', () => {
    expect(canToggleVoteAssignment(7, 2, { 7: 2 })).toBe(true);
  });

  it('recounts correctly after a direct reassignment', () => {
    const assignments = { 1: 2, 7: 5 };
    expect(getExplicitVoteCounts([2, 5], assignments, [1, 7])).toEqual({ 2: 1, 5: 1 });
  });
});
