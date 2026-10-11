import { describe, expect, it } from 'vitest';
import { formatRubleAmount } from '../lib/formatRubleAmount.ts';

describe('CRM money display', () => {
  it.each([
    [0, '0 ₽'],
    [10, '10 ₽'],
    [1000, '1 000 ₽'],
    [1200345, '1 200 345 ₽'],
    [4.6, '5 ₽'],
    [-12.3, '0 ₽'],
    [Number.NaN, '0 ₽'],
  ])('preserves existing nonnegative rounded ruble formatting for %s', (value, expected) => {
    expect(formatRubleAmount(value)).toBe(expected);
  });
});
