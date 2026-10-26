/**
 * A series is correct decisions made at **different moments** of the game (owner, 2026-10-26): one vote, one check, one
 * will. Several colours named in the same will are one decision, so they all get the same factor and add one step.
 */
export type StreakDecision<T> = { seq: number | null; items: T[]; sign: 1 | -1 };
export function decisionStreakMultipliers<T>(decisions: StreakDecision<T>[]): Map<T, number> {
  const multipliers = new Map<T, number>();
  let sign = 0; let length = 0;
  for (const decision of [...decisions].sort((a, b) => (a.seq ?? Infinity) - (b.seq ?? Infinity))) {
    if (!decision.items.length) continue;
    if (decision.seq === null || sign !== decision.sign) length = 0;
    sign = decision.sign;
    const factor = 1 + Math.min(length, 2) * 0.25;
    for (const item of decision.items) multipliers.set(item, factor);
    length += 1;
  }
  return multipliers;
}
