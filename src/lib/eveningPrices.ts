import { formatRubles } from './formatRubleAmount.ts';
import { normalizeEveningFormat } from './eveningFormat.ts';
import { membershipOfPlayer } from './playerAccess.ts';
// The club evening depends on how often the player comes (owner, 2026-11-11): regulars 100 ₽ per game up to `casual_cap`,
// «иногда» (and another city) up to `sometimes_cap`, «перестал ходить» `stopped_game` per game up to `stopped_cap`.
export const DEFAULT_EVENING_PRICES = { casual_game: 100, casual_cap: 400, sometimes_cap: 500, stopped_game: 200, stopped_cap: 800, novice_game: 200, novice_cap: null as number | null, rating_entry: 500 };
export type EveningPrices = typeof DEFAULT_EVENING_PRICES;
export type ClubPriceTier = 'regular' | 'sometimes' | 'stopped';
export const CLUB_PRICE_TIERS: ClubPriceTier[] = ['regular', 'sometimes', 'stopped'];
export const isClubPriceTier = (value: unknown): value is ClubPriceTier => CLUB_PRICE_TIERS.includes(value as ClubPriceTier);
/** Price per game and the cap of one club evening for a player of the given tier. */
export const clubTierPrice = (policy: EveningPrices, tier: ClubPriceTier) => (
  tier === 'stopped' ? { game: policy.stopped_game, cap: policy.stopped_cap }
    : tier === 'sometimes' ? { game: policy.casual_game, cap: policy.sometimes_cap }
      : { game: policy.casual_game, cap: policy.casual_cap }
);
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

/**
 * Price tier of a club-evening player from «как ходит» (owner, 2026-11-11): «перестал ходить» → stopped; «другой город» and «иногда» →
 * sometimes; «ходит постоянно» → regular.
 */
export const clubPriceTierOf = (player: { club_role?: unknown; attends_sometimes?: unknown; stopped_attending?: unknown; from_other_city?: unknown } | null | undefined): ClubPriceTier => {
  if (!player) return 'sometimes';
  if (Number(player.stopped_attending || 0) === 1) return 'stopped';
  if (Number(player.from_other_city || 0) === 1) return 'sometimes';
  return membershipOfPlayer(player) === 'member' ? 'regular' : 'sometimes';
};

