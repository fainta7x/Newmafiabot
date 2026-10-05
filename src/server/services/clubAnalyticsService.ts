import type { DatabaseWrapper } from '../../db/index.ts';
import type { AnalyticsRange } from '../../lib/analyticsPeriod.ts';
import { MEMBER_SQL } from './organizerAgendaService.ts';
import { PLAYER_VISITS_SQL } from './playerVisitsService.ts';
import { playerSourceLabel } from '../../lib/playerSources.ts';
import { parseAnalyticsPeriod } from '../../lib/analyticsPeriod.ts';
export async function loadClubStaff(db: DatabaseWrapper, range: AnalyticsRange) {
    const tables = new Set((await db.all<any>("SELECT name FROM sqlite_master WHERE type = 'table'")).map((row: any) => String(row.name)));
    const { since, until } = range;
    const rows = new Map<string, { player_id: string; nickname: string; evenings: number; games: number }>();
    const bump = (id: string, nickname: string, field: 'evenings' | 'games', count: number) => {
      const row = rows.get(id) || { player_id: id, nickname, evenings: 0, games: 0 };
      row[field] += count;
      rows.set(id, row);
    };
    if (tables.has('evening_staff_assignments')) {
      for (const row of await db.all<any>(`
        SELECT s.organizer_player_id AS id, p.nickname, COUNT(*) AS count
          FROM evening_staff_assignments s
          JOIN game_evenings e ON e.id = s.evening_id
          JOIN players p ON p.id = s.organizer_player_id
         WHERE (e.status = 'completed' OR e.settled_at IS NOT NULL) AND julianday(e.starts_at) >= julianday(?) AND julianday(e.starts_at) < julianday(?)
         GROUP BY s.organizer_player_id, p.nickname`, [since, until])) bump(String(row.id), String(row.nickname), 'evenings', Number(row.count));
    }
    // Completed tournaments count as organized evenings of the tournament's organizer.
    if (tables.has('tournaments') && (await db.all<any>('PRAGMA table_info(tournaments)')).some((column: any) => column.name === 'organizer_player_id')) {
      for (const row of await db.all<any>(`
        SELECT t.organizer_player_id AS id, p.nickname, COUNT(*) AS count
          FROM tournaments t JOIN players p ON p.id = t.organizer_player_id
         WHERE t.status = 'completed' AND julianday(t.date) >= julianday(?) AND julianday(t.date) < julianday(?)
         GROUP BY t.organizer_player_id, p.nickname`, [since, until])) bump(String(row.id), String(row.nickname), 'evenings', Number(row.count));
    }
    const clubGames = await db.all<any>(`
      SELECT g.judge_player_id AS id, p.nickname, g.protocol_text
        FROM games g JOIN players p ON p.id = g.judge_player_id
        LEFT JOIN game_evenings e ON e.id = g.evening_id
       WHERE g.archived_at IS NULL AND julianday(COALESCE(e.starts_at, g.created_at)) >= julianday(?) AND julianday(COALESCE(e.starts_at, g.created_at)) < julianday(?)`, [since, until]);
    for (const game of clubGames) {
      let completed = false;
      try { const payload = JSON.parse(String(game.protocol_text || '')); completed = payload?.kind === 'club_evening_protocol' && payload.protocol?.status === 'completed'; } catch { completed = false; }
      if (completed) bump(String(game.id), String(game.nickname), 'games', 1);
    }
    if (tables.has('tournament_games')) {
      const judge = (await db.all<any>('PRAGMA table_info(tournaments)')).some((column: any) => column.name === 'judge_player_id')
        ? 'COALESCE(tg.judge_player_id, t.judge_player_id)' : 'tg.judge_player_id';
      for (const row of await db.all<any>(`
        SELECT ${judge} AS id, p.nickname, COUNT(*) AS count
          FROM tournament_games tg
          JOIN tournaments t ON t.id = tg.tournament_id
          JOIN players p ON p.id = ${judge}
         WHERE tg.status = 'completed' AND julianday(tg.completed_at) >= julianday(?) AND julianday(tg.completed_at) < julianday(?)
         GROUP BY ${judge}, p.nickname`, [since, until])) bump(String(row.id), String(row.nickname), 'games', Number(row.count));
    }
    const staff = [...rows.values()].sort((a, b) => (b.evenings + b.games) - (a.evenings + a.games) || a.nickname.localeCompare(b.nickname, 'ru'));

    return { period: range.id, label: range.label, since: range.since, until: range.until, staff };
}


export async function resolveAnalyticsRange(db: DatabaseWrapper, period: string, now = Date.now()) {
  const season = period === 'season' ? await db.get<any>(`SELECT title, starts_at, ends_at FROM rating_periods WHERE type='RATING' AND status='active'
    ORDER BY CASE WHEN julianday(CASE WHEN length(starts_at)=10 THEN starts_at||'T00:00:00+03:00' ELSE starts_at END)<=julianday(?)
      AND julianday(CASE WHEN length(ends_at)=10 THEN ends_at||'T00:00:00+03:00' ELSE ends_at END)+CASE WHEN length(ends_at)=10 THEN 1 ELSE 1.0/86400000 END>julianday(?) THEN 0 ELSE 1 END, starts_at DESC LIMIT 1`, [new Date(now).toISOString(), new Date(now).toISOString()]) : null;
  return parseAnalyticsPeriod(period, now, season);
}

/** Aggregate canonical visits once. No per-player queries and no read-path mutations. */
export async function loadClubOverview(db: DatabaseWrapper, range: AnalyticsRange, now = Date.now()) {
  const row = await db.get<any>(`
    WITH visits AS (${PLAYER_VISITS_SQL}), ordered AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY julianday(starts_at), evening_id) AS n FROM visits
    ), stats AS (
      SELECT player_id, MIN(julianday(starts_at)) first_visit, MAX(julianday(starts_at)) last_visit,
        MAX(CASE WHEN n=2 THEN julianday(starts_at) END) second_visit,
        COUNT(*) total_visits,
        SUM(CASE WHEN julianday(starts_at)>=julianday(?) AND julianday(starts_at)<julianday(?) THEN 1 ELSE 0 END) period_visits
      FROM ordered GROUP BY player_id
    )
    SELECT COUNT(*) totalPlayers,
      SUM(CASE WHEN COALESCE(total_visits,0)=0 THEN 1 ELSE 0 END) neverPlayed,
      SUM(CASE WHEN total_visits=1 THEN 1 ELSE 0 END) playedOnce,
      SUM(CASE WHEN total_visits BETWEEN 2 AND 3 THEN 1 ELSE 0 END) playedTwoOrThree,
      SUM(CASE WHEN total_visits>=4 THEN 1 ELSE 0 END) playedFourPlus,
      SUM(CASE WHEN p.game_level='novice' THEN 1 ELSE 0 END) noviceLevel,
      SUM(CASE WHEN p.game_level IN ('club','tournament') THEN 1 ELSE 0 END) clubApproved,
      SUM(CASE WHEN p.game_level='tournament' THEN 1 ELSE 0 END) tournamentApproved,
      SUM(CASE WHEN p.game_level='novice' AND total_visits>=2 THEN 1 ELSE 0 END) readyForClubReview,
      COALESCE(SUM(period_visits),0) totalAttended,
      COALESCE(SUM(CASE WHEN period_visits>0 THEN 1 ELSE 0 END),0) activePlayers,
      COALESCE(SUM(CASE WHEN first_visit>=julianday(?) AND first_visit<julianday(?) THEN 1 ELSE 0 END),0) newPlayers,
      COALESCE(SUM(CASE WHEN julianday(?)-julianday(last_visit)>=30 AND julianday(?)-julianday(last_visit)<60 THEN 1 ELSE 0 END),0) inactive30,
      COALESCE(SUM(CASE WHEN julianday(?)-julianday(last_visit)>=60 AND julianday(?)-julianday(last_visit)<90 THEN 1 ELSE 0 END),0) inactive60,
      COALESCE(SUM(CASE WHEN julianday(?)-julianday(last_visit)>=90 THEN 1 ELSE 0 END),0) inactive90,
      COALESCE(SUM(CASE WHEN first_visit>=julianday(?) AND first_visit<julianday(?) AND julianday(?)-julianday(first_visit)>=30 THEN 1 ELSE 0 END),0) cohortFirstVisits,
      COALESCE(SUM(CASE WHEN first_visit>=julianday(?) AND first_visit<julianday(?) AND julianday(?)-julianday(first_visit)<30 THEN 1 ELSE 0 END),0) cohortPending,
      COALESCE(SUM(CASE WHEN first_visit>=julianday(?) AND first_visit<julianday(?) AND julianday(?)-julianday(first_visit)>=30 AND julianday(second_visit)-julianday(first_visit)<=30 THEN 1 ELSE 0 END),0) cohortReturnedIn30Days
    FROM players p LEFT JOIN stats s ON s.player_id=p.id WHERE ${MEMBER_SQL}`,
  [range.since, range.until, range.since, range.until,
    ...Array(5).fill(new Date(now).toISOString()),
    range.since, range.until, new Date(now).toISOString(),
    range.since, range.until, new Date(now).toISOString(),
    range.since, range.until, new Date(now).toISOString()]);
  const evenings = await db.get<any>(`WITH visits AS (${PLAYER_VISITS_SQL}), counts AS (
    SELECT v.evening_id,COUNT(*) visits FROM visits v JOIN players p ON p.id=v.player_id WHERE ${MEMBER_SQL} GROUP BY v.evening_id
  ), capacities AS (SELECT evening_id, COUNT(*)*10 seats FROM evening_game_slots WHERE status<>'cancelled' GROUP BY evening_id)
    SELECT COUNT(*) completedEvenings, COALESCE(SUM(CASE WHEN seats>0 THEN 1 ELSE 0 END),0) fillEvenings,
      COALESCE(SUM(CASE WHEN COALESCE(seats,0)=0 THEN 1 ELSE 0 END),0) fillSkipped,
      AVG(CASE WHEN seats>0 THEN COALESCE(visits,0)*1.0/seats END) fillRate
    FROM game_evenings e LEFT JOIN counts c ON c.evening_id=e.id LEFT JOIN capacities s ON s.evening_id=e.id
    WHERE e.status='completed' AND julianday(starts_at)>=julianday(?) AND julianday(starts_at)<julianday(?)`, [range.since, range.until]);
  const sources = await db.all<{ source: string; count: number }>(`WITH visits AS (${PLAYER_VISITS_SQL}), firsts AS (SELECT player_id,MIN(julianday(starts_at)) first_visit FROM visits GROUP BY player_id), counts AS (
    SELECT TRIM(COALESCE(p.source,'')) source,COUNT(*) count FROM players p JOIN firsts f ON f.player_id=p.id
    WHERE ${MEMBER_SQL} AND first_visit>=julianday(?) AND first_visit<julianday(?) GROUP BY TRIM(COALESCE(p.source,''))
  ), ranked AS (SELECT *,ROW_NUMBER() OVER (ORDER BY count DESC,source) n FROM counts)
    SELECT CASE WHEN n<=30 THEN source ELSE '__other__' END source,SUM(count) count FROM ranked GROUP BY CASE WHEN n<=30 THEN source ELSE '__other__' END`, [range.since, range.until]);
  const sourceBreakdown: Record<string, number> = Object.create(null);
  for (const source of sources) { const label = playerSourceLabel(source.source); sourceBreakdown[label] = (sourceBreakdown[label] || 0) + source.count; }
  const participantStats = await db.get<any>(`SELECT
      SUM(CASE WHEN COALESCE(ep.response_status,'')<>'declined' AND (ep.response_status IN ('going','late') OR ep.registration_status IN ('going','confirmed','registered') OR ep.attendance_status IN ('attended','no_show')) THEN 1 ELSE 0 END) totalRegistrations,
      SUM(CASE WHEN ep.response_status='declined' AND ep.registered_at IS NOT NULL THEN 1 ELSE 0 END) totalCancelled,
      SUM(CASE WHEN ep.attendance_status='no_show' AND COALESCE(ep.response_status,'')<>'declined' THEN 1 ELSE 0 END) totalNoShow
    FROM evening_participants ep JOIN players p ON p.id=ep.player_id JOIN game_evenings e ON e.id=ep.evening_id
    WHERE ${MEMBER_SQL} AND e.status='completed' AND julianday(e.starts_at)>=julianday(?) AND julianday(e.starts_at)<julianday(?)`, [range.since, range.until]);
  const communication = await db.get<any>(`SELECT
    SUM(CASE WHEN t.first_sent_at IS NOT NULL THEN 1 ELSE 0 END) delivered,
    SUM(CASE WHEN t.first_sent_at IS NULL AND t.delivery_status='failed' THEN 1 ELSE 0 END) failed,
    SUM(CASE WHEN t.first_sent_at IS NOT NULL AND ep.response_status IN ('going','late','thinking','declined') THEN 1 ELSE 0 END) answered,
    SUM(CASE WHEN t.first_sent_at IS NOT NULL AND ep.response_status IN ('going','late') THEN 1 ELSE 0 END) positive,
    SUM(CASE WHEN t.first_sent_at IS NOT NULL AND ep.attendance_status='attended' AND e.status='completed' THEN 1 ELSE 0 END) attended,
    SUM(CASE WHEN t.reminder_count>0 THEN 1 ELSE 0 END) reminded
    FROM evening_announcement_dm_tracking t JOIN players p ON p.id=t.player_id JOIN game_evenings e ON e.id=t.evening_id
    LEFT JOIN evening_participants ep ON ep.evening_id=t.evening_id AND ep.player_id=t.player_id
    WHERE ${MEMBER_SQL} AND julianday(e.starts_at)>=julianday(?) AND julianday(e.starts_at)<julianday(?)`, [range.since, range.until]);
  const numeric = (values: Record<string, number | null>) => Object.fromEntries(Object.entries(values).map(([key,value]) => [key,value ?? 0]));
  return { ...numeric(row), ...numeric(participantStats), registrationBase: (participantStats.totalRegistrations || 0) + (participantStats.totalCancelled || 0), ...evenings, sourceBreakdown,
    communicationFunnel: numeric(communication), range, cohortRetention30dRate: row.cohortFirstVisits >= 5 ? row.cohortReturnedIn30Days / row.cohortFirstVisits * 100 : null };
}

export async function loadClubNow(db: DatabaseWrapper, owner: boolean, now = Date.now()) {
  const iso = new Date(now).toISOString();
  const today = await db.all<{ id: string; title: string; starts_at: string; status: string }>(`SELECT id,title,starts_at,status FROM game_evenings WHERE status NOT IN ('cancelled','draft') AND date(starts_at,'+3 hours')=date(?,'+3 hours') ORDER BY starts_at LIMIT 30`, [iso]);
  const next = await db.get<{ id: string; title: string; starts_at: string; status: string }>(`SELECT id,title,starts_at,status FROM game_evenings WHERE status NOT IN ('cancelled','draft','completed') AND julianday(starts_at)>julianday(?) ORDER BY starts_at LIMIT 1`, [iso]);
  const debts = owner ? await db.get<{ count: number }>(`SELECT COUNT(*) count FROM evening_participants ep JOIN game_evenings e ON e.id=ep.evening_id WHERE (e.status='completed' OR e.settled_at IS NOT NULL) AND ep.attendance_status='attended' AND ep.payment_status<>'waived' AND ep.amount_due>ep.amount_paid`) : null;
  return { today, next, ...(owner ? { openDebtCount: debts?.count || 0 } : {}), asOf: iso };
}

export async function loadClubFinance(db: DatabaseWrapper, range: AnalyticsRange) {
  const financialEvenings = `
    SELECT e.id, e.title, e.starts_at,
      COALESCE(SUM(CASE WHEN ep.payment_status<>'waived' THEN MAX(0,COALESCE(ep.amount_due,0)) ELSE 0 END),0) accrued,
      COALESCE(SUM(MAX(0,COALESCE(ep.amount_paid,0))),0) incomePaid,
      COALESCE(SUM(CASE WHEN ep.payment_status<>'waived' THEN MAX(0,COALESCE(ep.amount_due,0)-COALESCE(ep.amount_paid,0)) ELSE 0 END),0) outstandingDebt
    FROM game_evenings e LEFT JOIN evening_participants ep ON ep.evening_id=e.id AND ep.attendance_status='attended'
    WHERE (e.status='completed' OR e.settled_at IS NOT NULL) AND julianday(e.starts_at)>=julianday(?) AND julianday(e.starts_at)<julianday(?)
    GROUP BY e.id`;
  const params = [range.since, range.until];
  const totals = await db.get<any>(`WITH evenings AS (${financialEvenings}) SELECT COUNT(*) eveningCount, COALESCE(SUM(accrued),0) accrued, COALESCE(SUM(incomePaid),0) incomePaid, COALESCE(SUM(outstandingDebt),0) outstandingDebt FROM evenings`, params);
  const rows = await db.all<any>(`${financialEvenings} ORDER BY datetime(e.starts_at) DESC, e.id LIMIT 200`, params);
  const received = await db.get<any>(`SELECT COALESCE(SUM(amount),0) receivedInPeriod FROM financial_transactions WHERE type IN ('income','debt_paid') AND julianday(created_at)>=julianday(?) AND julianday(created_at)<julianday(?)`, [range.since, range.until]);
  return { ...totals, ...received, avgRevenuePerEvening: totals.eveningCount ? Math.round(totals.incomePaid / totals.eveningCount) : 0, evenings: rows, eveningsTruncated: totals.eveningCount > rows.length, range };
}
