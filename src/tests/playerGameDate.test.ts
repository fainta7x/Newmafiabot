import { describe, expect, it } from 'vitest';
import { formatPlayerGameDate } from '../lib/playerGameDate.ts';

describe('shared player game date display', () => {
  it('keeps both archive and game-detail no-date fallback', () => {
    expect(formatPlayerGameDate(null)).toBe('Дата не указана');
    expect(formatPlayerGameDate('')).toBe('Дата не указана');
  });

  it('passes through an invalid nonempty date exactly', () => {
    expect(formatPlayerGameDate('unknown date')).toBe('unknown date');
  });

  it('formats the instant in Moscow timezone, not the browser timezone', () => {
    const instant = '2026-10-10T22:30:00.000Z'; // already 11 Oct in Moscow
    const expected = new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Europe/Moscow',
    }).format(new Date(instant));
    expect(formatPlayerGameDate(instant)).toBe(expected);
  });
});
