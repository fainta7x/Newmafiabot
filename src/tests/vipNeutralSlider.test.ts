import { describe, expect, it } from 'vitest';
import { vipDealSeed, vipRulesForDeal } from '../lib/vipNeutralSlider';

const rule = (percent: number, kind: any = 'role', extra: any = {}) => ({ id: `r${percent}${kind}`, playerId: 'p1', kind, role: kind === 'role' ? 'sheriff' : null, otherPlayerId: kind.includes('color') && kind !== 'red_color' ? 'p2' : null, percent, enabled: true, ...extra });
const share = (percent: number, kind?: any) => {
  let inForce = 0; const N = 4000;
  for (let i = 0; i < N; i += 1) if (vipRulesForDeal([rule(percent, kind)], `deal-${i}`).length) inForce += 1;
  return inForce / N;
};

describe('VIP slider: 50 % is an ordinary deal (owner, 2026-11-03)', () => {
  it('50 % never acts; 100 % and 0 % always act; in between in proportion', () => {
    expect(share(50)).toBe(0);
    expect(share(100)).toBe(1);
    expect(share(0)).toBe(1);
    expect(share(75)).toBeGreaterThan(0.45); expect(share(75)).toBeLessThan(0.55);
    expect(share(25)).toBeGreaterThan(0.45); expect(share(25)).toBeLessThan(0.55);
  });

  it('above 50 the condition becomes the 100 % promise, below 50 the opposite promise', () => {
    expect(vipRulesForDeal([rule(100)], 'x')[0]).toMatchObject({ kind: 'role', role: 'sheriff', percent: 100 });
    expect(vipRulesForDeal([rule(0)], 'x')[0]).toMatchObject({ kind: 'role_not', role: 'sheriff', percent: 100 });
    expect(vipRulesForDeal([rule(0, 'red_color')], 'x')[0]).toMatchObject({ kind: 'role_not', role: 'citizen' });
    expect(vipRulesForDeal([rule(0, 'same_color')], 'x')[0]).toMatchObject({ kind: 'different_color', otherPlayerId: 'p2' });
    expect(vipRulesForDeal([rule(0, 'different_color')], 'x')[0]).toMatchObject({ kind: 'same_color' });
  });

  it('one deal gives one answer at every choice; a disabled condition never acts', () => {
    const seed = vipDealSeed(['c3', 'c1', 'c2']);
    expect(seed).toBe(vipDealSeed(['c1', 'c2', 'c3']));
    const answers = new Set(Array.from({ length: 20 }, () => vipRulesForDeal([rule(60)], seed).length));
    expect(answers.size).toBe(1);
    expect(vipRulesForDeal([{ ...rule(100), enabled: false }], seed)).toEqual([]);
  });
});
