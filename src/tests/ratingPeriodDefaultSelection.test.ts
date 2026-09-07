import { describe, expect, it } from 'vitest';
import { pickDefaultRatingPeriodId } from '../components/crm/RatingPeriodsCRM.tsx';

const period = (id: string, status: string, starts_at: string, ends_at: string) => ({
  id,
  title: id,
  type: 'RATING' as const,
  starts_at,
  ends_at,
  status,
  auto_include: true,
});

describe('CRM rating period default selection', () => {
  it('prefers the active period containing today over a newer future period', () => {
    const now = new Date('2026-09-07T12:00:00Z').getTime();
    const periods = [
      period('future', 'active', '2026-10-01T00:00:00Z', '2026-12-31T23:59:59Z'),
      period('current', 'active', '2026-08-01T00:00:00Z', '2026-09-30T23:59:59Z'),
      period('old', 'completed', '2026-01-01T00:00:00Z', '2026-03-31T23:59:59Z'),
    ];

    expect(pickDefaultRatingPeriodId(periods, now)).toBe('current');
  });

  it('falls back to the newest active period, then the first returned period', () => {
    const now = new Date('2026-09-07T12:00:00Z').getTime();
    expect(pickDefaultRatingPeriodId([
      period('future', 'active', '2026-10-01T00:00:00Z', '2026-12-31T23:59:59Z'),
      period('old', 'completed', '2026-01-01T00:00:00Z', '2026-03-31T23:59:59Z'),
    ], now)).toBe('future');
    expect(pickDefaultRatingPeriodId([
      period('completed-newest', 'completed', '2026-04-01T00:00:00Z', '2026-06-30T23:59:59Z'),
      period('completed-old', 'completed', '2026-01-01T00:00:00Z', '2026-03-31T23:59:59Z'),
    ], now)).toBe('completed-newest');
    expect(pickDefaultRatingPeriodId([], now)).toBeNull();
  });
});
