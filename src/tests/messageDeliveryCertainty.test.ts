import { describe, expect, it } from 'vitest';
import { telegramDeliveryCertainty, mayRetryTelegramCancellation } from '../server/services/messageDeliveryCertainty.ts';

describe('Telegram delivery certainty', () => {
  it('separates acceptance, known rejection and uncertain acknowledgement', () => {
    expect(telegramDeliveryCertainty({ ok: true, status: 200 })).toBe('accepted');
    expect(telegramDeliveryCertainty({ ok: false, status: 429 })).toBe('rejected');
    expect(telegramDeliveryCertainty({ ok: false, status: 408 })).toBe('rejected');
    expect(telegramDeliveryCertainty({ ok: false, status: 503 })).toBe('uncertain');
    expect(telegramDeliveryCertainty({ ok: false, threw: true })).toBe('uncertain');
  });
  it('never automatically retries an ambiguously accepted cancellation', () => {
    expect(mayRetryTelegramCancellation('uncertain', true)).toBe(false);
    expect(mayRetryTelegramCancellation('rejected', true)).toBe(true);
    expect(mayRetryTelegramCancellation('rejected', false)).toBe(false);
  });
});
