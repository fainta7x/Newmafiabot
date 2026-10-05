import type { DatabaseWrapper } from '../../db/index.ts';
import type { AnalyticsRange } from '../../lib/analyticsPeriod.ts';
import { MEMBER_SQL } from './organizerAgendaService.ts';
import { PLAYER_VISITS_SQL } from './playerVisitsService.ts';

/** Aggregate canonical visits once. No per-player queries and no read-path mutations. */
export async function loadClubOverview(db: DatabaseWrapper, range: AnalyticsRange, now = Date.now()) {
  const row = await db.get<any>(`
    WITH visits AS (${PLAYER_VISITS_SQL}), ordered AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY datetime(starts_at), evening_id) AS n FROM visits
    ), stats AS (
      SELECT player_id, MIN(datetime(starts_at)) first_visit, MAX(datetime(starts_at)) last_visit,
        MAX(CASE WHEN n=2 THEN datetime(starts_at) END) second_visit,
        SUM(CASE WHEN datetime(starts_at)>=datetime(?) AND datetime(starts_at)<datetime(?) THEN 1 ELSE 0 END) period_visits
      FROM ordered GROUP BY player_id
    )
    SELECT COUNT(*) totalPlayers,
      COALESCE(SUM(period_visits),0) totalAttended,
      COALESCE(SUM(CASE WHEN period_visits>0 THEN 1 ELSE 0 END),0) activePlayers,
      COALESCE(SUM(CASE WHEN first_visit>=datetime(?) AND first_visit<datetime(?) THEN 1 ELSE 0 END),0) newPlayers,
      COALESCE(SUM(CASE WHEN julianday(?)-julianday(last_visit)>=30 AND julianday(?)-julianday(last_visit)<60 THEN 1 ELSE 0 END),0) inactive30,
      COALESCE(SUM(CASE WHEN julianday(?)-julianday(last_visit)>=60 AND julianday(?)-julianday(last_visit)<90 THEN 1 ELSE 0 END),0) inactive60,
      COALESCE(SUM(CASE WHEN julianday(?)-julianday(last_visit)>=90 THEN 1 ELSE 0 END),0) inactive90,
      COALESCE(SUM(CASE WHEN first_visit>=datetime(?) AND first_visit<datetime(?) AND julianday(?)-julianday(first_visit)>=30 THEN 1 ELSE 0 END),0) cohortFirstVisits,
      COALESCE(SUM(CASE WHEN first_visit>=datetime(?) AND first_visit<datetime(?) AND julianday(?)-julianday(first_visit)<30 THEN 1 ELSE 0 END),0) cohortPending,
      COALESCE(SUM(CASE WHEN first_visit>=datetime(?) AND first_visit<datetime(?) AND julianday(?)-julianday(first_visit)>=30 AND julianday(second_visit)-julianday(first_visit)<=30 THEN 1 ELSE 0 END),0) cohortReturnedIn30Days
    FROM players p LEFT JOIN stats s ON s.player_id=p.id WHERE ${MEMBER_SQL}`,
  [range.since, range.until, range.since, range.until,
    ...Array(5).fill(new Date(now).toISOString()),
    range.since, range.until, new Date(now).toISOString(),
    range.since, range.until, new Date(now).toISOString(),
    range.since, range.until, new Date(now).toISOString()]);
  const evenings = await db.get<any>(`SELECT COUNT(*) completedEvenings FROM game_evenings WHERE status='completed' AND datetime(starts_at)>=datetime(?) AND datetime(starts_at)<datetime(?)`, [range.since, range.until]);
  return { ...row, ...evenings, range, cohortRetention30dRate: row.cohortFirstVisits >= 5 ? Math.round(row.cohortReturnedIn30Days / row.cohortFirstVisits * 100) : null };
}

export async function loadClubFinance(db: DatabaseWrapper, range: AnalyticsRange) {
  const financialEvenings = `
    SELECT e.id, e.title, e.starts_at,
      COALESCE(SUM(CASE WHEN ep.payment_status<>'waived' THEN MAX(0,COALESCE(ep.amount_due,0)) ELSE 0 END),0) accrued,
      COALESCE(SUM(MAX(0,COALESCE(ep.amount_paid,0))),0) incomePaid,
      COALESCE(SUM(CASE WHEN ep.payment_status<>'waived' THEN MAX(0,COALESCE(ep.amount_due,0)-COALESCE(ep.amount_paid,0)) ELSE 0 END),0) outstandingDebt
    FROM game_evenings e LEFT JOIN evening_participants ep ON ep.evening_id=e.id AND ep.attendance_status='attended'
    WHERE (e.status='completed' OR e.settled_at IS NOT NULL) AND datetime(e.starts_at)>=datetime(?) AND datetime(e.starts_at)<datetime(?)
    GROUP BY e.id`;
  const params = [range.since, range.until];
  const totals = await db.get<any>(`WITH evenings AS (${financialEvenings}) SELECT COUNT(*) eveningCount, COALESCE(SUM(accrued),0) accrued, COALESCE(SUM(incomePaid),0) incomePaid, COALESCE(SUM(outstandingDebt),0) outstandingDebt FROM evenings`, params);
  const rows = await db.all<any>(`${financialEvenings} ORDER BY datetime(e.starts_at) DESC, e.id LIMIT 200`, params);
  const received = await db.get<any>(`SELECT COALESCE(SUM(amount),0) receivedInPeriod FROM financial_transactions WHERE type IN ('income','debt_paid') AND datetime(created_at)>=datetime(?) AND datetime(created_at)<datetime(?)`, [range.since, range.until]);
  return { ...totals, ...received, avgRevenuePerEvening: totals.eveningCount ? Math.round(totals.incomePaid / totals.eveningCount) : 0, evenings: rows, eveningsTruncated: totals.eveningCount > rows.length, range };
}
