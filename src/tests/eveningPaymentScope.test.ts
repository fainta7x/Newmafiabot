import { describe, expect, it } from 'vitest';
import { isPaymentExpected } from '../lib/eveningPaymentScope.ts';

describe('whom the club waits for a payment', () => {
  it('novice evening: only players marked as arrived (owner, 2026-10-01)', () => {
    expect(isPaymentExpected('NOVICE', { attendance_status: 'attended', response_status: 'going' })).toBe(true);
    expect(isPaymentExpected('NOVICE', { attendance_status: 'pending', response_status: 'going' })).toBe(false);
    expect(isPaymentExpected('NOVICE', { attendance_status: 'pending', response_status: 'late' })).toBe(false);
  });

  it('other evenings also count «Иду» and «Приду позже»', () => {
    expect(isPaymentExpected('RATING', { attendance_status: 'pending', response_status: 'going' })).toBe(true);
    expect(isPaymentExpected('CASUAL', { attendance_status: 'pending', response_status: 'late' })).toBe(true);
    expect(isPaymentExpected('CASUAL', { attendance_status: 'pending', response_status: 'thinking' })).toBe(false);
  });
});
