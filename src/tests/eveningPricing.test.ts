import { describe, expect, it } from 'vitest';
import {
  CLUB_EVENING_MAX_PRICE,
  calculateEveningSelectionTotal,
} from '../server/services/eveningSlotPlanningService.ts';
import { calculateRegularEveningPlayedAmount } from '../server/services/eveningPaymentPricingService.ts';

describe('regular club evening pricing', () => {
  it('charges 100 rubles per game up to four games', () => {
    expect(calculateEveningSelectionTotal('CASUAL', [100])).toBe(100);
    expect(calculateEveningSelectionTotal('CASUAL', [100, 100])).toBe(200);
    expect(calculateEveningSelectionTotal('CASUAL', [100, 100, 100])).toBe(300);
    expect(calculateEveningSelectionTotal('CASUAL', [100, 100, 100, 100])).toBe(400);
  });

  it('never charges more than 400 rubles for a regular club evening', () => {
    expect(CLUB_EVENING_MAX_PRICE).toBe(400);
    expect(calculateEveningSelectionTotal('CASUAL', [100, 100, 100, 100, 100])).toBe(400);
    expect(calculateEveningSelectionTotal('STANDARD', [100, 100, 100, 100, 100, 100])).toBe(400);
  });

  it('derives the final regular-evening charge from games actually played', () => {
    expect(calculateRegularEveningPlayedAmount(0)).toBe(0);
    expect(calculateRegularEveningPlayedAmount(1)).toBe(100);
    expect(calculateRegularEveningPlayedAmount(2)).toBe(200);
    expect(calculateRegularEveningPlayedAmount(3)).toBe(300);
    expect(calculateRegularEveningPlayedAmount(4)).toBe(400);
    expect(calculateRegularEveningPlayedAmount(6)).toBe(400);
  });

  it('does not apply the club cap to other evening formats', () => {
    expect(calculateEveningSelectionTotal('NOVICE', [100, 100, 100, 100, 100])).toBe(500);
    expect(calculateEveningSelectionTotal('RATING', [100, 100, 100, 100, 100])).toBe(500);
    expect(calculateEveningSelectionTotal('TOURNAMENT', [100, 100, 100, 100, 100])).toBe(500);
  });
});
