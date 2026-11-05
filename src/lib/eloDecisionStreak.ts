/** One vote, check or will is one decision, even when a will names several players. */
export type StreakDecision<T> = { seq: number | null; items: T[]; sign: 1 | -1 };

export function decisionStreakSteps<T>(decisions: StreakDecision<T>[]): Map<T, number> {
  const steps = new Map<T, number>();
  let sign = 0;
  let length = 0;
  for (const decision of [...decisions].sort((a, b) => (a.seq ?? Infinity) - (b.seq ?? Infinity))) {
    if (!decision.items.length) continue;
    if (decision.seq === null || sign !== decision.sign) length = 0;
    sign = decision.sign;
    length += 1;
    steps.set(decision.items[0], length);
  }
  return steps;
}
