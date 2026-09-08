import type { Request, Response, NextFunction } from 'express';
import { normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { CLUB_EVENING_MAX_PRICE } from '../services/eveningSlotPlanningService.ts';

const NO_STORE = 'no-store, no-cache, must-revalidate';

type PaymentRow = {
  payment_status?: string;
  amount_due?: number;
  amount_paid?: number;
  [key: string]: any;
};

const clampCurrentCasualPayment = (row: PaymentRow): PaymentRow => {
  if (String(row.payment_status || '') === 'waived') {
    return { ...row, amount_due: 0, amount_paid: 0, payment_status: 'waived' };
  }
  const amountDue = Math.min(CLUB_EVENING_MAX_PRICE, Math.max(0, Number(row.amount_due || 0)));
  const amountPaid = Math.min(amountDue, Math.max(0, Number(row.amount_paid || 0)));
  const paymentStatus = amountDue === 0
    ? 'paid'
    : amountPaid >= amountDue
      ? 'paid'
      : amountPaid > 0
        ? 'partial'
        : 'unpaid';
  return { ...row, amount_due: amountDue, amount_paid: amountPaid, payment_status: paymentStatus };
};

const withCurrentPaymentScope = (body: any) => {
  const snapshot = body?.snapshot;
  if (snapshot?.evening) {
    const casual = normalizeEveningFormat(snapshot.evening.format) === 'CASUAL';
    if (snapshot.roster && casual) {
      for (const key of ['expected', 'present', 'pending_attendance', 'unpaid'] as const) {
        if (Array.isArray(snapshot.roster[key])) snapshot.roster[key] = snapshot.roster[key].map(clampCurrentCasualPayment);
      }
      if (Array.isArray(snapshot.suggested_lineup)) snapshot.suggested_lineup = snapshot.suggested_lineup.map(clampCurrentCasualPayment);
      const unpaid = Array.isArray(snapshot.roster.unpaid)
        ? snapshot.roster.unpaid.filter((row: PaymentRow) => row.payment_status !== 'waived' && Number(row.amount_due || 0) > Number(row.amount_paid || 0))
        : [];
      snapshot.roster.unpaid = unpaid;
      snapshot.stats.unpaid_count = unpaid.length;
      snapshot.stats.unpaid_amount = unpaid.reduce(
        (sum: number, row: PaymentRow) => sum + Math.max(0, Number(row.amount_due || 0) - Number(row.amount_paid || 0)),
        0,
      );
    }
    snapshot.payment_context = {
      scope: 'current_or_upcoming_evening',
      evening: {
        id: snapshot.evening.id,
        title: snapshot.evening.title,
        starts_at: snapshot.evening.starts_at,
        format: snapshot.evening.format,
        status: snapshot.evening.status,
      },
      unpaid_count: Number(snapshot.stats?.unpaid_count || 0),
      unpaid_amount: Number(snapshot.stats?.unpaid_amount || 0),
    };
  }

  if (body?.wrapup?.evening) {
    body.wrapup.payment_scope = 'previous_evening_debt';
  }
  return body;
};

const withOverviewPaymentScopes = (body: any) => {
  if (body?.nextEvening) {
    body.currentPaymentContext = {
      scope: 'current_or_upcoming_evening',
      evening: {
        id: body.nextEvening.id,
        title: body.nextEvening.title,
        starts_at: body.nextEvening.starts_at,
        format: body.nextEvening.format,
        status: body.nextEvening.status,
      },
      unpaid_count: Number(body.nextEvening.expectedToPayCount || 0),
      unpaid_amount: Number(body.nextEvening.expectedToPayAmount || 0),
    };
  } else {
    body.currentPaymentContext = null;
  }
  if (Array.isArray(body?.actionLists?.unpaidParticipants)) {
    body.actionLists.unpaidParticipants = body.actionLists.unpaidParticipants.map((row: any) => ({
      ...row,
      payment_scope: 'previous_evening_debt',
    }));
  }
  return body;
};

export function crmReadFreshnessMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.method !== 'GET' || (req.path !== '/overview' && req.path !== '/command-center')) return next();

  res.setHeader('Cache-Control', NO_STORE);
  const originalJson = res.json.bind(res);
  res.json = ((body: any) => {
    if (req.path === '/command-center') return originalJson(withCurrentPaymentScope(body));
    return originalJson(withOverviewPaymentScopes(body));
  }) as typeof res.json;
  return next();
}

export { NO_STORE as CRM_READ_CACHE_CONTROL };
