import { describe, expect, it } from 'vitest';
import {
  CLUB_EVENING_MAX_PRICE,
  calculateEveningSelectionTotal,
} from '../server/services/eveningSlotPlanningService.ts';

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

  it('does not apply the club cap to other evening formats', () => {
    expect(calculateEveningSelectionTotal('NOVICE', [100, 100, 100, 100, 100])).toBe(500);
    expect(calculateEveningSelectionTotal('RATING', [100, 100, 100, 100, 100])).toBe(500);
    expect(calculateEveningSelectionTotal('TOURNAMENT', [100, 100, 100, 100, 100])).toBe(500);
  });
});
