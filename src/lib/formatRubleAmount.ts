/**
 * Existing organizer CRM currency display for nonnegative whole rubles.
 * Presentation only: must not be reused to calculate prices or ledger entries.
 */
export const formatRubleAmount = (value: number): string =>
  `${Math.max(0, Math.round(Number(value || 0))).toLocaleString('ru-RU')} ₽`;
