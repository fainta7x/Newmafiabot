import { describe, expect, it } from 'vitest';
import { announcementPriceLine } from '../server/services/vkDirectJoinPublishingService.ts';

describe('announcement price line', () => {
  it('tells newcomers the first evenings are free and regulars the evening cap', () => {
    expect(announcementPriceLine('NOVICE', 200)).toBe('💳 Первые 2 вечера — бесплатно, дальше 200 ₽ за игру');
    expect(announcementPriceLine('CASUAL', 100)).toBe('💳 100 ₽ за игру, не больше 400 ₽ за вечер');
    expect(announcementPriceLine('RATING', 150)).toBe('💳 150 ₽ за игру');
  });
});
