import { formatRubles } from './formatRubleAmount.ts';
import { normalizeEveningFormat } from './eveningFormat.ts';
export const DEFAULT_EVENING_PRICES = { casual_game: 100, casual_cap: 400, novice_game: 200, novice_cap: null as number | null, rating_entry: 500 };
export type EveningPrices = typeof DEFAULT_EVENING_PRICES;
export function eveningSelectionPrice(format: unknown, prices: number[], policy: EveningPrices = DEFAULT_EVENING_PRICES): number {
  const kind = normalizeEveningFormat(format);
  if (kind === 'RATING') return prices.length ? policy.rating_entry : 0;
  const sum = prices.reduce((total, value) => total + Math.max(0, Number(value) || 0), 0);
  const cap = kind === 'CASUAL' ? policy.casual_cap : kind === 'NOVICE' ? policy.novice_cap : null;
  return cap === null ? sum : Math.min(sum, cap);
}

export function eveningPriceLabel(format: unknown, policy: EveningPrices = DEFAULT_EVENING_PRICES): string {
  const kind = normalizeEveningFormat(format);
  if (kind === 'RATING') return `${formatRubles(policy.rating_entry)} за вечер`;
  const game = kind === 'NOVICE' ? policy.novice_game : policy.casual_game;
  const cap = kind === 'NOVICE' ? policy.novice_cap : policy.casual_cap;
  return `${formatRubles(game)} за игру${cap === null ? '' : `, не больше ${formatRubles(cap)} за вечер`}`;
}
