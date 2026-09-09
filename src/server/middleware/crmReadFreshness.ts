import type { Request, Response, NextFunction } from 'express';

const NO_STORE = 'no-store, no-cache, must-revalidate';

const withCurrentPaymentScope = (body: any) => {
  const snapshot = body?.snapshot;
  if (snapshot?.evening) {
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
    const count = Math.max(0, Number(body.nextEvening.expectedToPayCount || 0));
    const amount = Math.max(0, Number(body.nextEvening.expectedToPayAmount || 0));
    body.currentPaymentContext = {
      scope: 'current_or_upcoming_evening',
      evening: {
        id: body.nextEvening.id,
        title: body.nextEvening.title,
        starts_at: body.nextEvening.starts_at,
        format: body.nextEvening.format,
        status: body.nextEvening.status,
      },
      unpaid_count: count,
      unpaid_amount: amount,
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
