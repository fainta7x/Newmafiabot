import { randomInt } from 'node:crypto';
import type { GameRole } from '../shared/gameRoles.ts';
import { chooseConflictingVipRule, type VipProbabilityRule } from './vipRoleProbabilityRules.ts';

export type VipClosedCard = { id: string | number; role: GameRole };
export type VipDrawResult<T> = {
  deck: T[];
  appliedRuleIds: string[];
};

type DrawingContext = {
  playerId: string;
  /** Already revealed identities only; never predicts another player's future color. */
  revealedRolesByPlayer: ReadonlyMap<string, GameRole>;
  /** How many closed cards of each role must remain for higher-priority paid reservations. */
  protectedClosedRoles?: Partial<Record<GameRole, number>>;
  /** Caller's already-confirmed per-player/games quota. Null means unspecified, not unlimited authorization. */
  limitAllows: boolean;
};

const red = (role: GameRole) => role === 'citizen' || role === 'sheriff';
const ALL_ROLES: GameRole[] = ['citizen','sheriff','mafia','don'];
const eligibleRoles = (rule: VipProbabilityRule, context: DrawingContext): GameRole[] => {
  if (rule.kind === 'red_color') return ['citizen','sheriff'];
  if (rule.kind === 'role') return rule.role ? [rule.role] : [];
  const peerRole = context.revealedRolesByPlayer.get(rule.otherPlayerId || '');
  if (!peerRole) return []; // Cannot inspect, reserve or influence an unrevealed peer.
  const wantRed = rule.kind === 'same_color' ? red(peerRole) : !red(peerRole);
  return ALL_ROLES.filter(role => red(role) === wantRed);
};

/**
 * Pure rehearsal engine only. The service controls format, paid role priority,
 * atomic quota, and concurrency before it may call this.
 *
 * Draw each configured chance independently. If triggered constraints can all
 * be satisfied, apply their intersection; when the intersection is empty,
 * choose one valid triggered condition with equal chances (not a weighted
 * selection by its configured percentage). Unavailable requirements do not
 * manufacture cards or alter a previously confirmed card.
 */
export function simulateVipDraw<T extends VipClosedCard>(
  closedDeck: readonly T[],
  selectedCardId: T['id'],
  rules: readonly VipProbabilityRule[],
  context: DrawingContext,
  randomIndex: (maxExclusive: number) => number = randomInt,
): VipDrawResult<T> {
  const unchanged = (): VipDrawResult<T> => ({ deck: [...closedDeck], appliedRuleIds: [] });
  if (!context.limitAllows || !closedDeck.length) return unchanged();
  const selected = closedDeck.find(card => card.id === selectedCardId);
  if (!selected) return unchanged();
  const protectedCounts = context.protectedClosedRoles || {};
  const counts = (role: GameRole) => closedDeck.filter(card => card.role === role).length;
  const canChooseRole = (role: GameRole) =>
    counts(role) > (protectedCounts[role] ?? 0);
  const triggered: Array<{ rule: VipProbabilityRule; acceptable: GameRole[] }> = [];
  for (const rule of rules) {
    if (rule.playerId !== context.playerId || !rule.enabled || rule.percent <= 0) continue;
    const acceptable = eligibleRoles(rule, context).filter(canChooseRole);
    if (!acceptable.length) continue;
    if (randomIndex(100) >= rule.percent) continue;
    triggered.push({ rule, acceptable });
  }
  if (!triggered.length) return unchanged();
  const compatible = triggered.reduce<GameRole[]>((current, entry) =>
    current.filter(role => entry.acceptable.includes(role)), [...ALL_ROLES]);
  const chosen = compatible.length
    ? triggered
    : [chooseConflictingVipRule(triggered, randomIndex)!];
  const candidates = compatible.length ? compatible : chosen[0].acceptable;
  const targetRole = candidates.includes(selected.role)
    ? selected.role
    : candidates[randomIndex(candidates.length)];
  // A naturally drawn matching role is not a successful paid/VIP substitution.
  // Never consume a future quota when the physical cards were unchanged.
  if (targetRole === selected.role) return unchanged();
  const donor = closedDeck.find(card => card.id !== selectedCardId && card.role === targetRole);
  if (!donor) return unchanged();
  return {
    deck: closedDeck.map(card =>
      card.id === selectedCardId ? { ...card, role: donor.role }
        : card.id === donor.id ? { ...card, role: selected.role }
          : card,
    ),
    appliedRuleIds: chosen.map(entry => entry.rule.id),
  };
}
