import { describe, expect, it } from 'vitest';
import { venueDetails, venueLine } from './venues.ts';

describe('venues', () => {
  it('adds the address and a Yandex map link to the club venue', () => {
    expect(venueLine('Суп с Котом')).toBe('Суп с Котом, Пушкинский проезд, 4А');
    expect(venueLine('«суп с котом»')).toBe('«суп с котом», Пушкинский проезд, 4А');
    expect(venueDetails(null).mapUrl).toMatch(/^https:\/\/yandex\.ru\/maps\/\?text=/);
  });

  it('keeps an unknown venue as it is, without a map link', () => {
    expect(venueDetails('Лофт')).toEqual({ name: 'Лофт', address: null, mapUrl: null });
  });
});
