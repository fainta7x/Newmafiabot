import { describe, expect, it } from 'vitest';
import { defaultZeroRoundRule, isZeroRoundRule } from '../shared/zeroRoundRule';

describe('zero-round rule (owner, 2026-10-23)', () => {
  it('tournament and rating evenings use the tournament rule, ordinary and novice evenings the club rule', () => {
    expect(defaultZeroRoundRule('RATING')).toBe('tournament');
    expect(defaultZeroRoundRule('TOURNAMENT')).toBe('tournament');
    expect(defaultZeroRoundRule('NOVICE')).toBe('club');
    expect(defaultZeroRoundRule('CASUAL')).toBe('club');
    expect(defaultZeroRoundRule('STANDARD')).toBe('club');
    expect(defaultZeroRoundRule(null)).toBe('club');
  });

  it('accepts only the two known rules', () => {
    expect(isZeroRoundRule('club')).toBe(true);
    expect(isZeroRoundRule('tournament')).toBe(true);
    expect(isZeroRoundRule('casual')).toBe(false);
    expect(isZeroRoundRule(undefined)).toBe(false);
  });
});
