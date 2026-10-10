import { describe, expect, it } from 'vitest';
import { quickSplitAssignments } from '../lib/liveVoting.ts';

const table = Array.from({ length: 10 }, (_, index) => index + 1);
const tally = (votes: Record<number, number>) => Object.values(votes).reduce<Record<number, number>>((sum, nominee) => ({ ...sum, [nominee]: (sum[nominee] || 0) + 1 }), {});

describe('one-button zero-round split (owner, 2026-10-10)', () => {
  it('splits ten hands five to five between any two nominees', () => {
    for (let a = 1; a <= 10; a += 1) for (let b = a + 1; b <= 10; b += 1) {
      const votes = quickSplitAssignments([a, b], table);
      expect(votes, `${a}/${b}`).not.toBeNull();
      expect(Object.keys(votes!)).toHaveLength(10);
      expect(tally(votes!)).toEqual({ [a]: 5, [b]: 5 });
    }
  });

  it('follows the club scheme and ignores the order the pair was picked in', () => {
    expect(quickSplitAssignments([2, 1], table)).toEqual(quickSplitAssignments([1, 2], table));
    const votes = quickSplitAssignments([1, 2], table)!;
    expect([2, 3, 4, 5, 6].every((seat) => votes[seat] === 1)).toBe(true);
    expect([1, 7, 8, 9, 10].every((seat) => votes[seat] === 2)).toBe(true);
  });

  it('is not offered for a table that is not full or a pair that is not two seats', () => {
    expect(quickSplitAssignments([1, 2], table.slice(1))).toBeNull();
    expect(quickSplitAssignments([4, 4], table)).toBeNull();
  });
});
