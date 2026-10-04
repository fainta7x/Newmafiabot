/**
 * The single rule for a win rate shown anywhere (owner, 2026-10-04): a percentage with one decimal, 0 when there are no
 * games. Every screen and report uses this, so one player never shows 57.1% on one screen and 57% on another.
 */
export const winRatePercent = (wins: number, games: number): number => {
  const total = Number(games);
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.round((Number(wins) / total) * 1000) / 10;
};
