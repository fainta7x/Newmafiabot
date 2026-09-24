import { describe, expect, it } from 'vitest';
import { noviceScheduleLine, noviceStartsAt } from '../lib/eveningFormat.ts';

describe('novice evening schedule', () => {
  it('puts the briefing 30 minutes before the first game in Moscow time', () => {
    expect(noviceScheduleLine('2026-09-25T16:00:00.000Z')).toBe('Брифинг для новичков — 18:30, первая игра — 19:00');
    expect(noviceScheduleLine('')).toBeNull();
  });

  it('defaults the first game to 19:00, keeping a chosen date or taking the coming Friday', () => {
    expect(noviceStartsAt('2026-10-02T18:30')).toBe('2026-10-02T19:00');
    expect(noviceStartsAt('', new Date('2026-09-24T09:00:00Z'))).toBe('2026-09-25T19:00');
    expect(noviceStartsAt('', new Date('2026-09-25T09:00:00Z'))).toBe('2026-09-25T19:00');
    // Friday 19:30 Moscow: tonight's first game has passed.
    expect(noviceStartsAt('', new Date('2026-09-25T16:30:00Z'))).toBe('2026-10-02T19:00');
  });
});
