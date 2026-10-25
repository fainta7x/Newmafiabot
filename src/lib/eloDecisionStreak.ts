/** Equal-time statements use the mean series multiplier, so reordering a will cannot change Elo. */
export type StreakDecision<T> = { seq: number | null; items: T[]; sign: 1 | -1 };
export function decisionStreakMultipliers<T>(decisions: StreakDecision<T>[]): Map<T, number> {
  const multipliers = new Map<T, number>();
  let sign = 0; let length = 0;
  for (const decision of [...decisions].sort((a, b) => (a.seq ?? Infinity) - (b.seq ?? Infinity))) {
    if (!decision.items.length) continue;
    if (decision.seq === null || sign !== decision.sign) length = 0;
    sign = decision.sign;
    let total = 0;
    for (let i = 0; i < decision.items.length; i += 1) total += 1 + Math.min(length + i, 2) * 0.25;
    const factor = total / decision.items.length;
    for (const item of decision.items) multipliers.set(item, factor);
    length += decision.items.length;
  }
  return multipliers;
}
