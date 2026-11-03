import { describe, expect, it } from 'vitest';
import { chooseConflictingVipRule, validateVipProbabilityRule, vipEffectAllowed } from '../lib/vipRoleProbabilityRules.ts';

const base = {
  playerId: 'player-a', kind: 'role', role: 'sheriff',
  otherPlayerId: null, percent: 65, enabled: true, personalLimit: null, limitScope: 'evening',
};

describe('manual organizer VIP probabilities', () => {
  it('validates a named role and an exact integer chance', () => {
    expect(validateVipProbabilityRule(base)).toEqual(base);
    expect(validateVipProbabilityRule({ ...base, percent: 0 }).percent).toBe(0);
    expect(validateVipProbabilityRule({ ...base, percent: 100 }).percent).toBe(100);
  });
  it('supports manual quota period without silently interpreting bad values', () => {
    expect(validateVipProbabilityRule({ ...base, limitScope: 'game' }).limitScope).toBe('game');
    expect(validateVipProbabilityRule({ ...base, limitScope: 'evening' }).limitScope).toBe('evening');
    expect(() => validateVipProbabilityRule({ ...base, limitScope: 'week' })).toThrow();
  });
  it('requires another named player for same-color and different-color', () => {
    const colored = { ...base, kind: 'same_color', role: null, otherPlayerId: 'player-b' };
    expect(validateVipProbabilityRule(colored)).toMatchObject(colored);
    expect(validateVipProbabilityRule({ ...colored, kind: 'different_color' }).kind).toBe('different_color');
    expect(() => validateVipProbabilityRule({ ...colored, otherPlayerId: 'player-a' })).toThrow();
    expect(() => validateVipProbabilityRule({ ...colored, otherPlayerId: '' })).toThrow();
  });
  it('leaves manual per-player limit absent without inventing a default', () => {
    expect(validateVipProbabilityRule(base).personalLimit).toBeNull();
    expect(validateVipProbabilityRule({ ...base, personalLimit: 2 }).personalLimit).toBe(2);
    expect(() => validateVipProbabilityRule({ ...base, personalLimit: -1 })).toThrow();
  });
  it('rejects invalid percentages and role identifiers', () => {
    for (const percent of [-1, 101, 2.5, null, '90']) {
      expect(() => validateVipProbabilityRule({ ...base, percent })).toThrow();
    }
    expect(() => validateVipProbabilityRule({ ...base, role: 'unknown' })).toThrow();
  });
  it('chooses each already-triggered conflicting condition with equal weight', () => {
    const candidates = [
      { id: 'sheriff', percent: 70 },
      { id: 'same-color', percent: 80 },
      { id: 'different-color', percent: 25 },
    ];
    expect(chooseConflictingVipRule(candidates, (size) => { expect(size).toBe(3); return 0; })).toBe(candidates[0]);
    expect(chooseConflictingVipRule(candidates, () => 1)).toBe(candidates[1]);
    expect(chooseConflictingVipRule(candidates, () => 2)).toBe(candidates[2]);
  });
  it('handles no conflict and validates the random index', () => {
    expect(chooseConflictingVipRule([])).toBeNull();
    const only = { id: 'a' };
    expect(chooseConflictingVipRule([only], () => { throw new Error('should not draw'); })).toBe(only);
    expect(() => chooseConflictingVipRule([only, { id:'b' }], () => 2)).toThrow();
  });
  it('explicitly excludes rating and tournament formats from eventual activation', () => {
    expect(vipEffectAllowed('CASUAL')).toBe(true);
    expect(vipEffectAllowed('NOVICE')).toBe(true);
    expect(vipEffectAllowed('RATING')).toBe(false);
    expect(vipEffectAllowed('TOURNAMENT')).toBe(false);
  });
});
