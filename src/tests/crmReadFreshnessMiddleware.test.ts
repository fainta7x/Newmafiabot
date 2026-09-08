import { describe, expect, it, vi } from 'vitest';
import { crmReadFreshnessMiddleware, CRM_READ_CACHE_CONTROL } from '../server/middleware/crmReadFreshness.ts';

const runMiddleware = (path: '/overview' | '/command-center', body: any) => {
  const headers = new Map<string, string>();
  let sent: any = null;
  const req = { method: 'GET', path } as any;
  const res: any = {
    setHeader: (name: string, value: string) => headers.set(name, value),
    json: (value: any) => { sent = value; return res; },
  };
  const next = vi.fn();
  crmReadFreshnessMiddleware(req, res, next);
  res.json(body);
  return { headers, sent, next };
};

describe('CRM read freshness middleware', () => {
  it.each(['/overview', '/command-center'] as const)('sets strict no-store headers for GET %s', (path) => {
    const result = runMiddleware(path, {});
    expect(result.headers.get('Cache-Control')).toBe(CRM_READ_CACHE_CONTROL);
    expect(result.next).toHaveBeenCalledOnce();
  });

  it('caps stale current CASUAL payment rows at the canonical 400 ₽ maximum without changing previous debt', () => {
    const result = runMiddleware('/command-center', {
      snapshot: {
        mode: 'upcoming',
        evening: { id: 'current', title: '11 сентября', starts_at: '2026-09-11T17:00:00.000Z', format: 'CASUAL', status: 'published' },
        stats: { unpaid_count: 1, unpaid_amount: 600 },
        roster: {
          expected: [{ participant_id: 'p1', payment_status: 'unpaid', amount_due: 600, amount_paid: 0 }],
          present: [], pending_attendance: [],
          unpaid: [{ participant_id: 'p1', payment_status: 'unpaid', amount_due: 600, amount_paid: 0 }],
        },
        suggested_lineup: [],
      },
      wrapup: {
        evening: { id: 'old', title: '4 сентября', starts_at: '2026-09-04T17:00:00.000Z' },
        unpaid: [{ id: 'old-p1', nickname: 'Millourt', amount_due: 600, amount_paid: 0 }],
        tasks: [],
      },
    });

    expect(result.sent.snapshot.roster.unpaid[0].amount_due).toBe(400);
    expect(result.sent.snapshot.stats.unpaid_amount).toBe(400);
    expect(result.sent.snapshot.payment_context).toMatchObject({
      scope: 'current_or_upcoming_evening',
      evening: { id: 'current', title: '11 сентября' },
      unpaid_amount: 400,
    });
    expect(result.sent.wrapup.payment_scope).toBe('previous_evening_debt');
    expect(result.sent.wrapup.unpaid[0].amount_due).toBe(600);
  });

  it('marks historical overview debts separately from the current/upcoming payment context', () => {
    const result = runMiddleware('/overview', {
      nextEvening: {
        id: 'current', title: '11 сентября', starts_at: '2026-09-11T17:00:00.000Z', format: 'CASUAL', status: 'published',
        expectedToPayCount: 2, expectedToPayAmount: 800,
      },
      actionLists: {
        unpaidParticipants: [{ player_id: 'millourt', evening_title: '4 сентября', evening_date: '2026-09-04T17:00:00.000Z', amount_due: 600, amount_paid: 0 }],
      },
    });

    expect(result.sent.currentPaymentContext).toMatchObject({
      scope: 'current_or_upcoming_evening',
      evening: { id: 'current', title: '11 сентября' },
    });
    expect(result.sent.actionLists.unpaidParticipants[0]).toMatchObject({
      evening_title: '4 сентября',
      payment_scope: 'previous_evening_debt',
    });
  });
});
