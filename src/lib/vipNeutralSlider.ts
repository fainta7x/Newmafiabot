import { createHash } from 'node:crypto';
import type { GameRole } from '../shared/gameRoles.ts';
import type { VipProbabilityRule } from './vipRoleProbabilityRules.ts';

/**
 * The owner's meaning of the VIP slider (2026-11-03): 50 % is an ordinary deal, 100 % always, 0 % never; in between the final
 * share moves evenly (25 % → half the ordinary chance, 75 % → halfway between ordinary and always), the same on every seat.
 *
 * How: once per deal and condition a die decides whether the condition is in force in this deal — with chance (p−50)/50 above
 * 50 % (then it works as the 100 % promise: checks and swaps at every choice, as agreed), with chance 1−p/50 below 50 % (then the
 * opposite promise is in force: never this role / never this colour). Final share = ordinary + (always − ordinary)·k, exactly
 * the line in the owner's table, whatever the seat. The die is fixed by the deal's own cards, so every choice of one deal sees
 * the same answer and a redeal rolls again.
 */
export type VipDealRule = Omit<VipProbabilityRule, 'kind'> & { kind: VipProbabilityRule['kind'] | 'role_not'; excludedRoles?: GameRole[] };

const roll = (seed: string, ruleId: string) => {
  const digest = createHash('sha256').update(`${seed}:${ruleId}`).digest();
  return digest.readUInt32BE(0) / 0x1_0000_0000;
};

const opposite = (rule: VipProbabilityRule): VipDealRule => {
  if (rule.kind === 'same_color') return { ...rule, kind: 'different_color', percent: 100 };
  if (rule.kind === 'different_color') return { ...rule, kind: 'same_color', percent: 100 };
  const role: GameRole = rule.kind === 'red_color' ? 'citizen' : (rule.role as GameRole);
  return { ...rule, kind: 'role_not', role, percent: 100 };
};

export function vipRulesForDeal(rules: readonly VipProbabilityRule[], seed: string): VipDealRule[] {
  const result: VipDealRule[] = [];
  for (const rule of rules) {
    if (!rule.enabled || rule.percent === 50) continue;
    const pull = rule.percent > 50 ? (rule.percent - 50) / 50 : 1 - rule.percent / 50;
    if (roll(seed, rule.id) >= pull) continue;
    result.push(rule.percent > 50 ? { ...rule, percent: 100 } : opposite(rule));
  }
  // «Never mafia» and «never don» of one player are one promise «never black»: kept apart, each was content with the other
  // black card and nobody saved a red card for him (owner, 2026-11-03: «при 0 % чёрная всё равно 4 %»).
  const merged: VipDealRule[] = [];
  for (const rule of result) {
    if (rule.kind !== 'role_not') { merged.push(rule); continue; }
    const same = merged.find((item) => item.kind === 'role_not' && item.playerId === rule.playerId);
    if (same) same.excludedRoles = [...new Set([...(same.excludedRoles || []), rule.role as GameRole])];
    else merged.push({ ...rule, excludedRoles: [rule.role as GameRole] });
  }
  return merged;
}

/** The deal's own seed: the ids of its full deck (they never change until a redeal). */
export const vipDealSeed = (cardIds: readonly string[]) => [...cardIds].sort().join(',');
