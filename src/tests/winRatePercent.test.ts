import { describe, expect, it } from 'vitest';
import { winRatePercent } from '../shared/stats.ts';

describe('the single win rate rule', () => {
  it('has one decimal and 0 without games', () => {
    expect(winRatePercent(4, 7)).toBe(57.1);
    expect(winRatePercent(2, 3)).toBe(66.7);
    expect(winRatePercent(1, 2)).toBe(50);
    expect(winRatePercent(0, 0)).toBe(0);
    expect(winRatePercent(3, -1)).toBe(0);
    expect(winRatePercent(5, Number.NaN)).toBe(0);
  });
});
