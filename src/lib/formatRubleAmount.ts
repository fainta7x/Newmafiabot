/**
 * The one way the app shows an amount of money (domain model, 2026-10-22): whole rubles with a thin
 * thousands separator, «1 200 ₽». Presentation only: never used to calculate prices or ledger entries.
 * Amounts are shown as zero when negative unless `signed` is set (balances and analytics may go below zero).
 */
export const formatRubles = (value: unknown, options: { signed?: boolean } = {}): string => {
  const number = Number(value);
  const rounded = Number.isFinite(number) ? Math.round(number) : 0;
  return `${(options.signed ? rounded : Math.max(0, rounded)).toLocaleString('ru-RU')} ₽`;
};

/** Existing organizer CRM name for the nonnegative form. */
export const formatRubleAmount = (value: number): string => formatRubles(value);
