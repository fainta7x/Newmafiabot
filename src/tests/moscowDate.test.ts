import { describe, expect, it } from 'vitest';
import { formatMoscowDate } from '../lib/moscowDate.ts';

describe('one Moscow date format (domain model, 2026-10-22)', () => {
  const late = '2026-10-22T22:30:00Z'; // already 23 October in Moscow

  it('always shows the Moscow calendar day in one of the fixed styles', () => {
    expect(formatMoscowDate(late)).toBe('23.10.2026');
    expect(formatMoscowDate(late, 'short')).toBe(new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Moscow' }).format(new Date(late)));
    expect(formatMoscowDate('2026-10-02T09:00:00Z', 'long')).toBe('2 октября 2026 г.');
    expect(formatMoscowDate(late, 'short-time')).toContain('01:30');
  });

  it('shows the chosen placeholder for a missing date and keeps a hand-typed one only when asked', () => {
    expect(formatMoscowDate(null)).toBeNull();
    expect(formatMoscowDate('', 'numeric', { empty: '—' })).toBe('—');
    expect(formatMoscowDate('позже', 'numeric', { empty: '—' })).toBe('—');
    expect(formatMoscowDate('позже', 'numeric', { invalidAsRaw: true })).toBe('позже');
  });
});
