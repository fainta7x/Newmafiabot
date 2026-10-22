import { describe, expect, it } from 'vitest';
import { formatRubleAmount, formatRubles } from '../lib/formatRubleAmount.ts';

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

const group = (1200).toLocaleString('ru-RU').replace(/\d/g, '');

describe('one money format for the whole app (domain model, 2026-10-22)', () => {
  it('shows whole rubles with the Russian thousands separator', () => {
    expect(formatRubles(400)).toBe('400 ₽');
    expect(formatRubles(1200)).toBe(`1${group}200 ₽`);
    expect(formatRubles('350')).toBe('350 ₽');
    expect(formatRubles(99.6)).toBe('100 ₽');
  });

  it('shows junk and negatives as zero unless the amount may be signed', () => {
    for (const value of [null, undefined, '', 'abc', Number.NaN, -150]) expect(formatRubles(value)).toBe('0 ₽');
    expect(formatRubles(-150, { signed: true })).toBe(`${(-150).toLocaleString('ru-RU')} ₽`);
    expect(formatRubleAmount(-1)).toBe('0 ₽');
  });
});
