import { describe, expect, it, vi } from 'vitest';

vi.mock('../server/auth.ts', () => ({ requireOrganizerAuth: (_req: unknown, _res: unknown, next: () => void) => next(), getPlayerSessionId: () => null }));
const { moscowWallTime } = await import('../server/routes/noviceRoutes.ts');

describe('novice evening schedule in Moscow time', () => {
  it('puts the group check on Thursday 20:00 and the decision on the day at 15:00 (MSK)', () => {
    const fridayEvening = new Date('2026-09-25T15:30:00.000Z'); // Friday 18:30 MSK
    expect(moscowWallTime(fridayEvening, (weekday) => -((weekday + 3) % 7), 20).toISOString()).toBe('2026-09-24T17:00:00.000Z');
    expect(moscowWallTime(fridayEvening, () => 0, 15).toISOString()).toBe('2026-09-25T12:00:00.000Z');
  });

  it('uses the Moscow date even when the UTC date differs', () => {
    const lateFriday = new Date('2026-09-25T22:30:00.000Z'); // Saturday 01:30 MSK
    expect(moscowWallTime(lateFriday, () => 0, 15).toISOString()).toBe('2026-09-26T12:00:00.000Z');
  });
});
