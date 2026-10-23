import { describe, expect, it } from 'vitest';
import { PERSONAL_MESSAGE_MAX_RETRIES, personalMessageRetryDelayMs } from '../server/services/personalMessageRetryPolicy.ts';
describe('shared Telegram/VK personal-message retry timing', () => {
  it('preserves the existing 17-attempt exponential timing and 15 minute cap', () => {
    expect(PERSONAL_MESSAGE_MAX_RETRIES).toBe(17);
    expect([1, 2, 3, 10, 17].map(attempt => personalMessageRetryDelayMs(attempt))).toEqual([2000, 4000, 8000, 900000, 900000]);
  });
  it('respects Telegram Retry-After within the existing bounds', () => {
    expect(personalMessageRetryDelayMs(2, 1)).toBe(2000);
    expect(personalMessageRetryDelayMs(2, 10)).toBe(10000);
    expect(personalMessageRetryDelayMs(2, 3600)).toBe(900000);
    expect(personalMessageRetryDelayMs(2, null)).toBe(4000);
  });
});
