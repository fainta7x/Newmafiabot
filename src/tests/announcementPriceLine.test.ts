import { describe, expect, it } from 'vitest';
import { eveningPriceLabel, DEFAULT_EVENING_PRICES } from '../lib/eveningPrices.ts';
describe('canonical evening price copy', () => {
  it('uses configured prices and caps without promising automatic gifts', () => {
    expect(eveningPriceLabel('NOVICE')).toBe('200 ₽ за игру');
    expect(eveningPriceLabel('CASUAL')).toBe('100 ₽ за игру, не больше 400 ₽ за вечер');
    expect(eveningPriceLabel('RATING')).toBe('500 ₽ за вечер');
    expect(eveningPriceLabel('NOVICE', { ...DEFAULT_EVENING_PRICES, novice_game: 250, novice_cap: 500 })).toBe('250 ₽ за игру, не больше 500 ₽ за вечер');
  });
});
