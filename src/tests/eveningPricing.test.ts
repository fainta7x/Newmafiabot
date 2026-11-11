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

describe('club evening price by «как ходит» (owner, 2026-11-11)', () => {
  it('prices a regular, an occasional and a stopped player', async () => {
    const { clubPriceTierOf } = await import('../server/services/eveningPaymentPricingService.ts');
    expect(calculateRegularEveningPlayedAmount(6, undefined, 'regular')).toBe(400);
    expect(calculateRegularEveningPlayedAmount(6, undefined, 'sometimes')).toBe(500);
    expect(calculateRegularEveningPlayedAmount(3, undefined, 'sometimes')).toBe(300);
    expect(calculateRegularEveningPlayedAmount(1, undefined, 'stopped')).toBe(200);
    expect(calculateRegularEveningPlayedAmount(3, undefined, 'stopped')).toBe(600);
    expect(calculateRegularEveningPlayedAmount(6, undefined, 'stopped')).toBe(800);
    expect(clubPriceTierOf({ club_role: 'member' })).toBe('regular');
    expect(clubPriceTierOf({ club_role: 'guest' })).toBe('sometimes');
    expect(clubPriceTierOf({ club_role: 'member', from_other_city: 1 })).toBe('sometimes');
    expect(clubPriceTierOf({ club_role: 'member', stopped_attending: 1 })).toBe('stopped');
  });

  it('keeps the old prices when settings saved before the tariffs are read', async () => {
    const { validateEveningPrices } = await import('../server/services/eveningPriceSettingsService.ts');
    const old = validateEveningPrices({ casual_game: 100, casual_cap: 400, novice_game: 200, novice_cap: null, rating_entry: 500 });
    expect(old).toMatchObject({ casual_cap: 400, sometimes_cap: 500, stopped_game: 200, stopped_cap: 800 });
  });
});
