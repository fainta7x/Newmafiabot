import { describe, expect, it } from 'vitest';
import { findDecidedVoteLeader } from '../lib/liveVoting.ts';

describe('voting leader that is already decided', () => {
  it('finds a candidate nobody can catch', () => {
    // 10 voters, #3 has 6, #5 has 1, the 3 voters left cannot change the leader
    expect(findDecidedVoteLeader({ nominated_seats: [3, 5, 7], vote_counts: { 3: 6, 5: 1, 7: 0 }, eligible_voters: 10 })).toBe(3);
  });

  it('is null while the leader can still be caught or shared', () => {
    expect(findDecidedVoteLeader({ nominated_seats: [3, 5], vote_counts: { 3: 4, 5: 2 }, eligible_voters: 10 })).toBeNull();
    expect(findDecidedVoteLeader({ nominated_seats: [3, 5], vote_counts: { 3: 5, 5: 0 }, eligible_voters: 10 })).toBeNull();
  });

  it('is null without a round or voters', () => {
    expect(findDecidedVoteLeader(null)).toBeNull();
    expect(findDecidedVoteLeader({ nominated_seats: [3], vote_counts: {}, eligible_voters: 0 })).toBeNull();
  });

  it('stops being decided when a removed voter took a ballot from the leader', () => {
    expect(findDecidedVoteLeader({ nominated_seats: [3, 5], vote_counts: { 3: 6, 5: 3 }, eligible_voters: 10 })).toBe(3);
    // one of the six voters was removed: his ballot is free again, 5 is no longer more than 3 + 2
    expect(findDecidedVoteLeader({ nominated_seats: [3, 5], vote_counts: { 3: 5, 5: 3 }, eligible_voters: 10 })).toBeNull();
  });
});
