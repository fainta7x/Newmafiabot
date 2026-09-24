/**
 * Rating evening money (user-approved 2026-09-24): every player pays a 500 ₽ entry fee before the
 * games; the collected fees are split 50 % to the evening's winner, 40 % to the judge and 10 % to
 * the season prize fund. A rating table is always 10 players, so a full evening is 5000 ₽:
 * 2500 / 2000 / 500. The judge's share is internal bookkeeping (organizers only).
 */
export const RATING_ENTRY_FEE = 500;
export const RATING_SHARES = { winner: 0.5, judge: 0.4, fund: 0.1 } as const;

export function ratingEveningSplit(collected: number) {
  const total = Math.max(0, Math.round(Number(collected || 0)));
  const judge = Math.round(total * RATING_SHARES.judge);
  const fund = Math.round(total * RATING_SHARES.fund);
  // The winner takes the rest, so rounding never loses or invents a rouble.
  return { total, winner: total - judge - fund, judge, fund };
}
